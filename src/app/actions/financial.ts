'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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
})

export type CreateTransactionState = {
    success: boolean
    message: string
    errors?: Record<string, string[]>
}

export async function createTransaction(prevState: CreateTransactionState, formData: FormData): Promise<CreateTransactionState> {
    const supabase = await createClient()

    // 1. Check Auth & Permissions using existing User/Profile patterns
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Não autenticado' }

    // Check if admin
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile.role)) {
        return { success: false, message: 'Permissão negada.' }
    }

    // 2. Validate Data
    const rawData = {
        beneficiary_user_id: formData.get('beneficiary_user_id'),
        type: formData.get('type'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        status: formData.get('status') || 'pendente',
        due_date: formData.get('due_date'),
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
        amount: validated.data.type === 'adiantamento' || validated.data.type === 'despesa'
            ? -validated.data.amount // Store as negative if debit? Or keep positive and handle in UI?
            : validated.data.amount,
        // Decision: Let's store Debits as NEGATIVE in the DB to make SUM() easier.
        // Wait, my previous plan said "Amount always positive".
        // Implementation detail change: Storing negative makes SQL Sum easier. I'll stick to that.
        created_by: user.id
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
