'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getProfile, hasFullAccess } from '@/lib/auth'
import { hasSalesAccess } from '@/lib/sales-access'

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

const dorataSaleCommissionSchema = z.object({
    saleId: z.string().uuid(),
    percent: z.coerce.number().min(0, 'Percentual inválido').max(100, 'Percentual inválido'),
})

const commissionPercentSchema = z.object({
    percent: z.coerce.number().min(0, 'Percentual inválido').max(100, 'Percentual inválido'),
})

type FinancialPermissionResult =
    | { userId: string }
    | { error: string }

function parseMissingColumnError(message?: string | null) {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null
    return { column: match[1], table: match[2] }
}

async function upsertPricingRuleWithFallback(
    supabaseAdmin: any,
    payload: Record<string, unknown>
) {
    const candidate: Record<string, unknown> = { ...payload }
    const onConflictRegex = /no unique or exclusion constraint matching the ON CONFLICT specification/i

    while (true) {
        const { error } = await supabaseAdmin
            .from('pricing_rules')
            .upsert(candidate, { onConflict: 'key' })

        if (!error) return null

        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn && missingColumn.table === 'pricing_rules' && missingColumn.column in candidate) {
            delete candidate[missingColumn.column]
            continue
        }

        if (!onConflictRegex.test(error.message ?? '')) {
            return error
        }

        const { data: existing, error: findError } = await supabaseAdmin
            .from('pricing_rules')
            .select('id')
            .eq('key', String(candidate.key))
            .maybeSingle()

        if (findError) return findError

        if (existing?.id) {
            const { error: updateError } = await supabaseAdmin
                .from('pricing_rules')
                .update(candidate)
                .eq('id', existing.id)
            return updateError ?? null
        }

        const { error: insertError } = await supabaseAdmin
            .from('pricing_rules')
            .insert(candidate)
        return insertError ?? null
    }
}

async function checkFinancialPermission(): Promise<FinancialPermissionResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado' }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    const department = profile?.department ?? null
    if (
        !profile ||
        (
            !hasFullAccess(role, department) &&
            !['funcionario_n1', 'funcionario_n2'].includes(role ?? '') &&
            department !== 'financeiro'
        )
    ) {
        return { error: 'Permissão negada.' }
    }

    return { userId: user.id }
}

async function getSalesEligibilityMap(supabaseAdmin: any, userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    if (uniqueUserIds.length === 0) return new Map<string, boolean>()

    const selectResult = await supabaseAdmin
        .from('users')
        .select('id, role, sales_access')
        .in('id', uniqueUserIds)
    let data = selectResult.data
    const selectError = selectResult.error

    const missingSalesAccessColumn =
        selectError &&
        /could not find the 'sales_access' column/i.test(selectError.message ?? '')

    if (missingSalesAccessColumn) {
        const fallback = await supabaseAdmin
            .from('users')
            .select('id, role')
            .in('id', uniqueUserIds)
        data = fallback.data
    }

    const map = new Map<string, boolean>()
    for (const row of (data ?? []) as Array<{ id: string; role?: string | null; sales_access?: boolean | null }>) {
        map.set(row.id, hasSalesAccess(row))
    }

    return map
}

const closureSelectableTypeSchema = z.enum([
    'comissao_venda',
    'comissao_dorata',
    'override_gestao',
])

const closeableItemSchema = z.object({
    source_kind: z.enum(['rental_sistema', 'dorata_sistema', 'manual_elyakim']),
    source_ref_id: z.string().min(1, 'Origem inválida'),
    brand: z.enum(['rental', 'dorata']),
    beneficiary_user_id: z.string().uuid('Beneficiário inválido'),
    transaction_type: closureSelectableTypeSchema,
    amount: z.coerce.number().positive('Valor inválido'),
    description: z.string().max(500).optional().nullable(),
    origin_lead_id: z.union([z.string().uuid(), z.null()]).optional(),
    client_name: z.string().max(200).optional().nullable(),
})

