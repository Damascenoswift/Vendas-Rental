'use server'

import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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
    const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (schemaCacheMatch) {
        return { column: schemaCacheMatch[1], table: schemaCacheMatch[2] }
    }

    const relationMatch = message.match(/column "([^"]+)" of relation "([^"]+)" does not exist/i)
    if (relationMatch) {
        return { column: relationMatch[1], table: relationMatch[2] }
    }

    return null
}

function extractErrorMessage(error: unknown) {
    if (!error) return null
    if (typeof error === 'string') return error
    if (typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return null
}

function isMissingRelationError(message?: string | null, relation?: string) {
    if (!message || !relation) return false
    const escapedRelation = relation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`relation ["']?${escapedRelation}["']? does not exist`, 'i')
    return regex.test(message)
}

function isClosureSchemaUnavailableError(error: unknown) {
    const message = extractErrorMessage(error)
    const missingColumn = parseMissingColumnError(message)
    if (
        missingColumn &&
        (missingColumn.table === 'financeiro_fechamentos' || missingColumn.table === 'financeiro_fechamento_itens')
    ) {
        return true
    }

    return (
        isMissingRelationError(message, 'financeiro_fechamentos') ||
        isMissingRelationError(message, 'financeiro_fechamento_itens')
    )
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

type DorataSaleReference = {
    isValid: boolean
    clientName: string | null
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
}

function firstRelationRow(value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        return toRecord(value[0] ?? null)
    }
    return toRecord(value)
}

async function resolveDorataSaleReference(
    supabaseClient: any,
    saleId: string
): Promise<DorataSaleReference> {
    const [proposalResult, indicationResult] = await Promise.all([
        supabaseClient
            .from('proposals')
            .select('id, cliente:indicacoes!proposals_client_id_fkey(id, nome, marca)')
            .eq('id', saleId)
            .maybeSingle(),
        supabaseClient
            .from('indicacoes')
            .select('id, nome, marca')
            .eq('id', saleId)
            .maybeSingle(),
    ])

    const proposal = proposalResult.data
    const proposalRow = toRecord(proposal)
    const proposalClient = firstRelationRow(proposalRow?.cliente)
    const proposalBrand = String(proposalClient?.marca ?? '').toLowerCase()
    if (proposalRow?.id && proposalBrand === 'dorata') {
        return {
            isValid: true,
            clientName: (proposalClient?.nome as string | null) ?? null,
        }
    }

    const indication = indicationResult.data
    const indicationRow = toRecord(indication)
    const indicationBrand = String(indicationRow?.marca ?? '').toLowerCase()
    if (indicationRow?.id && indicationBrand === 'dorata') {
        return {
            isValid: true,
            clientName: (indicationRow?.nome as string | null) ?? null,
        }
    }

    return { isValid: false, clientName: null }
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

const closureBatchTransactionTypeSchema = z.enum([
    'comissao_venda',
    'comissao_dorata',
    'override_gestao',
    'despesa',
])

const closeableItemSchema = z.object({
    source_kind: z.enum(['rental_sistema', 'dorata_sistema', 'manual_elyakim']),
    source_ref_id: z.string().min(1, 'Origem inválida'),
    brand: z.enum(['rental', 'dorata']),
    beneficiary_user_id: z.string().uuid('Beneficiário inválido'),
    transaction_type: closureBatchTransactionTypeSchema,
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

function parseDecimalFormValue(value: FormDataEntryValue | null | undefined) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : Number.NaN
    }

    const raw = String(value ?? '').trim()
    if (!raw) return Number.NaN

    const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : Number.NaN
}

function buildFinancialRedirect(params: {
    tab: 'previsoes' | 'liberado' | 'historico'
    seller?: string | null
    status?: string | null
    error?: string | null
    detail?: string | null
}) {
    const search = new URLSearchParams()
    search.set('tab', params.tab)

    if (params.seller && params.seller !== 'all') {
        search.set('seller', params.seller)
    }

    if (params.status) {
        search.set('status', params.status)
    }

    if (params.error) {
        search.set('error', params.error)
    }

    if (params.detail) {
        search.set('detail', params.detail.slice(0, 240))
    }

    const query = search.toString()
    return query ? `/admin/financeiro?${query}` : '/admin/financeiro'
}

async function buildClosureCode(supabaseAdmin: any, competenciaDate: string) {
    const yearMonth = competenciaDate.slice(0, 7).replace('-', '')
    const prefix = `FECH-${yearMonth}`

    const { data, error } = await supabaseAdmin
        .from('financeiro_fechamentos')
        .select('codigo')
        .like('codigo', `${prefix}-%`)

    if (error) {
        return `${prefix}-${Date.now().toString().slice(-6)}`
    }

    const next = (data ?? []).reduce((max: number, row: { codigo?: string | null }) => {
        const code = String(row.codigo ?? '')
        if (!code.startsWith(`${prefix}-`)) return max

        const parsed = Number(code.slice(prefix.length + 1))
        if (!Number.isInteger(parsed) || parsed <= 0) return max
        return Math.max(max, parsed)
    }, 0) + 1

    return `${prefix}-${String(next).padStart(4, '0')}`
}

async function createClosingRecord(params: {
    supabaseAdmin: any
    competencia: string
    totalItens: number
    totalValor: number
    fechadoPor: string
    observacao: string | null
}) {
    let codigo = await buildClosureCode(params.supabaseAdmin, params.competencia)
    const optionalColumns = new Set(["updated_at", "observacao", "fechado_por", "fechado_em"])

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const excludedColumns = new Set<string>()

        while (true) {
            const payload: Record<string, unknown> = {
                codigo,
                competencia: params.competencia,
                status: 'fechado',
                total_itens: params.totalItens,
                total_valor: params.totalValor,
                fechado_em: new Date().toISOString(),
                fechado_por: params.fechadoPor,
                observacao: params.observacao,
                updated_at: new Date().toISOString(),
            }

            excludedColumns.forEach((column) => {
                delete payload[column]
            })

            const result = await params.supabaseAdmin
                .from('financeiro_fechamentos')
                .insert(payload)
                .select('id')
                .single()

            if (!result.error && result.data?.id) {
                return result
            }

            const missingColumn = parseMissingColumnError(result.error?.message)
            if (missingColumn && missingColumn.table === 'financeiro_fechamentos' && optionalColumns.has(missingColumn.column)) {
                excludedColumns.add(missingColumn.column)
                continue
            }

            const isDuplicateCodeError =
                /duplicate key value violates unique constraint/i.test(result.error?.message ?? '') &&
                /codigo/i.test(result.error?.message ?? '')

            if (attempt === 0 && isDuplicateCodeError) {
                codigo = await buildClosureCode(params.supabaseAdmin, params.competencia)
                break
            }

            return result
        }
    }

    return {
        data: null,
        error: { message: 'Falha ao criar fechamento financeiro.' },
    }
}

