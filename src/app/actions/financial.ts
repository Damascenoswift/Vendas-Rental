'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getProfile, hasFullAccess } from '@/lib/auth'

const transactionSchema = z.object({
    beneficiary_user_id: z.string().uuid(),
    type: z.enum([
        'comissao_venda',
        'bonus_recrutamento',
        'override_gestao',
        'comissao_dorata',
        'adiantamento',
        'despesa'
    ]),
    amount: z.coerce.number().positive('O valor deve ser positivo'),
    description: z.string().min(3, 'Descrição muito curta'),
    status: z.enum(['pendente', 'liberado', 'pago', 'cancelado']),
    due_date: z.string().optional(), // YYYY-MM-DD
    origin_lead_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
})

export type CreateTransactionState = {
    success: boolean
    message: string
    errors?: Record<string, string[]>
}

const sellerCommissionSchema = z.object({
    userId: z.string().uuid(),
    percent: z.coerce.number().min(0, 'Percentual inválido').max(100, 'Percentual inválido'),
})

const commissionPercentSchema = z.object({
    percent: z.coerce.number().min(0, 'Percentual inválido').max(100, 'Percentual inválido'),
})

type FinancialPermissionResult =
    | { userId: string }
    | { error: string }

async function checkFinancialPermission(): Promise<FinancialPermissionResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    if (!profile || (!hasFullAccess(role) && !['funcionario_n1', 'funcionario_n2'].includes(role ?? ''))) {
        return { error: 'Permissão negada.' }
    }

    return { userId: user.id }
}

export async function createTransaction(prevState: CreateTransactionState, formData: FormData): Promise<CreateTransactionState> {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false, message: permission.error }
    const supabase = await createClient()

    // 2. Validate Data
    const rawData = {
        beneficiary_user_id: formData.get('beneficiary_user_id'),
        type: formData.get('type'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        status: formData.get('status') || 'pendente',
        due_date: formData.get('due_date'),
        origin_lead_id: formData.get('origin_lead_id'),
    }

    const validated = transactionSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    // 3. Insert into DB
    const { error } = await supabase.from('financeiro_transacoes').insert({
        ...validated.data,
        origin_lead_id: validated.data.origin_lead_id || null,
        amount: validated.data.type === 'adiantamento' || validated.data.type === 'despesa'
            ? -validated.data.amount // Store as negative if debit? Or keep positive and handle in UI?
            : validated.data.amount,
        // Decision: Let's store Debits as NEGATIVE in the DB to make SUM() easier.
        // Wait, my previous plan said "Amount always positive".
        // Implementation detail change: Storing negative makes SQL Sum easier. I'll stick to that.
        created_by: permission.userId
    })

    if (error) {
        console.error('Erro financeiro:', error)
        return { success: false, message: 'Erro ao salvar transação.' }
    }

    revalidatePath('/admin/financeiro')
    return { success: true, message: 'Transação registrada com sucesso!' }
}

export async function getFinancialSummary() {
    const supabase = await createClient()

    // Simple fetch for listing
    const { data, error } = await supabase
        .from('financeiro_transacoes')
        .select(`
            id,
            created_at,
            due_date,
            origin_lead_id,
            beneficiary_user_id,
            amount,
            type,
            status,
            description,
            beneficiary:users!beneficiary_user_id(name, email),
            creator:users!created_by(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) {
        console.error(error)
        return []
    }

    return data
}

export async function upsertSellerRentalCommissionPercent(input: { userId: string; percent: number }) {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false as const, message: permission.error }

    const parsed = sellerCommissionSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, message: 'Dados inválidos para percentual do vendedor.' }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { userId, percent } = parsed.data

    const { data: seller } = await (supabaseAdmin as any)
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .maybeSingle()

    const sellerName = seller?.name || seller?.email || userId
    const ruleKey = `rental_commission_percent_user_${userId}`

    const { error } = await (supabaseAdmin as any)
        .from('pricing_rules')
        .upsert({
            name: `Percentual comissão Rental - ${sellerName}`,
            key: ruleKey,
            value: Number(percent),
            unit: '%',
            description: 'Percentual de comissão Rental específico do vendedor',
            active: true,
        }, { onConflict: 'key' })

    if (error) {
        console.error('Erro ao salvar comissão por vendedor:', error)
        return { success: false as const, message: 'Erro ao salvar comissão por vendedor.' }
    }

    revalidatePath('/admin/financeiro')
    return { success: true as const, message: 'Comissão do vendedor atualizada.' }
}

export async function upsertRentalDefaultCommissionPercent(input: { percent: number }) {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false as const, message: permission.error }

    const parsed = commissionPercentSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, message: 'Percentual padrão inválido.' }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { error } = await (supabaseAdmin as any)
        .from('pricing_rules')
        .upsert({
            name: 'Percentual comissão Rental (padrão)',
            key: 'rental_default_commission_percent',
            value: Number(parsed.data.percent),
            unit: '%',
            description: 'Percentual padrão de comissão Rental aplicado quando não houver regra por vendedor',
            active: true,
        }, { onConflict: 'key' })

    if (error) {
        console.error('Erro ao salvar comissão padrão Rental:', error)
        return { success: false as const, message: 'Erro ao salvar comissão padrão Rental.' }
    }

    revalidatePath('/admin/financeiro')
    return { success: true as const, message: 'Comissão padrão Rental atualizada.' }
}

export async function upsertRentalManagerOverridePercent(input: { percent: number }) {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false as const, message: permission.error }

    const parsed = commissionPercentSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, message: 'Percentual de override inválido.' }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { error } = await (supabaseAdmin as any)
        .from('pricing_rules')
        .upsert({
            name: 'Percentual override gestor Rental',
            key: 'rental_manager_override_percent',
            value: Number(parsed.data.percent),
            unit: '%',
            description: 'Percentual de override do gestor comercial sobre vendas Rental de outros vendedores',
            active: true,
        }, { onConflict: 'key' })

    if (error) {
        console.error('Erro ao salvar override do gestor:', error)
        return { success: false as const, message: 'Erro ao salvar override do gestor.' }
    }

    revalidatePath('/admin/financeiro')
    return { success: true as const, message: 'Override do gestor atualizado.' }
}