const createManualItemSchema = z.object({
    competencia: z.string().min(7, 'Competência obrigatória'),
    beneficiary_user_id: z.string().uuid('Beneficiário inválido'),
    brand: z.enum(['rental', 'dorata']).default('rental'),
    transaction_type: closureSelectableTypeSchema.default('comissao_venda'),
    client_name: z.string().min(2, 'Cliente obrigatório').max(200),
    amount: z.coerce.number().positive('Valor deve ser positivo'),
    origin_lead_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
    external_ref: z.string().max(200).optional().nullable(),
    observacao: z.string().max(500).optional().nullable(),
})

function normalizeCompetenciaDate(value?: string | null) {
    const fallback = new Date().toISOString().slice(0, 10)
    if (!value) return `${fallback.slice(0, 7)}-01`
    const raw = value.trim()
    if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    return `${fallback.slice(0, 7)}-01`
}

function normalizeDate(value?: string | null) {
    const fallback = new Date().toISOString().slice(0, 10)
    if (!value) return fallback
    const raw = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    return fallback
}

async function buildClosureCode(supabaseAdmin: any, competenciaDate: string) {
    const yearMonth = competenciaDate.slice(0, 7).replace('-', '')
    const prefix = `FECH-${yearMonth}`

    const { count, error } = await supabaseAdmin
        .from('financeiro_fechamentos')
        .select('id', { count: 'exact', head: true })
        .like('codigo', `${prefix}-%`)

    if (error) {
        return `${prefix}-${Date.now().toString().slice(-6)}`
    }

    const next = (count ?? 0) + 1
    return `${prefix}-${String(next).padStart(4, '0')}`
}

export async function closeCommissionBatchFromForm(formData: FormData): Promise<void> {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return

    const rawSelected = formData.getAll('selected_items')
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)

    if (rawSelected.length === 0) {
        return
    }

    const decodedItems: Array<z.infer<typeof closeableItemSchema>> = []
    for (const encoded of rawSelected) {
        try {
            const parsedJson = JSON.parse(decodeURIComponent(encoded))
            const parsedItem = closeableItemSchema.safeParse(parsedJson)
            if (!parsedItem.success) {
                return
            }
            decodedItems.push(parsedItem.data)
        } catch {
            return
        }
    }

    const competencia = normalizeCompetenciaDate(formData.get('competencia')?.toString() ?? null)
    const paymentDate = normalizeDate(formData.get('payment_date')?.toString() ?? null)
    const observacaoRaw = formData.get('observacao')?.toString().trim()
    const observacao = observacaoRaw && observacaoRaw.length > 0 ? observacaoRaw : null

    const totalValor = decodedItems.reduce((sum, item) => sum + Number(item.amount), 0)
    const supabaseAdmin = createSupabaseServiceClient()
    const salesEligibility = await getSalesEligibilityMap(
        supabaseAdmin,
        decodedItems.map((item) => item.beneficiary_user_id)
    )
    const hasIneligibleBeneficiary = decodedItems.some((item) => !salesEligibility.get(item.beneficiary_user_id))
    if (hasIneligibleBeneficiary) {
        return
    }

    const codigo = await buildClosureCode(supabaseAdmin, competencia)
    const { data: fechamento, error: fechamentoError } = await supabaseAdmin
        .from('financeiro_fechamentos')
        .insert({
            codigo,
            competencia,
            status: 'fechado',
            total_itens: decodedItems.length,
            total_valor: totalValor,
            fechado_em: new Date().toISOString(),
            fechado_por: permission.userId,
            observacao,
        })
        .select('id')
        .single()

    if (fechamentoError || !fechamento?.id) {
        console.error('Erro ao criar fechamento financeiro:', fechamentoError)
        return
    }

    const fechamentoItemsPayload = decodedItems.map((item) => ({
        fechamento_id: fechamento.id,
        brand: item.brand,
        beneficiary_user_id: item.beneficiary_user_id,
        transaction_type: item.transaction_type,
        source_kind: item.source_kind,
        source_ref_id: item.source_ref_id,
        origin_lead_id: item.origin_lead_id ?? null,
        descricao: item.description ?? null,
        valor_liberado: Number(item.amount),
        valor_pago: Number(item.amount),
        pagamento_em: paymentDate,
        snapshot: {
            client_name: item.client_name ?? null,
            closed_by: permission.userId,
        },
    }))

    const { data: insertedItems, error: fechamentoItemsError } = await supabaseAdmin
        .from('financeiro_fechamento_itens')
        .insert(fechamentoItemsPayload)
        .select('id, source_kind, source_ref_id')

    if (fechamentoItemsError) {
        console.error('Erro ao inserir itens do fechamento:', fechamentoItemsError)
        await supabaseAdmin
            .from('financeiro_fechamentos')
            .update({ status: 'cancelado' })
            .eq('id', fechamento.id)
        return
    }

    const transacoesPayload = decodedItems.map((item) => ({
        beneficiary_user_id: item.beneficiary_user_id,
        origin_lead_id: item.origin_lead_id ?? null,
        type: item.transaction_type,
        amount: Number(item.amount),
        description: item.description || `Fechamento ${codigo}`,
        status: 'pago',
        due_date: paymentDate,
        created_by: permission.userId,
    }))

    const { error: transacoesError } = await supabaseAdmin
        .from('financeiro_transacoes')
        .insert(transacoesPayload)

    if (transacoesError) {
        console.error('Erro ao registrar transações do fechamento:', transacoesError)
        await supabaseAdmin
            .from('financeiro_fechamentos')
            .update({ status: 'cancelado' })
            .eq('id', fechamento.id)
        return
    }

    const manualInserted = insertedItems?.filter((item: any) => item.source_kind === 'manual_elyakim') ?? []
    if (manualInserted.length > 0) {
        const manualIds = manualInserted.map((item: any) => item.source_ref_id)
        const closureItemIdByManualId = new Map<string, string>()
        for (const item of manualInserted) {
            closureItemIdByManualId.set(item.source_ref_id as string, item.id as string)
        }

        for (const manualId of manualIds) {
            const fechamentoItemId = closureItemIdByManualId.get(manualId) ?? null
            const { error: manualUpdateError } = await supabaseAdmin
                .from('financeiro_relatorios_manuais_itens')
                .update({
                    status: 'pago',
                    paid_at: new Date().toISOString(),
                    fechamento_item_id: fechamentoItemId,
                })
                .eq('id', manualId)

            if (manualUpdateError) {
                console.error('Erro ao atualizar item manual após fechamento:', manualUpdateError)
            }
        }
    }

    revalidatePath('/admin/financeiro')
    return
}