function buildTransactionsPayload(params: {
    items: Array<z.infer<typeof closeableItemSchema>>
    paymentDate: string
    createdBy: string
    fallbackLabel: string
}) {
    return params.items.map((item) => ({
        beneficiary_user_id: item.beneficiary_user_id,
        origin_lead_id: item.origin_lead_id ?? null,
        type: item.transaction_type,
        amount: item.transaction_type === 'despesa'
            ? -Number(item.amount)
            : Number(item.amount),
        description: item.description || params.fallbackLabel,
        status: 'pago',
        due_date: params.paymentDate,
        created_by: params.createdBy,
    }))
}

async function insertFinancialTransactions(params: {
    supabaseAdmin: any
    items: Array<z.infer<typeof closeableItemSchema>>
    paymentDate: string
    createdBy: string
    fallbackLabel: string
}) {
    const transacoesPayload = buildTransactionsPayload(params)
    return params.supabaseAdmin
        .from('financeiro_transacoes')
        .insert(transacoesPayload)
}

export async function closeCommissionBatchFromForm(formData: FormData): Promise<void> {
    const seller = formData.get('return_seller')?.toString().trim() ?? ''
    const permission = await checkFinancialPermission()
    if ('error' in permission) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'permission' }))
    }

    const rawSelected = formData.getAll('selected_items')
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)

    if (rawSelected.length === 0) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'no-items' }))
    }

    const decodedItems: Array<z.infer<typeof closeableItemSchema>> = []
    for (const encoded of rawSelected) {
        try {
            const parsedJson = JSON.parse(decodeURIComponent(encoded))
            const parsedItem = closeableItemSchema.safeParse(parsedJson)
            if (!parsedItem.success) {
                redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-selection' }))
            }
            decodedItems.push(parsedItem.data)
        } catch {
            redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-selection' }))
        }
    }

    const expenseBeneficiary = formData.get('expense_beneficiary_user_id')?.toString().trim() ?? ''
    const expenseBrand = formData.get('expense_brand')?.toString().trim() ?? ''
    const expenseDescription = formData.get('expense_description')?.toString().trim() ?? ''
    const applyExpense = formData.get('apply_expense')?.toString() === '1'

    if (applyExpense) {
        const expenseAmount = parseDecimalFormValue(formData.get('expense_amount'))
        if (
            !expenseBeneficiary ||
            !expenseDescription ||
            !expenseBrand ||
            !Number.isFinite(expenseAmount) ||
            expenseAmount <= 0
        ) {
            redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-expense' }))
        }

        const normalizedBrand = expenseBrand === 'dorata' ? 'dorata' : 'rental'
        decodedItems.push({
            source_kind: normalizedBrand === 'dorata' ? 'dorata_sistema' : 'rental_sistema',
            source_ref_id: `manual_expense:${crypto.randomUUID()}`,
            brand: normalizedBrand,
            beneficiary_user_id: expenseBeneficiary,
            transaction_type: 'despesa',
            amount: Number(expenseAmount.toFixed(2)),
            description: `Despesa fechamento - ${expenseDescription}`,
            origin_lead_id: null,
            client_name: 'Despesa financeira',
        })
    }

    const competencia = normalizeCompetenciaDate(formData.get('competencia')?.toString() ?? null)
    const paymentDate = normalizeDate(formData.get('payment_date')?.toString() ?? null)
    const observacaoRaw = formData.get('observacao')?.toString().trim()
    const observacao = observacaoRaw && observacaoRaw.length > 0 ? observacaoRaw : null
    const fallbackTransactionLabel = `Fechamento ${competencia}`

    const totalCredits = decodedItems
        .filter((item) => item.transaction_type !== 'despesa')
        .reduce((sum, item) => sum + Number(item.amount), 0)
    const totalDiscounts = decodedItems
        .filter((item) => item.transaction_type === 'despesa')
        .reduce((sum, item) => sum + Number(item.amount), 0)
    const totalValor = Number((totalCredits - totalDiscounts).toFixed(2))
    if (totalValor < 0) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'negative-total' }))
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const salesEligibility = await getSalesEligibilityMap(
        supabaseAdmin,
        decodedItems.map((item) => item.beneficiary_user_id)
    )
    const hasIneligibleBeneficiary = decodedItems.some((item) => !salesEligibility.get(item.beneficiary_user_id))
    if (hasIneligibleBeneficiary) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-beneficiary' }))
    }

    const { data: fechamento, error: fechamentoError } = await createClosingRecord({
        supabaseAdmin,
        competencia,
        totalItens: decodedItems.length,
        totalValor,
        fechadoPor: permission.userId,
        observacao,
    })

    if (fechamentoError || !fechamento?.id) {
        console.error('Erro ao criar fechamento financeiro:', fechamentoError)

        if (
            isClosureSchemaUnavailableError(fechamentoError) &&
            !decodedItems.some((item) => item.source_kind === 'manual_elyakim')
        ) {
            const { error: fallbackTransactionsError } = await insertFinancialTransactions({
                supabaseAdmin,
                items: decodedItems,
                paymentDate,
                createdBy: permission.userId,
                fallbackLabel: fallbackTransactionLabel,
            })

            if (fallbackTransactionsError) {
                console.error('Erro ao registrar transações em fallback do fechamento:', fallbackTransactionsError)
                redirect(buildFinancialRedirect({
                    tab: 'liberado',
                    seller,
                    error: 'closing-create-failed',
                    detail: extractErrorMessage(fallbackTransactionsError),
                }))
            }

            revalidatePath('/admin/financeiro')
            redirect(buildFinancialRedirect({ tab: 'liberado', seller, status: 'closing-created-no-history' }))
        }

        redirect(buildFinancialRedirect({
            tab: 'liberado',
            seller,
            error: 'closing-create-failed',
            detail: extractErrorMessage(fechamentoError),
        }))
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

        if (
            isClosureSchemaUnavailableError(fechamentoItemsError) &&
            !decodedItems.some((item) => item.source_kind === 'manual_elyakim')
        ) {
            const { error: fallbackTransactionsError } = await insertFinancialTransactions({
                supabaseAdmin,
                items: decodedItems,
                paymentDate,
                createdBy: permission.userId,
                fallbackLabel: fallbackTransactionLabel,
            })

            if (fallbackTransactionsError) {
                console.error('Erro ao registrar transações após falha de itens do fechamento:', fallbackTransactionsError)
                redirect(buildFinancialRedirect({
                    tab: 'liberado',
                    seller,
                    error: 'closing-items-failed',
                    detail: extractErrorMessage(fallbackTransactionsError),
                }))
            }

            revalidatePath('/admin/financeiro')
            redirect(buildFinancialRedirect({ tab: 'liberado', seller, status: 'closing-created-no-history' }))
        }

        redirect(buildFinancialRedirect({
            tab: 'liberado',
            seller,
            error: 'closing-items-failed',
            detail: extractErrorMessage(fechamentoItemsError),
        }))
    }

    const { error: transacoesError } = await insertFinancialTransactions({
        supabaseAdmin,
        items: decodedItems,
        paymentDate,
        createdBy: permission.userId,
        fallbackLabel: fallbackTransactionLabel,
    })

    if (transacoesError) {
        console.error('Erro ao registrar transações do fechamento:', transacoesError)
        await supabaseAdmin
            .from('financeiro_fechamentos')
            .update({ status: 'cancelado' })
            .eq('id', fechamento.id)
        redirect(buildFinancialRedirect({
            tab: 'liberado',
            seller,
            error: 'closing-transactions-failed',
            detail: extractErrorMessage(transacoesError),
        }))
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
    redirect(buildFinancialRedirect({ tab: 'historico', seller, status: 'closing-created' }))
}