export async function createManualElyakimItemFromForm(formData: FormData): Promise<void> {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return

    const parsed = createManualItemSchema.safeParse({
        competencia: formData.get('competencia'),
        beneficiary_user_id: formData.get('beneficiary_user_id'),
        brand: formData.get('brand') ?? 'rental',
        transaction_type: formData.get('transaction_type') ?? 'comissao_venda',
        client_name: formData.get('client_name'),
        amount: formData.get('amount'),
        origin_lead_id: formData.get('origin_lead_id'),
        external_ref: formData.get('external_ref'),
        observacao: formData.get('observacao'),
    })

    if (!parsed.success) {
        return
    }

    const competencia = normalizeCompetenciaDate(parsed.data.competencia)
    const supabaseAdmin = createSupabaseServiceClient()
    const salesEligibility = await getSalesEligibilityMap(supabaseAdmin, [parsed.data.beneficiary_user_id])
    if (!salesEligibility.get(parsed.data.beneficiary_user_id)) {
        return
    }

    const { data: existingReport } = await supabaseAdmin
        .from('financeiro_relatorios_manuais')
        .select('id')
        .eq('fonte', 'elyakim')
        .eq('competencia', competencia)
        .eq('status', 'liberado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    let reportId = existingReport?.id ?? null
    if (!reportId) {
        const { data: reportInserted, error: reportError } = await supabaseAdmin
            .from('financeiro_relatorios_manuais')
            .insert({
                fonte: 'elyakim',
                competencia,
                status: 'liberado',
                created_by: permission.userId,
                observacao: parsed.data.observacao ?? null,
            })
            .select('id')
            .single()

        if (reportError || !reportInserted?.id) {
            console.error('Erro ao criar cabeçalho de relatório Elyakim:', reportError)
            return
        }
        reportId = reportInserted.id
    }

    const { error: itemError } = await supabaseAdmin
        .from('financeiro_relatorios_manuais_itens')
        .insert({
            report_id: reportId,
            beneficiary_user_id: parsed.data.beneficiary_user_id,
            brand: parsed.data.brand,
            transaction_type: parsed.data.transaction_type,
            client_name: parsed.data.client_name,
            origin_lead_id: parsed.data.origin_lead_id || null,
            valor: Number(parsed.data.amount),
            status: 'liberado',
            external_ref: parsed.data.external_ref ?? null,
            observacao: parsed.data.observacao ?? null,
            created_by: permission.userId,
        })

    if (itemError) {
        console.error('Erro ao criar item manual Elyakim:', itemError)
        return
    }

    revalidatePath('/admin/financeiro')
    return
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

    const supabaseAdmin = createSupabaseServiceClient()
    const salesEligibility = await getSalesEligibilityMap(supabaseAdmin, [validated.data.beneficiary_user_id])
    if (!salesEligibility.get(validated.data.beneficiary_user_id)) {
        return { success: false, message: 'Beneficiário sem acesso a vendas/comissão.' }
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

export async function upsertDorataSaleCommissionPercent(input: { saleId: string; percent: number }) {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false as const, message: permission.error }

    const parsed = dorataSaleCommissionSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, message: 'Dados inválidos para percentual da venda Dorata.' }
    }

    const { saleId, percent } = parsed.data

    const sessionClient = await createClient()
    const { data: proposal } = await sessionClient
        .from('proposals')
        .select('id, cliente:indicacoes(id, nome, marca)')
        .eq('id', saleId)
        .maybeSingle()

    const proposalClient = proposal
        ? (Array.isArray((proposal as Record<string, unknown>).cliente)
            ? ((proposal as Record<string, unknown>).cliente as Array<Record<string, unknown>>)[0]
            : (proposal as Record<string, unknown>).cliente) as Record<string, unknown> | null
        : null

    const validProposalDorata =
        Boolean(proposal?.id) &&
        String(proposalClient?.marca ?? '').toLowerCase() === 'dorata'

    const { data: indication } = await sessionClient
        .from('indicacoes')
        .select('id, nome, marca')
        .eq('id', saleId)
        .maybeSingle()

    const validIndicationDorata = Boolean(indication?.id) && String(indication.marca ?? '').toLowerCase() === 'dorata'
    if (!validProposalDorata && !validIndicationDorata) {
        return { success: false as const, message: 'Venda Dorata não encontrada para esse identificador.' }
    }

    const clientName =
        (proposalClient?.nome as string | null) ??
        (indication?.nome as string | null) ??
        saleId
    const rulePayload = {
        name: `Percentual comissão Dorata - ${clientName}`,
        key: `dorata_commission_percent_sale_${saleId}`,
        value: Number(percent),
        unit: '%',
        description: 'Percentual de comissão Dorata específico por venda/cliente',
        active: true,
    }

    let lastError: { message?: string | null } | null = null
    try {
        const supabaseAdmin = createSupabaseServiceClient()
        lastError = await upsertPricingRuleWithFallback(supabaseAdmin, rulePayload)
    } catch (error) {
        console.error('Erro ao inicializar cliente admin para financeiro:', error)
        lastError = { message: 'cliente admin indisponível' }
    }

    if (lastError) {
        const sessionError = await upsertPricingRuleWithFallback(sessionClient as any, rulePayload)
        if (!sessionError) {
            revalidatePath('/admin/financeiro')
            return { success: true as const, message: 'Comissão individual de venda Dorata atualizada.' }
        }
        lastError = sessionError
    }

    if (lastError) {
        console.error('Erro ao salvar comissão individual por cliente:', lastError)
        return {
            success: false as const,
            message: `Erro ao salvar comissão individual: ${lastError.message ?? 'falha desconhecida'}`,
        }
    }

    revalidatePath('/admin/financeiro')
    return { success: true as const, message: 'Comissão individual de venda Dorata atualizada.' }
}

export async function upsertSellerRentalCommissionPercent(input: { userId: string; percent: number }) {
    const permission = await checkFinancialPermission()
    if ('error' in permission) return { success: false as const, message: permission.error }

    const parsed = sellerCommissionSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, message: 'Dados inválidos para percentual do vendedor.' }
    }

    const { userId, percent } = parsed.data

    const sessionClient = await createClient()
    const { data: seller } = await sessionClient
        .from('users')
        .select('name, email, role, sales_access')
        .eq('id', userId)
        .maybeSingle()

    if (!seller || !hasSalesAccess(seller as { role?: string | null; sales_access?: boolean | null })) {
        return { success: false as const, message: 'Usuário sem acesso a vendas/comissão.' }
    }

    const sellerName = seller?.name || seller?.email || userId
    const ruleKey = `rental_commission_percent_user_${userId}`

    const rulePayload = {
        name: `Percentual comissão Rental - ${sellerName}`,
        key: ruleKey,
        value: Number(percent),
        unit: '%',
        description: 'Percentual de comissão Rental específico do vendedor',
        active: true,
    }

    let lastError: { message?: string | null } | null = null
    try {
        const supabaseAdmin = createSupabaseServiceClient()
        lastError = await upsertPricingRuleWithFallback(supabaseAdmin, rulePayload)
    } catch (error) {
        console.error('Erro ao inicializar cliente admin para financeiro:', error)
        lastError = { message: 'cliente admin indisponível' }
    }

    if (lastError) {
        const sessionError = await upsertPricingRuleWithFallback(sessionClient as any, rulePayload)
        if (!sessionError) {
            revalidatePath('/admin/financeiro')
            return { success: true as const, message: 'Comissão do vendedor atualizada.' }
        }
        lastError = sessionError
    }

    if (lastError) {
        console.error('Erro ao salvar comissão por vendedor:', lastError)
        return {
            success: false as const,
            message: `Erro ao salvar comissão por vendedor: ${lastError.message ?? 'falha desconhecida'}`,
        }
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

    const rulePayload = {
        name: 'Percentual comissão Rental (padrão)',
        key: 'rental_default_commission_percent',
        value: Number(parsed.data.percent),
        unit: '%',
        description: 'Percentual padrão de comissão Rental aplicado quando não houver regra por vendedor',
        active: true,
    }

    const sessionClient = await createClient()
    let lastError: { message?: string | null } | null = null
    try {
        const supabaseAdmin = createSupabaseServiceClient()
        lastError = await upsertPricingRuleWithFallback(supabaseAdmin, rulePayload)
    } catch (error) {
        console.error('Erro ao inicializar cliente admin para financeiro:', error)
        lastError = { message: 'cliente admin indisponível' }
    }

    if (lastError) {
        const sessionError = await upsertPricingRuleWithFallback(sessionClient as any, rulePayload)
        if (!sessionError) {
            revalidatePath('/admin/financeiro')
            return { success: true as const, message: 'Comissão padrão Rental atualizada.' }
        }
        lastError = sessionError
    }

    if (lastError) {
        console.error('Erro ao salvar comissão padrão Rental:', lastError)
        return {
            success: false as const,
            message: `Erro ao salvar comissão padrão Rental: ${lastError.message ?? 'falha desconhecida'}`,
        }
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

    const rulePayload = {
        name: 'Percentual override gestor Rental',
        key: 'rental_manager_override_percent',
        value: Number(parsed.data.percent),
        unit: '%',
        description: 'Percentual de override do gestor comercial sobre vendas Rental de outros vendedores',
        active: true,
    }

    const sessionClient = await createClient()
    let lastError: { message?: string | null } | null = null
    try {
        const supabaseAdmin = createSupabaseServiceClient()
        lastError = await upsertPricingRuleWithFallback(supabaseAdmin, rulePayload)
    } catch (error) {
        console.error('Erro ao inicializar cliente admin para financeiro:', error)
        lastError = { message: 'cliente admin indisponível' }
    }

    if (lastError) {
        const sessionError = await upsertPricingRuleWithFallback(sessionClient as any, rulePayload)
        if (!sessionError) {
            revalidatePath('/admin/financeiro')
            return { success: true as const, message: 'Override do gestor atualizado.' }
        }
        lastError = sessionError
    }

    if (lastError) {
        console.error('Erro ao salvar override do gestor:', lastError)
        return {
            success: false as const,
            message: `Erro ao salvar override do gestor: ${lastError.message ?? 'falha desconhecida'}`,
        }
    }

    revalidatePath('/admin/financeiro')
    return { success: true as const, message: 'Override do gestor atualizado.' }
}