export async function createManualElyakimItemFromForm(formData: FormData): Promise<void> {
    const seller = formData.get('return_seller')?.toString().trim() ?? ''
    const permission = await checkFinancialPermission()
    if ('error' in permission) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'permission' }))
    }

    const parsed = createManualItemSchema.safeParse({
        competencia: formData.get('competencia'),
        beneficiary_user_id: formData.get('beneficiary_user_id'),
        brand: formData.get('brand') ?? 'rental',
        transaction_type: formData.get('transaction_type') ?? 'comissao_venda',
        client_name: formData.get('client_name'),
        amount: parseDecimalFormValue(formData.get('amount')),
        origin_lead_id: formData.get('origin_lead_id'),
        external_ref: formData.get('external_ref'),
        observacao: formData.get('observacao'),
    })

    if (!parsed.success) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-manual' }))
    }

    const competencia = normalizeCompetenciaDate(parsed.data.competencia)
    const supabaseAdmin = createSupabaseServiceClient()
    const salesEligibility = await getSalesEligibilityMap(supabaseAdmin, [parsed.data.beneficiary_user_id])
    if (!salesEligibility.get(parsed.data.beneficiary_user_id)) {
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'invalid-beneficiary' }))
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
            redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'manual-report-failed' }))
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
        redirect(buildFinancialRedirect({ tab: 'liberado', seller, error: 'manual-item-failed' }))
    }

    revalidatePath('/admin/financeiro')
    redirect(buildFinancialRedirect({ tab: 'liberado', seller, status: 'manual-created' }))
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
    let supabaseAdmin: any = null
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error('Erro ao inicializar cliente admin para financeiro:', error)
    }

    let reference = supabaseAdmin
        ? await resolveDorataSaleReference(supabaseAdmin, saleId)
        : { isValid: false, clientName: null }

    if (!reference.isValid) {
        reference = await resolveDorataSaleReference(sessionClient as any, saleId)
    }

    if (!reference.isValid) {
        return { success: false as const, message: 'Venda Dorata não encontrada para esse identificador.' }
    }

    const clientName = reference.clientName ?? saleId
    const rulePayload = {
        name: `Percentual comissão Dorata - ${clientName}`,
        key: `dorata_commission_percent_sale_${saleId}`,
        value: Number(percent),
        unit: '%',
        description: 'Percentual de comissão Dorata específico por venda/cliente',
        active: true,
    }

    let lastError: { message?: string | null } | null = null
    if (supabaseAdmin) {
        lastError = await upsertPricingRuleWithFallback(supabaseAdmin, rulePayload)
    } else {
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
