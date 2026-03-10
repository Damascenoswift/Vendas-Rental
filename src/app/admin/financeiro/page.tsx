import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { closeCommissionBatchFromForm, createManualElyakimItemFromForm, getFinancialSummary } from "@/app/actions/financial"
import { FinancialClosingDossierDialog, type FinancialClosingDossier, type FinancialClosingDossierItem } from "@/components/financial/closing-dossier-dialog"
import { FinancialList } from "@/components/financial/financial-list"
import { getUsers } from "@/app/actions/auth-admin"
import { NewTransactionDialog } from "@/components/financial/new-transaction-dialog"
import { RentalCommissionSettings } from "@/components/financial/rental-commission-settings"
import { getPricingRules } from "@/services/proposal-service"
import { Wallet } from "lucide-react"
import { getProfile, hasRestrictedFinancialAccess } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { hasSalesAccess } from "@/lib/sales-access"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

type CloseableFinancialItem = {
    source_kind: "rental_sistema" | "dorata_sistema" | "manual_elyakim"
    source_ref_id: string
    brand: "rental" | "dorata"
    beneficiary_user_id: string
    beneficiary_name: string
    transaction_type: "comissao_venda" | "comissao_dorata" | "override_gestao"
    amount: number
    description: string
    origin_lead_id: string | null
    client_name: string | null
    source_competencia: string | null
}

type FinancialSearchParams = {
    seller?: string | string[]
    brand?: string | string[]
    tab?: string | string[]
    status?: string | string[]
    error?: string | string[]
    detail?: string | string[]
}

type SellerRow = {
    id: string
    name: string
    email: string
}

type DorataForecastSeller = {
    id?: string | null
    name?: string | null
    email?: string | null
} | null

type DorataForecastRow = {
    id: string
    saleId: string
    leadId: string | null
    created_at: string
    sellerId: string | null
    seller: DorataForecastSeller
    nome: string | null
    contractValue: number
    commissionPercent: number
    commissionPercentDisplay: number
    commissionPercentSource: string
    commissionValue: number
    signedAt: string | null
    signed: boolean
    commissionStatus: string
    splitLabel: string | null
    isSplitRecipient: boolean
}

const COMMISSION_SPLIT_PERCENT_OPTIONS = new Set<number>([1, 1.5, 2, 2.5, 3])

function toNumber(value: unknown) {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}

function toFraction(rawValue: unknown, fallbackPercent = 0) {
    const raw = toNumber(rawValue)
    if (!Number.isFinite(raw)) return fallbackPercent / 100
    return raw > 1 ? raw / 100 : raw
}

function toPercentDisplay(rawValue: unknown, fallbackPercent = 0) {
    const raw = toNumber(rawValue)
    if (!Number.isFinite(raw)) return fallbackPercent
    return raw > 1 ? raw : raw * 100
}

function parseProposalCommissionSplit(calculation: any) {
    const split = calculation?.commission_split
    if (!split || typeof split !== "object" || Array.isArray(split)) return null
    if (split.enabled === false) return null

    const sellerId = typeof split.seller_id === "string" ? split.seller_id.trim() : ""
    if (!sellerId) return null

    const fromDisplay = toPercentDisplay(split.percent_display, 0)
    const fromPercent = toPercentDisplay(split.percent, 0)
    const percentDisplayRaw = fromDisplay > 0 ? fromDisplay : fromPercent
    const percentDisplay = Math.round(percentDisplayRaw * 10) / 10

    if (!Number.isFinite(percentDisplay) || !COMMISSION_SPLIT_PERCENT_OPTIONS.has(percentDisplay)) {
        return null
    }

    return {
        sellerId,
        percentDisplay,
        percent: percentDisplay / 100,
    }
}

function normalizeText(value: string | null | undefined) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    return new Date(value).toLocaleDateString("pt-BR")
}

function buildFinancialPageHref(params: {
    seller?: string
    tab?: string
    brand?: "all" | "rental" | "dorata"
}) {
    const search = new URLSearchParams()
    if (params.seller && params.seller !== "all") {
        search.set("seller", params.seller)
    }
    if (params.tab && params.tab !== "previsoes") {
        search.set("tab", params.tab)
    }
    if (params.brand && params.brand !== "all") {
        search.set("brand", params.brand)
    }
    const query = search.toString()
    return query ? `/admin/financeiro?${query}` : "/admin/financeiro"
}

function extractRentalBase(metadata: any) {
    const consumoMedioPf = toNumber(metadata?.consumoMedioPF ?? metadata?.consumo_medio_pf ?? 0)
    const precoKwh = toNumber(metadata?.precoKwh ?? metadata?.preco_kwh ?? 0)
    const descontoRaw = toNumber(metadata?.desconto ?? metadata?.desconto_percent ?? 0)
    const descontoPercent = Math.min(Math.max(descontoRaw, 0), 100)

    const hasBase = consumoMedioPf > 0 && precoKwh > 0
    if (!hasBase) {
        return {
            hasBase: false,
            baseValue: 0,
            consumoMedioKwh: consumoMedioPf,
            precoKwh,
            descontoPercent,
        }
    }

    const valorBruto = consumoMedioPf * precoKwh
    const valorComDesconto = valorBruto * (1 - descontoPercent / 100)

    return {
        hasBase: true,
        baseValue: valorComDesconto,
        consumoMedioKwh: consumoMedioPf,
        precoKwh,
        descontoPercent,
    }
}

export default async function FinancialPage({ searchParams }: { searchParams?: Promise<FinancialSearchParams> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    const department = profile?.department ?? null
    const canAccessFinancial = hasRestrictedFinancialAccess({
        role,
        department,
        email: profile?.email ?? user.email ?? null,
    })
    if (!profile || !canAccessFinancial) {
        redirect("/dashboard")
    }

    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const sellerParam = Array.isArray(resolvedSearchParams?.seller)
        ? resolvedSearchParams?.seller[0]
        : resolvedSearchParams?.seller
    const brandParam = Array.isArray(resolvedSearchParams?.brand)
        ? resolvedSearchParams?.brand[0]
        : resolvedSearchParams?.brand
    const tabParam = Array.isArray(resolvedSearchParams?.tab)
        ? resolvedSearchParams?.tab[0]
        : resolvedSearchParams?.tab
    const statusParam = Array.isArray(resolvedSearchParams?.status)
        ? resolvedSearchParams?.status[0]
        : resolvedSearchParams?.status
    const errorParam = Array.isArray(resolvedSearchParams?.error)
        ? resolvedSearchParams?.error[0]
        : resolvedSearchParams?.error
    const detailParam = Array.isArray(resolvedSearchParams?.detail)
        ? resolvedSearchParams?.detail[0]
        : resolvedSearchParams?.detail

    const selectedSellerId = typeof sellerParam === "string" && sellerParam.length > 0
        ? sellerParam
        : "all"
    const selectedBrand = brandParam === "rental" || brandParam === "dorata"
        ? brandParam
        : "all"
    const selectedTab = tabParam === "liberado" || tabParam === "historico"
        ? tabParam
        : "previsoes"
    const sellerFilterId = selectedSellerId === "all" ? null : selectedSellerId
    const isRentalBrandView = selectedBrand === "rental"
    const isDorataBrandView = selectedBrand === "dorata"

    const [transactions, users, pricingRules] = await Promise.all([
        getFinancialSummary(),
        getUsers(),
        getPricingRules()
    ])

    const supabaseAdmin = createSupabaseServiceClient()

    const [
        dorataProposalsResult,
        rentalIndicacoesResult,
        dorataIndicacoesResult,
        paidInvoicesResult,
        signedContractChecklistsResult,
        closingsResult,
        closingItemsResult,
        manualItemsResult,
    ] = await Promise.all([
        supabaseAdmin
            .from('proposals')
            .select('id, client_id, status, created_at, total_value, calculation, seller_id, seller:users(id, name, email), cliente:indicacoes!proposals_client_id_fkey(id, nome, marca, status, assinada_em, contract_proposal_id)')
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('indicacoes')
            .select('id, created_at, nome, status, valor, user_id, codigo_instalacao, assinada_em, compensada_em, users!indicacoes_user_id_fkey(id, name, email)')
            .eq('marca', 'rental')
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('indicacoes')
            .select('id, created_at, nome, status, valor, user_id, assinada_em, users!indicacoes_user_id_fkey(id, name, email)')
            .eq('marca', 'dorata')
            .not('valor', 'is', null)
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('faturas_conciliacao')
            .select('cliente_id, mes_ano, status_pagamento')
            .eq('status_pagamento', 'PAGO'),
        supabaseAdmin
            .from('task_checklists')
            .select('created_at, completed_at, title, task:tasks!inner(indicacao_id, codigo_instalacao, brand)')
            .eq('is_done', true)
            .ilike('title', '%contrato assinado%')
            .order('completed_at', { ascending: false }),
        supabase
            .from('financeiro_fechamentos')
            .select('id, codigo, competencia, status, total_itens, total_valor, fechado_em, fechado_por, observacao, created_at')
            .order('fechado_em', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(80),
        supabase
            .from('financeiro_fechamento_itens')
            .select('id, fechamento_id, brand, beneficiary_user_id, transaction_type, source_kind, source_ref_id, origin_lead_id, descricao, valor_liberado, valor_pago, pagamento_em, snapshot, created_at, fechamento:financeiro_fechamentos!financeiro_fechamento_itens_fechamento_id_fkey(status)')
            .order('pagamento_em', { ascending: false })
            .limit(1000),
        supabase
            .from('financeiro_relatorios_manuais_itens')
            .select('id, report_id, beneficiary_user_id, brand, transaction_type, client_name, origin_lead_id, valor, status, external_ref, observacao, created_at, paid_at, report:financeiro_relatorios_manuais!financeiro_relatorios_manuais_itens_report_id_fkey(competencia)')
            .order('created_at', { ascending: false })
            .limit(300),
    ])

    const dorataProposals = dorataProposalsResult.data ?? []
    const rentalIndicacoes = rentalIndicacoesResult.data ?? []
    const dorataIndicacoes = dorataIndicacoesResult.data ?? []
    const paidInvoices = paidInvoicesResult.data ?? []
    const signedContractChecklists = signedContractChecklistsResult.data ?? []
    const closings = closingsResult.data ?? []
    const closingItems = closingItemsResult.data ?? []
    const manualItems = manualItemsResult.data ?? []

    const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value)

    const formatPercent = (value: number) => `${value.toFixed(2)}%`

    const dorataCommissionRule = pricingRules.find((rule) => rule.key === 'dorata_commission_percent')
    const rawDorataCommission = dorataCommissionRule ? Number(dorataCommissionRule.value) : 3
    const defaultDorataCommissionPercent = rawDorataCommission > 1 ? rawDorataCommission / 100 : rawDorataCommission

    const rentalDefaultRule = pricingRules.find((rule) => rule.key === 'rental_default_commission_percent')
    const rentalDefaultPercentDisplay = toPercentDisplay(rentalDefaultRule?.value, 3)
    const rentalDefaultCommissionPercent = toFraction(rentalDefaultRule?.value, 3)

    const managerOverrideRule = pricingRules.find((rule) => rule.key === 'rental_manager_override_percent')
    const managerOverridePercentDisplay = toPercentDisplay(managerOverrideRule?.value, 3)
    const managerOverridePercent = toFraction(managerOverrideRule?.value, 3)

    const dorataPercentBySaleId = new Map<string, number>()
    const dorataPercentDisplayBySaleId = new Map<string, number>()
    const sellerPercentByUserId = new Map<string, number>()
    const sellerPercentDisplayByUserId = new Map<string, number>()
    for (const rule of pricingRules) {
        if (rule.key.startsWith('dorata_commission_percent_sale_')) {
            const saleId = rule.key.replace('dorata_commission_percent_sale_', '').trim()
            if (!saleId) continue
            dorataPercentBySaleId.set(saleId, toFraction(rule.value, 3))
            dorataPercentDisplayBySaleId.set(saleId, toPercentDisplay(rule.value, 3))
            continue
        }

        if (!rule.key.startsWith('rental_commission_percent_user_')) continue
        const userId = rule.key.replace('rental_commission_percent_user_', '').trim()
        if (!userId) continue
        sellerPercentByUserId.set(userId, toFraction(rule.value, rentalDefaultPercentDisplay))
        sellerPercentDisplayByUserId.set(userId, toPercentDisplay(rule.value, rentalDefaultPercentDisplay))
    }

    const usersRows = users as any[]
    const salesEligibleUsers = usersRows.filter((item) => hasSalesAccess(item))
    const salesEligibleUserIds = new Set(salesEligibleUsers.map((item) => item.id as string))

    const managerUserCandidate = usersRows.find((item) => normalizeText(item.name) === "guilherme damasceno")
    const managerUserId = managerUserCandidate && hasSalesAccess(managerUserCandidate)
        ? managerUserCandidate.id
        : null
    const managerName = managerUserCandidate?.name || "Guilherme Damasceno"
    const usersById = new Map(usersRows.map((item) => [item.id, item]))

    const paidInvoiceDateByLead = new Map<string, string>()
    for (const invoice of paidInvoices) {
        const leadId = (invoice as any).cliente_id as string
        const mes = ((invoice as any).mes_ano as string) || ""
        const current = paidInvoiceDateByLead.get(leadId)
        if (!current || mes > current) {
            paidInvoiceDateByLead.set(leadId, mes)
        }
    }

    const paidCommissionByLeadBeneficiary = new Map<string, number>()
    const paidOverrideByLeadBeneficiary = new Map<string, number>()
    const paidDorataByLeadBeneficiary = new Map<string, number>()
    const useClosureItemsAsPaidSource = (transactions as any[]).length === 0 && (closingItems as any[]).length > 0
    if (useClosureItemsAsPaidSource) {
        for (const item of closingItems as any[]) {
            const closingRecord = Array.isArray(item.fechamento) ? item.fechamento[0] : item.fechamento
            if (closingRecord?.status === 'cancelado') continue
            if (!item.origin_lead_id || !item.beneficiary_user_id) continue
            const isSalesEligibleBeneficiary = salesEligibleUserIds.has(item.beneficiary_user_id)
            if (!isSalesEligibleBeneficiary && item.transaction_type !== 'comissao_dorata') continue
            const amount = toNumber(item.valor_pago)
            if (amount <= 0) continue
            const key = `${item.origin_lead_id}:${item.beneficiary_user_id}`

            if (item.transaction_type === 'comissao_venda') {
                paidCommissionByLeadBeneficiary.set(key, (paidCommissionByLeadBeneficiary.get(key) ?? 0) + amount)
            }
            if (item.transaction_type === 'override_gestao') {
                paidOverrideByLeadBeneficiary.set(key, (paidOverrideByLeadBeneficiary.get(key) ?? 0) + amount)
            }
            if (item.transaction_type === 'comissao_dorata') {
                paidDorataByLeadBeneficiary.set(key, (paidDorataByLeadBeneficiary.get(key) ?? 0) + amount)
            }
        }
    } else {
        for (const tx of transactions as any[]) {
            if (tx.status !== 'pago') continue
            if (!tx.origin_lead_id || !tx.beneficiary_user_id) continue
            const isSalesEligibleBeneficiary = salesEligibleUserIds.has(tx.beneficiary_user_id)
            if (!isSalesEligibleBeneficiary && tx.type !== 'comissao_dorata') continue
            const amount = toNumber(tx.amount)
            if (amount <= 0) continue
            const key = `${tx.origin_lead_id}:${tx.beneficiary_user_id}`

            if (tx.type === 'comissao_venda') {
                paidCommissionByLeadBeneficiary.set(key, (paidCommissionByLeadBeneficiary.get(key) ?? 0) + amount)
            }
            if (tx.type === 'override_gestao') {
                paidOverrideByLeadBeneficiary.set(key, (paidOverrideByLeadBeneficiary.get(key) ?? 0) + amount)
            }
            if (tx.type === 'comissao_dorata') {
                paidDorataByLeadBeneficiary.set(key, (paidDorataByLeadBeneficiary.get(key) ?? 0) + amount)
            }
        }
    }

    const signedTaskDateByLead = new Map<string, string>()
    const signedTaskDateByInstallCode = new Map<string, string>()
    for (const item of signedContractChecklists as any[]) {
        const task = Array.isArray(item.task) ? item.task[0] : item.task
        if (!task) continue

        const brand = normalizeText(task.brand)
        if (brand !== 'rental') continue

        const completedAt = ((item.completed_at as string | null) ?? (item.created_at as string | null) ?? null)
        if (!completedAt) continue

        const leadId = (task.indicacao_id as string | null) ?? null
        if (leadId) {
            const current = signedTaskDateByLead.get(leadId)
            if (!current || completedAt > current) signedTaskDateByLead.set(leadId, completedAt)
        }

        const installationCode = (task.codigo_instalacao as string | null)?.trim() ?? null
        if (installationCode) {
            const current = signedTaskDateByInstallCode.get(installationCode)
            if (!current || completedAt > current) signedTaskDateByInstallCode.set(installationCode, completedAt)
        }
    }

    const rentalMetadataEntries = await Promise.all(
        rentalIndicacoes.map(async (indicacao: any) => {
            const ownerId = indicacao.user_id as string | null
            if (!ownerId) return [indicacao.id as string, null] as const

            const { data: metadataFile, error } = await supabaseAdmin.storage
                .from("indicacoes")
                .download(`${ownerId}/${indicacao.id}/metadata.json`)

            if (error || !metadataFile) return [indicacao.id as string, null] as const

            try {
                const text = await metadataFile.text()
                return [indicacao.id as string, JSON.parse(text)] as const
            } catch {
                return [indicacao.id as string, null] as const
            }
        })
    )
    const rentalMetadataByLead = new Map(rentalMetadataEntries)

    const proposalStatusPriority: Record<string, number> = {
        accepted: 0,
        sent: 1,
        draft: 2,
    }

    const dorataProposalCandidates = dorataProposals.filter((proposal: any) => {
        const cliente = Array.isArray(proposal?.cliente) ? proposal.cliente[0] : proposal?.cliente
        return cliente?.marca === 'dorata'
    })

    const dorataProposalGroups = new Map<string, any[]>()
    for (const proposal of dorataProposalCandidates) {
        const cliente = Array.isArray(proposal?.cliente) ? proposal.cliente[0] : proposal?.cliente
        const clientId = (cliente?.id as string | null) ?? (proposal?.client_id as string | null) ?? null
        if (!clientId) continue

        const current = dorataProposalGroups.get(clientId) ?? []
        current.push(proposal)
        dorataProposalGroups.set(clientId, current)
    }

    const dorataProposalsFiltered = Array.from(dorataProposalGroups.values())
        .map((group) => {
            const firstClient = Array.isArray(group[0]?.cliente) ? group[0]?.cliente[0] : group[0]?.cliente
            const selectedContractProposalId = (firstClient?.contract_proposal_id as string | null) ?? null

            if (selectedContractProposalId) {
                const selectedProposal = group.find((proposal) => proposal.id === selectedContractProposalId)
                if (selectedProposal) return selectedProposal
            }

            return group
                .slice()
                .sort((a, b) => {
                    const rankA = proposalStatusPriority[a.status ?? ""] ?? 99
                    const rankB = proposalStatusPriority[b.status ?? ""] ?? 99
                    if (rankA !== rankB) return rankA - rankB
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })[0] ?? null
        })
        .filter(Boolean)

    const dorataProposalClientIds = new Set(
        dorataProposalsFiltered
            .map((proposal: any) => {
                const cliente = Array.isArray(proposal?.cliente) ? proposal.cliente[0] : proposal?.cliente
                return cliente?.id ?? proposal?.client_id
            })
            .filter(Boolean)
    )

    const dorataForecastsFromProposals: DorataForecastRow[] = dorataProposalsFiltered.flatMap((proposal: any): DorataForecastRow[] => {
        const cliente = Array.isArray(proposal?.cliente) ? proposal.cliente[0] : proposal?.cliente
        const calculation = proposal.calculation as any
        const storedCommission = calculation?.commission
        const contractValue = Number(storedCommission?.base_value ?? proposal.total_value ?? 0)
        const storedPercentRaw = Number(storedCommission?.percent ?? defaultDorataCommissionPercent)
        const storedPercent = storedPercentRaw > 1 ? storedPercentRaw / 100 : storedPercentRaw
        const saleId = proposal.id as string
        const customPercent = dorataPercentBySaleId.get(saleId)
        const customPercentDisplay = dorataPercentDisplayBySaleId.get(saleId)
        const commissionPercent = customPercent ?? storedPercent
        const commissionPercentDisplay = customPercentDisplay ?? (storedPercentRaw > 1 ? storedPercentRaw : storedPercentRaw * 100)
        const commissionValue = Number(
            customPercent !== undefined
                ? contractValue * customPercent
                : (storedCommission?.value ?? contractValue * commissionPercent)
        )
        const signedAt = (cliente?.assinada_em as string | null) ?? null
        const signed = Boolean(signedAt) || cliente?.status === "CONCLUIDA"
        const proposalClientName =
            (cliente?.nome as string | null) ??
            (calculation?.client_name as string | null) ??
            (calculation?.cliente_nome as string | null) ??
            null
        const commissionPercentSource = customPercent !== undefined
            ? "Cliente"
            : (storedCommission?.percent != null || storedCommission?.value != null)
                ? "Orçamento"
                : "Padrão"
        const seller = Array.isArray(proposal.seller) ? proposal.seller[0] : proposal.seller
        const sellerId = (seller?.id as string | null) ?? (proposal.seller_id as string | null) ?? null
        const leadId = (cliente?.id as string | null) ?? (proposal.client_id as string | null) ?? null
        const splitConfig = parseProposalCommissionSplit(calculation)

        if (!splitConfig || !sellerId || splitConfig.sellerId === sellerId) {
            return [{
                id: `${saleId}:${sellerId ?? "sem-vendedor"}`,
                saleId,
                leadId,
                created_at: proposal.created_at as string,
                sellerId,
                seller,
                nome: proposalClientName,
                contractValue,
                commissionPercent,
                commissionPercentDisplay,
                commissionPercentSource,
                commissionValue,
                signedAt,
                signed,
                commissionStatus: signed ? "Liberado" : "Aguardando contrato assinado",
                splitLabel: null,
                isSplitRecipient: false,
            }]
        }

        const splitSellerUser = usersById.get(splitConfig.sellerId)
        const splitSeller = splitSellerUser
            ? {
                id: splitSellerUser.id,
                name: splitSellerUser.name,
                email: splitSellerUser.email,
            }
            : null
        const splitSellerName = splitSeller?.name || splitSeller?.email || "Outro vendedor"
        const sellerName = seller?.name || seller?.email || "Vendedor principal"
        const splitCommissionValue = Math.max(Math.min(contractValue * splitConfig.percent, commissionValue), 0)
        const ownerCommissionValue = Math.max(commissionValue - splitCommissionValue, 0)
        const ownerPercentDisplay = contractValue > 0
            ? (ownerCommissionValue / contractValue) * 100
            : Math.max(commissionPercentDisplay - splitConfig.percentDisplay, 0)
        const splitPercentDisplay = contractValue > 0
            ? (splitCommissionValue / contractValue) * 100
            : splitConfig.percentDisplay

        return [
            {
                id: `${saleId}:${sellerId}`,
                saleId,
                leadId,
                created_at: proposal.created_at as string,
                sellerId,
                seller,
                nome: proposalClientName,
                contractValue,
                commissionPercent: ownerPercentDisplay / 100,
                commissionPercentDisplay: ownerPercentDisplay,
                commissionPercentSource: `${commissionPercentSource} (dividida)`,
                commissionValue: ownerCommissionValue,
                signedAt,
                signed,
                commissionStatus: signed ? "Liberado" : "Aguardando contrato assinado",
                splitLabel: `Dividida com ${splitSellerName} (${splitConfig.percentDisplay.toFixed(1).replace(".", ",")}%)`,
                isSplitRecipient: false,
            },
            {
                id: `${saleId}:${splitConfig.sellerId}`,
                saleId,
                leadId,
                created_at: proposal.created_at as string,
                sellerId: splitConfig.sellerId,
                seller: splitSeller,
                nome: proposalClientName,
                contractValue,
                commissionPercent: splitPercentDisplay / 100,
                commissionPercentDisplay: splitPercentDisplay,
                commissionPercentSource: "Divisão do orçamento",
                commissionValue: splitCommissionValue,
                signedAt,
                signed,
                commissionStatus: signed ? "Liberado" : "Aguardando contrato assinado",
                splitLabel: `Comissão dividida por ${sellerName}`,
                isSplitRecipient: true,
            },
        ]
    })

    const dorataForecastsFromIndicacoes: DorataForecastRow[] = dorataIndicacoes
        .filter((indicacao: any) => !dorataProposalClientIds.has(indicacao.id))
        .map((indicacao: any) => {
            const contractValue = Number(indicacao.valor ?? 0)
            const customPercent = dorataPercentBySaleId.get(indicacao.id as string)
            const customPercentDisplay = dorataPercentDisplayBySaleId.get(indicacao.id as string)
            const commissionPercent = customPercent ?? Number(defaultDorataCommissionPercent)
            const commissionPercentDisplay = customPercentDisplay ?? toPercentDisplay(defaultDorataCommissionPercent, 3)
            const commissionValue = contractValue * commissionPercent
            const signedAt = (indicacao.assinada_em as string | null) ?? null
            const signed = Boolean(signedAt) || indicacao.status === "CONCLUIDA"

            return {
                id: `${indicacao.id as string}:${(indicacao.users?.id as string | null) ?? (indicacao.user_id as string | null) ?? "sem-vendedor"}`,
                saleId: indicacao.id as string,
                leadId: indicacao.id as string,
                created_at: indicacao.created_at as string,
                sellerId: (indicacao.users?.id as string | null) ?? (indicacao.user_id as string | null) ?? null,
                seller: indicacao.users,
                nome: (indicacao.nome as string | null) ?? null,
                contractValue,
                commissionPercent,
                commissionPercentDisplay,
                commissionPercentSource: customPercent !== undefined ? "Cliente" : "Padrão",
                commissionValue,
                signedAt,
                signed,
                commissionStatus: signed ? "Liberado" : "Aguardando contrato assinado",
                splitLabel: null,
                isSplitRecipient: false,
            }
        })

    const dorataForecasts = [...dorataForecastsFromProposals, ...dorataForecastsFromIndicacoes]
        .filter((item) => item.sellerId && (salesEligibleUserIds.has(item.sellerId) || item.isSplitRecipient))
    const filteredDorataForecasts = sellerFilterId
        ? dorataForecasts.filter((item) => item.sellerId === sellerFilterId)
        : dorataForecasts

    const rentalForecastRows = rentalIndicacoes.map((indicacao: any) => {
        const metadata = rentalMetadataByLead.get(indicacao.id) ?? null
        const base = extractRentalBase(metadata)
        const sellerId = indicacao.user_id as string
        const sellerPercent = sellerPercentByUserId.get(sellerId) ?? rentalDefaultCommissionPercent
        const sellerPercentDisplay = sellerPercentDisplayByUserId.get(sellerId) ?? rentalDefaultPercentDisplay
        const hasCommissionBase = base.hasBase

        const commissionTotal = hasCommissionBase ? base.baseValue * sellerPercent : 0
        const allowsThirtyAdvance = Boolean(managerUserId) && sellerId === managerUserId
        const thirtyPercentValue = allowsThirtyAdvance ? commissionTotal * 0.3 : 0
        const postInvoiceForecast = allowsThirtyAdvance ? commissionTotal * 0.7 : commissionTotal
        const installationCode = (indicacao.codigo_instalacao as string | null)?.trim() ?? null
        const signedFromTask =
            signedTaskDateByLead.get(indicacao.id as string) ??
            (installationCode ? signedTaskDateByInstallCode.get(installationCode) : null) ??
            null
        const signedAt = signedFromTask ?? (indicacao.assinada_em as string | null) ?? null
        const signed = Boolean(signedAt) || indicacao.status === "CONCLUIDA"
        const paidInvoiceDate = paidInvoiceDateByLead.get(indicacao.id as string) ?? null
        const hasPaidInvoice = Boolean(paidInvoiceDate)

        const paidSellerCommission = paidCommissionByLeadBeneficiary.get(`${indicacao.id}:${sellerId}`) ?? 0
        const thirtyStatus = !hasCommissionBase
            ? "Sem consumo médio PF"
            : allowsThirtyAdvance
                ? (signed ? (paidSellerCommission >= thirtyPercentValue ? "Pago" : "Liberado") : "Aguardando assinatura")
                : "Não se aplica"
        const seventyStatus = !hasCommissionBase
            ? "Sem consumo médio PF"
            : hasPaidInvoice
                ? (paidSellerCommission >= commissionTotal ? "Pago" : "Liberado")
                : "Aguardando fatura paga"

        const seventyAdjusted = !hasCommissionBase
            ? 0
            : hasPaidInvoice
                ? Math.max(commissionTotal - paidSellerCommission, 0)
                : postInvoiceForecast

        return {
            id: indicacao.id as string,
            createdAt: indicacao.created_at as string,
            nome: indicacao.nome as string,
            status: indicacao.status as string,
            sellerId,
            sellerName: indicacao.users?.name || indicacao.users?.email || "Sem vendedor",
            sellerEmail: indicacao.users?.email || "",
            consumoMedioKwh: base.consumoMedioKwh,
            precoKwh: base.precoKwh,
            baseValue: base.baseValue,
            commissionPercent: sellerPercent,
            commissionPercentDisplay: sellerPercentDisplay,
            commissionTotal,
            thirtyPercentValue,
            thirtyStatus,
            seventyStatus,
            seventyAdjusted,
            signed,
            hasPaidInvoice,
            paidInvoiceDate,
            paidSellerCommission,
            hasCommissionBase,
            allowsThirtyAdvance,
        }
    }).filter((row) => salesEligibleUserIds.has(row.sellerId))

    const filteredRentalForecastRows = sellerFilterId
        ? rentalForecastRows.filter((row) => row.sellerId === sellerFilterId)
        : rentalForecastRows

    const managerOverrideRows = managerUserId
        ? rentalForecastRows
            .filter((row) => row.sellerId !== managerUserId)
            .map((row) => {
                const commissionTotal = row.hasCommissionBase ? row.baseValue * managerOverridePercent : 0
                const thirtyPercentValue = commissionTotal * 0.3
                const seventyPercentForecast = commissionTotal * 0.7
                const paidOverride = paidOverrideByLeadBeneficiary.get(`${row.id}:${managerUserId}`) ?? 0

                const seventyAdjusted = !row.hasCommissionBase
                    ? 0
                    : row.hasPaidInvoice
                        ? Math.max(commissionTotal - paidOverride, 0)
                        : seventyPercentForecast

                return {
                    ...row,
                    beneficiaryUserId: managerUserId,
                    beneficiaryName: managerName,
                    commissionTotal,
                    thirtyPercentValue,
                    seventyAdjusted,
                    paidOverride,
                    commissionPercentDisplay: managerOverridePercentDisplay,
                    thirtyStatus: !row.hasCommissionBase
                        ? "Sem consumo médio PF"
                        : row.signed
                            ? (paidOverride >= thirtyPercentValue ? "Pago" : "Liberado")
                            : "Aguardando assinatura",
                    seventyStatus: !row.hasCommissionBase
                        ? "Sem consumo médio PF"
                        : row.hasPaidInvoice
                            ? (paidOverride >= commissionTotal ? "Pago" : "Liberado")
                            : "Aguardando fatura paga",
                }
            })
        : []

    const filteredManagerOverrideRows = !sellerFilterId
        ? managerOverrideRows
        : managerOverrideRows.filter((row) => row.sellerId === sellerFilterId || row.beneficiaryUserId === sellerFilterId)

    const visibleDorataForecasts = isRentalBrandView ? [] : filteredDorataForecasts
    const visibleRentalForecastRows = isDorataBrandView ? [] : filteredRentalForecastRows
    const visibleManagerOverrideRows = isDorataBrandView ? [] : filteredManagerOverrideRows

    const sellerRowsMap = new Map<string, SellerRow>()
    for (const row of rentalForecastRows) {
        sellerRowsMap.set(row.sellerId, {
            id: row.sellerId,
            name: row.sellerName,
            email: row.sellerEmail,
        })
    }
    for (const row of dorataForecasts) {
        if (!row.sellerId) continue
        const sellerData = Array.isArray(row.seller) ? row.seller[0] : row.seller
        sellerRowsMap.set(row.sellerId, {
            id: row.sellerId,
            name: sellerData?.name || sellerData?.email || "Sem nome",
            email: sellerData?.email || "",
        })
    }
    for (const userRow of salesEligibleUsers) {
        const hasAllowedBrands = Array.isArray(userRow.allowed_brands) && userRow.allowed_brands.length > 0
        if (!hasAllowedBrands && !sellerRowsMap.has(userRow.id)) continue
        sellerRowsMap.set(userRow.id, {
            id: userRow.id,
            name: userRow.name || userRow.email || "Sem nome",
            email: userRow.email || "",
        })
    }

    const sellerOptions = Array.from(sellerRowsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    const payableSellerOptions = sellerOptions.filter((seller) => salesEligibleUserIds.has(seller.id))
    const rentalSellerOptions = sellerOptions.filter((seller) => {
        const userRow = usersById.get(seller.id)
        const brands = Array.isArray(userRow?.allowed_brands) ? userRow.allowed_brands : []
        return brands.includes("rental")
    })

    const feedbackMessages = {
        "manual-created": { tone: "success", text: "Item manual criado. Ele já entrou na lista de fechamento." },
        "closing-created": { tone: "success", text: "Fechamento registrado. O lote foi enviado para o histórico." },
        "closing-created-no-history": { tone: "success", text: "Pagamento registrado e removido do liberado, mas o histórico de lotes não está disponível neste banco." },
        "closing-created-no-ledger": { tone: "success", text: "Fechamento registrado. Este banco não expõe a tabela de transações, então o histórico do lote passou a valer como comprovante do pagamento." },
        "permission": { tone: "error", text: "Você não tem permissão para concluir essa ação." },
        "no-items": { tone: "error", text: "Selecione ao menos um item antes de fechar o pagamento." },
        "invalid-selection": { tone: "error", text: "A seleção do fechamento ficou inválida. Atualize a página e tente novamente." },
        "invalid-expense": { tone: "error", text: "Se for aplicar despesa, preencha beneficiário, descrição e valor válidos." },
        "negative-total": { tone: "error", text: "O fechamento não pode gerar total líquido negativo." },
        "invalid-beneficiary": { tone: "error", text: "O beneficiário escolhido não está habilitado para esse pagamento." },
        "closing-create-failed": { tone: "error", text: "Não foi possível criar o fechamento financeiro." },
        "closing-items-failed": { tone: "error", text: "O fechamento foi criado, mas houve falha ao salvar os itens." },
        "closing-transactions-failed": { tone: "error", text: "O fechamento foi criado, mas houve falha ao registrar as transações." },
        "invalid-manual": { tone: "error", text: "Revise o item manual. Beneficiário, cliente e valor precisam estar válidos." },
        "manual-report-failed": { tone: "error", text: "Não foi possível criar o cabeçalho do relatório manual." },
        "manual-item-failed": { tone: "error", text: "Não foi possível salvar o item manual." },
    } as const

    const feedbackKey = errorParam || statusParam
    const feedback = feedbackKey && feedbackKey in feedbackMessages
        ? feedbackMessages[feedbackKey as keyof typeof feedbackMessages]
        : null
    const feedbackDetail = typeof detailParam === "string" && detailParam.trim().length > 0
        ? detailParam.trim()
        : null

    const commissionSettingsRows = rentalSellerOptions.map((seller) => ({
        userId: seller.id,
        name: seller.name,
        email: seller.email,
        percent: sellerPercentDisplayByUserId.get(seller.id) ?? rentalDefaultPercentDisplay,
        isCustom: sellerPercentDisplayByUserId.has(seller.id),
    }))
    const dorataSettingsBySaleId = new Map<string, (typeof visibleDorataForecasts)[number]>()
    for (const row of visibleDorataForecasts) {
        const current = dorataSettingsBySaleId.get(row.saleId)
        if (!current || (current.isSplitRecipient && !row.isSplitRecipient)) {
            dorataSettingsBySaleId.set(row.saleId, row)
        }
    }

    const clientCommissionSettingsRows = Array.from(dorataSettingsBySaleId.values()).map((row) => {
        const sellerData = Array.isArray(row.seller) ? row.seller[0] : row.seller
        return {
            leadId: row.saleId,
            clientName: row.nome || row.saleId.slice(0, 8),
            sellerName: sellerData?.name || sellerData?.email || "Sistema",
            percent: row.commissionPercentDisplay,
            isCustom: dorataPercentDisplayBySaleId.has(row.saleId),
        }
    })

    const dorataContractByLead = new Map<string, number>()
    for (const item of visibleDorataForecasts) {
        const key = item.leadId || item.saleId
        if (!key || dorataContractByLead.has(key)) continue
        dorataContractByLead.set(key, item.contractValue)
    }
    const totalDorataContract = Array.from(dorataContractByLead.values()).reduce((sum, value) => sum + value, 0)
    const totalDorataCommission = visibleDorataForecasts.reduce((sum, item) => sum + item.commissionValue, 0)

    const totalRentalBase = visibleRentalForecastRows.reduce((sum, item) => sum + item.baseValue, 0)
    const totalRentalCommission = visibleRentalForecastRows.reduce((sum, item) => sum + item.commissionTotal, 0)
    const totalRentalThirty = visibleRentalForecastRows.reduce((sum, item) => sum + item.thirtyPercentValue, 0)
    const totalRentalSeventyAdjusted = visibleRentalForecastRows.reduce((sum, item) => sum + item.seventyAdjusted, 0)
    const totalManagerOverride = visibleManagerOverrideRows.reduce((sum, item) => sum + item.commissionTotal, 0)

    const salesTransactions = (transactions as any[])
        .filter((tx) => {
            if (!tx.beneficiary_user_id) return false
            if (salesEligibleUserIds.has(tx.beneficiary_user_id)) return true
            return tx.type === "comissao_dorata"
        })

    const fallbackSalesTransactions = useClosureItemsAsPaidSource
        ? (closingItems as any[])
            .filter((item) => {
                const closingRecord = Array.isArray(item.fechamento) ? item.fechamento[0] : item.fechamento
                return closingRecord?.status !== 'cancelado'
            })
            .filter((item) => {
                if (!item.beneficiary_user_id) return false
                if (salesEligibleUserIds.has(item.beneficiary_user_id)) return true
                return item.transaction_type === "comissao_dorata"
            })
            .map((item) => {
                const beneficiary = usersById.get(item.beneficiary_user_id)
                return {
                    id: item.id as string,
                    created_at: (item.pagamento_em as string | null) ?? new Date().toISOString(),
                    amount: Number(item.valor_pago ?? 0),
                    type: (item.transaction_type as string) ?? 'comissao_venda',
                    status: 'pago',
                    description: (item.descricao as string | null) ?? 'Fechamento de comissão',
                    beneficiary: beneficiary
                        ? {
                            name: (beneficiary.name as string) || (beneficiary.email as string) || '—',
                            email: (beneficiary.email as string) || '',
                        }
                        : null,
                    creator: null,
                    beneficiary_user_id: item.beneficiary_user_id as string,
                }
            })
        : []

    const paymentSourceRows = useClosureItemsAsPaidSource
        ? fallbackSalesTransactions
        : salesTransactions

    const filteredTransactions = sellerFilterId
        ? paymentSourceRows.filter((tx: any) => tx.beneficiary_user_id === sellerFilterId)
        : paymentSourceRows

    const dorataPayments = filteredTransactions.filter((tx: any) => tx.type === 'comissao_dorata')
    const rentalPayments = filteredTransactions.filter((tx: any) => tx.type === 'comissao_venda')
    const overridePayments = filteredTransactions.filter((tx: any) => tx.type === 'override_gestao')
    const visiblePaymentRows = isDorataBrandView
        ? dorataPayments
        : isRentalBrandView
            ? [...rentalPayments, ...overridePayments]
            : filteredTransactions

    const dorataPaymentsTotal = dorataPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const rentalPaymentsTotal = rentalPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const overridePaymentsTotal = overridePayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const totalBalance = visiblePaymentRows.reduce((acc, curr) => acc + (curr.amount || 0), 0)

    const manualItemsRows = (manualItems as any[]).map((item) => {
        const report = Array.isArray(item.report) ? item.report[0] : item.report
        const beneficiary = usersById.get(item.beneficiary_user_id)
        return {
            id: item.id as string,
            reportId: item.report_id as string,
            beneficiaryUserId: item.beneficiary_user_id as string,
            beneficiaryName: beneficiary?.name || beneficiary?.email || "Sem usuário",
            beneficiaryEmail: beneficiary?.email || "",
            brand: (item.brand as "rental" | "dorata") || "rental",
            transactionType: (item.transaction_type as "comissao_venda" | "comissao_dorata" | "override_gestao") || "comissao_venda",
            clientName: (item.client_name as string | null) ?? null,
            originLeadId: (item.origin_lead_id as string | null) ?? null,
            value: Number(item.valor ?? 0),
            status: (item.status as string) || "liberado",
            externalRef: (item.external_ref as string | null) ?? null,
            observacao: (item.observacao as string | null) ?? null,
            createdAt: (item.created_at as string) ?? null,
            paidAt: (item.paid_at as string | null) ?? null,
            competencia: (report?.competencia as string | null) ?? null,
        }
    }).filter((item) => salesEligibleUserIds.has(item.beneficiaryUserId))

    const filteredManualItemsRows = sellerFilterId
        ? manualItemsRows.filter((item) => item.beneficiaryUserId === sellerFilterId)
        : manualItemsRows
    const visibleManualItemsRows = selectedBrand === "all"
        ? filteredManualItemsRows
        : filteredManualItemsRows.filter((item) => item.brand === selectedBrand)

    const closingItemsRows = (closingItems as any[]).map((item) => {
        const beneficiary = usersById.get(item.beneficiary_user_id)
        const snapshot = item.snapshot && typeof item.snapshot === "object"
            ? item.snapshot as Record<string, unknown>
            : null

        return {
            id: item.id as string,
            closingId: item.fechamento_id as string,
            brand: ((item.brand as "rental" | "dorata") ?? "rental"),
            beneficiaryUserId: item.beneficiary_user_id as string,
            beneficiaryName: beneficiary?.name || beneficiary?.email || "Sem usuário",
            beneficiaryEmail: beneficiary?.email || "",
            transactionType: (item.transaction_type as string) ?? "comissao_venda",
            sourceKind: ((item.source_kind as "rental_sistema" | "dorata_sistema" | "manual_elyakim") ?? "rental_sistema"),
            sourceRefId: (item.source_ref_id as string) ?? "",
            originLeadId: (item.origin_lead_id as string | null) ?? null,
            description: (item.descricao as string | null) ?? null,
            clientName: (snapshot?.client_name as string | null) ?? null,
            valueReleased: Number(item.valor_liberado ?? 0),
            valuePaid: Number(item.valor_pago ?? 0),
            paymentDate: (item.pagamento_em as string | null) ?? null,
            createdAt: (item.created_at as string | null) ?? null,
        }
    })

    const closingItemsByClosingId = new Map<string, FinancialClosingDossierItem[]>()
    for (const item of closingItemsRows) {
        const current = closingItemsByClosingId.get(item.closingId) ?? []
        current.push({
            id: item.id,
            brand: item.brand,
            beneficiaryName: item.beneficiaryName,
            beneficiaryEmail: item.beneficiaryEmail,
            transactionType: item.transactionType,
            sourceKind: item.sourceKind,
            sourceRefId: item.sourceRefId,
            originLeadId: item.originLeadId,
            description: item.description,
            clientName: item.clientName,
            valueReleased: item.valueReleased,
            valuePaid: item.valuePaid,
            paymentDate: item.paymentDate,
            createdAt: item.createdAt,
        })
        closingItemsByClosingId.set(item.closingId, current)
    }

    const closeableItems: CloseableFinancialItem[] = []

    for (const row of filteredRentalForecastRows) {
        if (!row.hasCommissionBase || !row.sellerId) continue

        const releaseCap = row.allowsThirtyAdvance
            ? (row.hasPaidInvoice ? row.commissionTotal : row.signed ? row.thirtyPercentValue : 0)
            : (row.hasPaidInvoice ? row.commissionTotal : 0)
        const availableAmount = Math.max(releaseCap - row.paidSellerCommission, 0)
        if (availableAmount <= 0) continue

        closeableItems.push({
            source_kind: "rental_sistema",
            source_ref_id: `rental:${row.id}:${row.sellerId}:comissao_venda`,
            brand: "rental",
            beneficiary_user_id: row.sellerId,
            beneficiary_name: row.sellerName,
            transaction_type: "comissao_venda",
            amount: availableAmount,
            description: `Fechamento Rental - ${row.nome}`,
            origin_lead_id: row.id,
            client_name: row.nome,
            source_competencia: null,
        })
    }

    for (const row of filteredManagerOverrideRows) {
        if (!row.hasCommissionBase || !row.beneficiaryUserId) continue

        const releaseCap = row.hasPaidInvoice
            ? row.commissionTotal
            : row.signed
                ? row.thirtyPercentValue
                : 0
        const availableAmount = Math.max(releaseCap - row.paidOverride, 0)
        if (availableAmount <= 0) continue

        closeableItems.push({
            source_kind: "rental_sistema",
            source_ref_id: `rental:${row.id}:${row.beneficiaryUserId}:override_gestao`,
            brand: "rental",
            beneficiary_user_id: row.beneficiaryUserId,
            beneficiary_name: row.beneficiaryName,
            transaction_type: "override_gestao",
            amount: availableAmount,
            description: `Override Rental - ${row.nome} (${row.sellerName})`,
            origin_lead_id: row.id,
            client_name: row.nome,
            source_competencia: null,
        })
    }

    for (const row of filteredDorataForecasts) {
        if (!row.signed || !row.sellerId || !row.leadId) continue
        const paid = paidDorataByLeadBeneficiary.get(`${row.leadId}:${row.sellerId}`) ?? 0
        const availableAmount = Math.max(row.commissionValue - paid, 0)
        if (availableAmount <= 0) continue

        const beneficiary = usersById.get(row.sellerId)
        closeableItems.push({
            source_kind: "dorata_sistema",
            source_ref_id: `dorata:${row.leadId}:${row.sellerId}:comissao_dorata`,
            brand: "dorata",
            beneficiary_user_id: row.sellerId,
            beneficiary_name: beneficiary?.name || beneficiary?.email || row.seller?.name || row.seller?.email || "Sem usuário",
            transaction_type: "comissao_dorata",
            amount: availableAmount,
            description: `Fechamento Dorata${row.isSplitRecipient ? " (divisão)" : ""} - ${row.nome ?? row.saleId.slice(0, 8)}`,
            origin_lead_id: row.leadId,
            client_name: row.nome ?? `Orçamento ${row.saleId.slice(0, 8)}`,
            source_competencia: null,
        })
    }

    for (const manualItem of filteredManualItemsRows) {
        if (manualItem.status !== "liberado") continue
        if (manualItem.value <= 0) continue

        closeableItems.push({
            source_kind: "manual_elyakim",
            source_ref_id: manualItem.id,
            brand: manualItem.brand,
            beneficiary_user_id: manualItem.beneficiaryUserId,
            beneficiary_name: manualItem.beneficiaryName,
            transaction_type: manualItem.transactionType,
            amount: manualItem.value,
            description: manualItem.observacao || `Manual Elyakim - ${manualItem.clientName ?? manualItem.id.slice(0, 8)}`,
            origin_lead_id: manualItem.originLeadId,
            client_name: manualItem.clientName,
            source_competencia: manualItem.competencia,
        })
    }

    closeableItems.sort((a, b) => b.amount - a.amount)

    const visibleCloseableItems = selectedBrand === "all"
        ? closeableItems
        : closeableItems.filter((item) => item.brand === selectedBrand)

    const closeableTotal = visibleCloseableItems.reduce((sum, item) => sum + item.amount, 0)
    const closeableRentalTotal = visibleCloseableItems
        .filter((item) => item.brand === "rental")
        .reduce((sum, item) => sum + item.amount, 0)
    const closeableDorataTotal = visibleCloseableItems
        .filter((item) => item.brand === "dorata")
        .reduce((sum, item) => sum + item.amount, 0)

    const closingDossiers: FinancialClosingDossier[] = (closings as any[]).map((closing) => {
        const closer = usersById.get(closing.fechado_por)
        const items = (closingItemsByClosingId.get(closing.id as string) ?? [])
            .slice()
            .sort((a, b) => {
                const dateA = new Date(a.paymentDate || a.createdAt || 0).getTime()
                const dateB = new Date(b.paymentDate || b.createdAt || 0).getTime()
                return dateB - dateA
            })

        return {
            id: closing.id as string,
            code: (closing.codigo as string) ?? "Sem código",
            status: (closing.status as string) ?? "fechado",
            competencia: (closing.competencia as string | null) ?? null,
            closedAt: (closing.fechado_em as string | null) ?? null,
            createdAt: (closing.created_at as string | null) ?? null,
            closedByName: closer?.name || closer?.email || "Sistema",
            observation: (closing.observacao as string | null) ?? null,
            itemCount: Number(closing.total_itens ?? items.length ?? 0),
            totalValue: Number(closing.total_valor ?? 0),
            items,
        }
    })

    const visibleClosingDossiers = selectedBrand === "all"
        ? closingDossiers
        : closingDossiers
            .map((closing) => {
                const brandItems = closing.items.filter((item) => item.brand === selectedBrand)
                if (brandItems.length === 0) return null
                return {
                    ...closing,
                    items: brandItems,
                    itemCount: brandItems.length,
                    totalValue: brandItems.reduce((sum, item) => sum + item.valuePaid, 0),
                }
            })
            .filter((closing): closing is FinancialClosingDossier => Boolean(closing))

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                        Gestão de Comissões
                        {isDorataBrandView ? " Dorata" : isRentalBrandView ? " Rental" : ""}
                    </h1>
                    <p className="text-muted-foreground">
                        {isDorataBrandView
                            ? "Visão focada na operação Dorata: previsões, pagamentos e histórico da marca."
                            : isRentalBrandView
                                ? "Visão focada na operação Rental: gatilho 30/70, vendedor e override de gestão."
                                : "Painel consolidado com dados de Rental e Dorata."}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <form method="get" className="flex items-center gap-2">
                        <input type="hidden" name="brand" value={selectedBrand} />
                        <input type="hidden" name="tab" value={selectedTab} />
                        <label htmlFor="seller" className="text-sm text-muted-foreground">Vendedor</label>
                        <select
                            id="seller"
                            name="seller"
                            defaultValue={selectedSellerId}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="all">Todos</option>
                            {sellerOptions.map((seller) => (
                                <option key={seller.id} value={seller.id}>
                                    {seller.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
                        >
                            Filtrar
                        </button>
                    </form>
                    <NewTransactionDialog users={sellerOptions as any[]} />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visualização</span>
                <a
                    href={buildFinancialPageHref({ seller: selectedSellerId, tab: selectedTab, brand: "all" })}
                    className={selectedBrand === "all"
                        ? "h-8 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                        : "h-8 rounded-full border border-input bg-background px-4 text-sm font-medium hover:bg-muted"}
                >
                    Tudo
                </a>
                <a
                    href={buildFinancialPageHref({ seller: selectedSellerId, tab: selectedTab, brand: "dorata" })}
                    className={isDorataBrandView
                        ? "h-8 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                        : "h-8 rounded-full border border-input bg-background px-4 text-sm font-medium hover:bg-muted"}
                >
                    Dorata
                </a>
                <a
                    href={buildFinancialPageHref({ seller: selectedSellerId, tab: selectedTab, brand: "rental" })}
                    className={isRentalBrandView
                        ? "h-8 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                        : "h-8 rounded-full border border-input bg-background px-4 text-sm font-medium hover:bg-muted"}
                >
                    Rental
                </a>
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Páginas diretas:</span>
                    <a href="/admin/financeiro/dorata" className="underline-offset-2 hover:underline">/dorata</a>
                    <span>•</span>
                    <a href="/admin/financeiro/rental" className="underline-offset-2 hover:underline">/rental</a>
                </div>
            </div>

            {feedback ? (
                <div
                    className={
                        feedback.tone === "success"
                            ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                            : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    }
                >
                    <div>{feedback.text}</div>
                    {feedback.tone === "error" && feedbackDetail ? (
                        <div className="mt-1 text-xs opacity-80">{feedbackDetail}</div>
                    ) : null}
                </div>
            ) : null}

            <Tabs key={selectedTab} defaultValue={selectedTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="previsoes">Previsões</TabsTrigger>
                    <TabsTrigger value="liberado">Liberado para pagar</TabsTrigger>
                    <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="previsoes" className="space-y-8 mt-0">
                    <div className={`grid gap-4 md:grid-cols-2 ${isDorataBrandView ? "xl:grid-cols-4" : "xl:grid-cols-6"}`}>
                        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <h3 className="tracking-tight text-sm font-medium">Caixa / Líquido</h3>
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className={`text-2xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {formatCurrency(totalBalance)}
                            </div>
                            <p className="text-xs text-muted-foreground">Saldo acumulado dos lançamentos filtrados</p>
                        </div>

                        {isDorataBrandView ? (
                            <>
                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Contrato Dorata</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalDorataContract)}</div>
                                    <p className="text-xs text-muted-foreground">Total de contratos Dorata no filtro</p>
                                </div>
                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Comissão Dorata</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalDorataCommission)}</div>
                                    <p className="text-xs text-muted-foreground">Comissão total prevista Dorata</p>
                                </div>
                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Pago Dorata</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(dorataPaymentsTotal)}</div>
                                    <p className="text-xs text-muted-foreground">Lançamentos comissao_dorata</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Base Rental</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalRentalBase)}</div>
                                    <p className="text-xs text-muted-foreground">Σ (kWh x preço) por indicação</p>
                                </div>

                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Comissão Rental</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalRentalCommission)}</div>
                                    <p className="text-xs text-muted-foreground">Total projetado de comissão do vendedor</p>
                                </div>

                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Entrada 30%</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalRentalThirty)}</div>
                                    <p className="text-xs text-muted-foreground">Somente gestor no contrato assinado</p>
                                </div>

                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Saldo no Pagamento</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalRentalSeventyAdjusted)}</div>
                                    <p className="text-xs text-muted-foreground">Para gestor: 70%; demais: total na fatura paga</p>
                                </div>

                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <h3 className="tracking-tight text-sm font-medium">Override {managerName}</h3>
                                        <Wallet className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="text-2xl font-bold">{formatCurrency(totalManagerOverride)}</div>
                                    <p className="text-xs text-muted-foreground">{formatPercent(managerOverridePercentDisplay)} sobre vendas de terceiros</p>
                                </div>
                            </>
                        )}
                    </div>

                    {!isDorataBrandView ? (
                        <>
                            <RentalCommissionSettings
                                managerName={managerName}
                                defaultPercent={rentalDefaultPercentDisplay}
                                managerOverridePercent={managerOverridePercentDisplay}
                                sellerRates={commissionSettingsRows}
                                clientRates={clientCommissionSettingsRows}
                            />

                            <div className="grid gap-6 xl:grid-cols-2">
                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4 overflow-x-auto">
                                    <div>
                                        <h2 className="text-lg font-semibold">Previsões Rental (30/70)</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Base = Consumo Médio PF x Preço kWh x (1 - desconto%). 30% apenas para {managerName}.
                                        </p>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Vendedor</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead className="text-right">Base</TableHead>
                                                <TableHead className="text-right">% Com.</TableHead>
                                                <TableHead className="text-right">Comissão</TableHead>
                                                <TableHead>30%</TableHead>
                                                <TableHead>70%</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {visibleRentalForecastRows.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                                                        Nenhuma previsão Rental registrada.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                visibleRentalForecastRows.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                                                        <TableCell>{item.sellerName}</TableCell>
                                                        <TableCell>{item.nome}</TableCell>
                                                        <TableCell className="text-right">{item.hasCommissionBase ? formatCurrency(item.baseValue) : "—"}</TableCell>
                                                        <TableCell className="text-right">{formatPercent(item.commissionPercentDisplay)}</TableCell>
                                                        <TableCell className="text-right">{item.hasCommissionBase ? formatCurrency(item.commissionTotal) : "—"}</TableCell>
                                                        <TableCell>
                                                            <div className="text-xs">
                                                                <div className="font-medium">{item.hasCommissionBase ? formatCurrency(item.thirtyPercentValue) : "—"}</div>
                                                                <div className="text-muted-foreground">{item.thirtyStatus}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-xs">
                                                                <div className="font-medium">{item.hasCommissionBase ? formatCurrency(item.seventyAdjusted) : "—"}</div>
                                                                <div className="text-muted-foreground">{item.seventyStatus}</div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4 overflow-x-auto">
                                    <div>
                                        <h2 className="text-lg font-semibold">Override Gestor ({managerName})</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Override de {formatPercent(managerOverridePercentDisplay)} aplicado nas vendas Rental de outros vendedores.
                                        </p>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Origem</TableHead>
                                                <TableHead>Cliente</TableHead>
                                                <TableHead className="text-right">Comissão</TableHead>
                                                <TableHead>30%</TableHead>
                                                <TableHead>70%</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {visibleManagerOverrideRows.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                                        Nenhum override do gestor para o filtro atual.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                visibleManagerOverrideRows.map((item) => (
                                                    <TableRow key={`override-${item.id}`}>
                                                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                                                        <TableCell>{item.sellerName}</TableCell>
                                                        <TableCell>{item.nome}</TableCell>
                                                        <TableCell className="text-right">{item.hasCommissionBase ? formatCurrency(item.commissionTotal) : "—"}</TableCell>
                                                        <TableCell>
                                                            <div className="text-xs">
                                                                <div className="font-medium">{item.hasCommissionBase ? formatCurrency(item.thirtyPercentValue) : "—"}</div>
                                                                <div className="text-muted-foreground">{item.thirtyStatus}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-xs">
                                                                <div className="font-medium">{item.hasCommissionBase ? formatCurrency(item.seventyAdjusted) : "—"}</div>
                                                                <div className="text-muted-foreground">{item.seventyStatus}</div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </>
                    ) : null}

                    {!isRentalBrandView ? (
                        <div className="grid gap-6">
                            <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                                <div>
                                    <h2 className="text-lg font-semibold">Previsões Dorata</h2>
                                    <p className="text-sm text-muted-foreground">Orçamentos enviados e indicações Dorata com valor informado.</p>
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Vendedor</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead className="text-right">Contrato</TableHead>
                                            <TableHead className="text-right">% Com.</TableHead>
                                            <TableHead className="text-right">Comissão</TableHead>
                                            <TableHead>Status comissão</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {visibleDorataForecasts.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                                                    Nenhuma previsão Dorata registrada.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            visibleDorataForecasts.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>{formatDate(item.created_at)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <span>{item.seller?.name || item.seller?.email || 'Sistema'}</span>
                                                            {item.isSplitRecipient ? (
                                                                <span className="text-xs text-muted-foreground">Comissão dividida</span>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <span>{item.nome || "—"}</span>
                                                            {item.splitLabel ? (
                                                                <span className="text-xs text-muted-foreground">{item.splitLabel}</span>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.contractValue)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span>{formatPercent(item.commissionPercentDisplay)}</span>
                                                            <span className="text-xs text-muted-foreground">{item.commissionPercentSource}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatCurrency(item.commissionValue)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <Badge variant={item.signed ? "success" : "secondary"}>{item.commissionStatus}</Badge>
                                                            <span className="text-xs text-muted-foreground">
                                                                {item.signedAt ? `Assinado em ${formatDate(item.signedAt)}` : "Aguardando contrato assinado"}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                                <div className="rounded-md bg-muted/50 p-3 text-sm">
                                    <span className="font-medium">Totais Dorata:</span>{" "}
                                    Contrato {formatCurrency(totalDorataContract)} | Comissão {formatCurrency(totalDorataCommission)}
                                </div>
                            </div>

                            <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold">Pagamentos Dorata</h2>
                                        <p className="text-sm text-muted-foreground">Lançamentos do tipo comissao_dorata.</p>
                                    </div>
                                    <span className="text-sm font-semibold">{formatCurrency(dorataPaymentsTotal)}</span>
                                </div>
                                <FinancialList transactions={dorataPayments as any[]} />
                            </div>
                        </div>
                    ) : null}

                    {!isDorataBrandView ? (
                        <div className="grid gap-6">
                            <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold">Pagamentos Rental</h2>
                                        <p className="text-sm text-muted-foreground">Lançamentos do tipo comissao_venda.</p>
                                    </div>
                                    <span className="text-sm font-semibold">{formatCurrency(rentalPaymentsTotal)}</span>
                                </div>
                                <FinancialList transactions={rentalPayments as any[]} />
                            </div>

                            <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold">Pagamentos Override</h2>
                                        <p className="text-sm text-muted-foreground">Lançamentos do tipo override_gestao.</p>
                                    </div>
                                    <span className="text-sm font-semibold">{formatCurrency(overridePaymentsTotal)}</span>
                                </div>
                                <FinancialList transactions={overridePayments as any[]} />
                            </div>
                        </div>
                    ) : null}
                </TabsContent>

                <TabsContent value="liberado" className="space-y-6 mt-0">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                            <p className="text-sm text-muted-foreground">Total liberado</p>
                            <p className="text-2xl font-bold">{formatCurrency(closeableTotal)}</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                            <p className="text-sm text-muted-foreground">Liberado Rental</p>
                            <p className="text-2xl font-bold">{formatCurrency(closeableRentalTotal)}</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                            <p className="text-sm text-muted-foreground">Liberado Dorata</p>
                            <p className="text-2xl font-bold">{formatCurrency(closeableDorataTotal)}</p>
                        </div>
                    </div>

                    <form action={closeCommissionBatchFromForm} className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                        <input type="hidden" name="return_seller" value={selectedSellerId} />
                        <input type="hidden" name="return_brand" value={selectedBrand} />
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                            <div className="flex flex-col gap-1">
                                <label htmlFor="competencia" className="text-sm font-medium">Competência</label>
                                <input
                                    id="competencia"
                                    name="competencia"
                                    type="month"
                                    defaultValue={new Date().toISOString().slice(0, 7)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="payment_date" className="text-sm font-medium">Data de pagamento</label>
                                <input
                                    id="payment_date"
                                    name="payment_date"
                                    type="date"
                                    defaultValue={new Date().toISOString().slice(0, 10)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                                <label htmlFor="observacao" className="text-sm font-medium">Observação</label>
                                <input
                                    id="observacao"
                                    name="observacao"
                                    type="text"
                                    placeholder="Ex: fechamento quinzenal fevereiro"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                            >
                                Fechar pagamento selecionado
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Itens do relatório manual entram aqui mesmo quando a competência for de mês anterior. Exemplo: competência dezembro, pagamento em fevereiro.
                        </p>

                        <div className="rounded-md border border-dashed p-4 space-y-3">
                            <div>
                                <p className="text-sm font-medium">Despesa para desconto (opcional)</p>
                                <p className="text-xs text-muted-foreground">
                                    Se preenchida, essa despesa entra no fechamento e é descontada do total líquido a pagar.
                                </p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="apply_expense"
                                    value="1"
                                    className="h-4 w-4 rounded border-gray-300 text-primary"
                                />
                                Aplicar despesa neste fechamento
                            </label>
                            <div className="grid gap-3 md:grid-cols-4">
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="expense_beneficiary_user_id" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Beneficiário
                                    </label>
                                    <select
                                        id="expense_beneficiary_user_id"
                                        name="expense_beneficiary_user_id"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                        <option value="">Sem despesa</option>
                                        {payableSellerOptions.map((seller) => (
                                            <option key={`expense-user-${seller.id}`} value={seller.id}>
                                                {seller.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="expense_brand" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Marca
                                    </label>
                                    <select
                                        id="expense_brand"
                                        name="expense_brand"
                                        defaultValue="rental"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                        <option value="rental">Rental</option>
                                        <option value="dorata">Dorata</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1 md:col-span-2">
                                    <label htmlFor="expense_description" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Descrição da despesa
                                    </label>
                                    <input
                                        id="expense_description"
                                        name="expense_description"
                                        type="text"
                                        placeholder="Ex: Seguro do veículo"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="expense_amount" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Valor (R$)
                                    </label>
                                    <input
                                        id="expense_amount"
                                        name="expense_amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Selecionar</TableHead>
                                        <TableHead>Marca</TableHead>
                                        <TableHead>Beneficiário</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Competência origem</TableHead>
                                        <TableHead>Origem</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead className="text-right">Valor disponível</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleCloseableItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                                Nenhum item liberado para fechar no momento.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        visibleCloseableItems.map((item) => (
                                            <TableRow key={`${item.source_kind}:${item.source_ref_id}:${item.transaction_type}:${item.beneficiary_user_id}`}>
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        name="selected_items"
                                                        value={encodeURIComponent(JSON.stringify({
                                                            source_kind: item.source_kind,
                                                            source_ref_id: item.source_ref_id,
                                                            brand: item.brand,
                                                            beneficiary_user_id: item.beneficiary_user_id,
                                                            transaction_type: item.transaction_type,
                                                            amount: Number(item.amount.toFixed(2)),
                                                            description: item.description,
                                                            origin_lead_id: item.origin_lead_id,
                                                            client_name: item.client_name,
                                                        }))}
                                                        className="h-4 w-4 rounded border-gray-300 text-primary"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={item.brand === "rental" ? "secondary" : "default"}>
                                                        {item.brand === "rental" ? "Rental" : "Dorata"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{item.beneficiary_name}</TableCell>
                                                <TableCell>{item.client_name || "—"}</TableCell>
                                                <TableCell>
                                                    {item.source_kind === "manual_elyakim" && item.source_competencia
                                                        ? formatDate(item.source_competencia)
                                                        : "—"}
                                                </TableCell>
                                                <TableCell>
                                                    {item.source_kind === "manual_elyakim" ? "Manual Elyakim" : "Sistema"}
                                                </TableCell>
                                                <TableCell>{item.transaction_type}</TableCell>
                                                <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </form>

                    <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Relatório Elyakim (manual)</h2>
                            <p className="text-sm text-muted-foreground">
                                Use quando a comissão da Rental ainda não estiver 100% no app. O item entra como liberado e aparece na lista de fechamento.
                            </p>
                        </div>

                        <form action={createManualElyakimItemFromForm} className="grid gap-4 md:grid-cols-2">
                            <input type="hidden" name="return_seller" value={selectedSellerId} />
                            <input type="hidden" name="return_brand" value={selectedBrand} />
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_competencia" className="text-sm font-medium">Competência</label>
                                <input
                                    id="manual_competencia"
                                    name="competencia"
                                    type="month"
                                    defaultValue={new Date().toISOString().slice(0, 7)}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_beneficiary_user_id" className="text-sm font-medium">Beneficiário</label>
                                <select
                                    id="manual_beneficiary_user_id"
                                    name="beneficiary_user_id"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    required
                                >
                                    <option value="">Selecione...</option>
                                    {payableSellerOptions.map((seller) => (
                                        <option key={`manual-user-${seller.id}`} value={seller.id}>
                                            {seller.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_brand" className="text-sm font-medium">Marca</label>
                                <select
                                    id="manual_brand"
                                    name="brand"
                                    defaultValue={selectedBrand === "all" ? "rental" : selectedBrand}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="rental">Rental</option>
                                    <option value="dorata">Dorata</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_transaction_type" className="text-sm font-medium">Tipo</label>
                                <select
                                    id="manual_transaction_type"
                                    name="transaction_type"
                                    defaultValue="comissao_venda"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="comissao_venda">comissao_venda</option>
                                    <option value="comissao_dorata">comissao_dorata</option>
                                    <option value="override_gestao">override_gestao</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1 md:col-span-2">
                                <label htmlFor="manual_client_name" className="text-sm font-medium">Cliente</label>
                                <input
                                    id="manual_client_name"
                                    name="client_name"
                                    type="text"
                                    placeholder="Nome do cliente"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_amount" className="text-sm font-medium">Valor (R$)</label>
                                <input
                                    id="manual_amount"
                                    name="amount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_origin_lead_id" className="text-sm font-medium">ID indicação (opcional)</label>
                                <input
                                    id="manual_origin_lead_id"
                                    name="origin_lead_id"
                                    type="text"
                                    placeholder="UUID da indicação"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_external_ref" className="text-sm font-medium">Referência externa</label>
                                <input
                                    id="manual_external_ref"
                                    name="external_ref"
                                    type="text"
                                    placeholder="Ex: Elyakim #142"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="manual_observacao" className="text-sm font-medium">Observação</label>
                                <input
                                    id="manual_observacao"
                                    name="observacao"
                                    type="text"
                                    placeholder="Comentário opcional"
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <button
                                    type="submit"
                                    className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                                >
                                    Adicionar item manual
                                </button>
                            </div>
                        </form>
                    </div>
                </TabsContent>

                <TabsContent value="historico" className="space-y-6 mt-0">
                    <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Fechamentos realizados</h2>
                            <p className="text-sm text-muted-foreground">
                                Histórico dos lotes pagos de comissão.
                            </p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Código</TableHead>
                                    <TableHead>Competência</TableHead>
                                    <TableHead>Data fechamento</TableHead>
                                    <TableHead>Fechado por</TableHead>
                                    <TableHead className="text-right">Itens</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleClosingDossiers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                            Nenhum fechamento registrado ainda.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    visibleClosingDossiers.map((closing) => {
                                        return (
                                            <TableRow key={closing.id}>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <FinancialClosingDossierDialog closing={closing} />
                                                        <span className="text-xs text-muted-foreground">
                                                            Clique para abrir o dossiê
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{formatDate(closing.competencia)}</TableCell>
                                                <TableCell>{formatDate(closing.closedAt || closing.createdAt)}</TableCell>
                                                <TableCell>{closing.closedByName}</TableCell>
                                                <TableCell className="text-right">{closing.itemCount || 0}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(Number(closing.totalValue || 0))}</TableCell>
                                                <TableCell>
                                                    <Badge variant={closing.status === "fechado" ? "success" : closing.status === "cancelado" ? "destructive" : "secondary"}>
                                                        {closing.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Itens manuais Elyakim</h2>
                            <p className="text-sm text-muted-foreground">
                                Histórico dos lançamentos manuais e respectivos status de pagamento.
                            </p>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Competência</TableHead>
                                    <TableHead>Beneficiário</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Marca</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Recebido em</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleManualItemsRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                            Nenhum item manual registrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    visibleManualItemsRows.map((item) => (
                                        <TableRow key={`manual-${item.id}`}>
                                            <TableCell>{formatDate(item.createdAt)}</TableCell>
                                            <TableCell>{formatDate(item.competencia)}</TableCell>
                                            <TableCell>{item.beneficiaryName}</TableCell>
                                            <TableCell>{item.clientName || "—"}</TableCell>
                                            <TableCell>{item.brand === "rental" ? "Rental" : "Dorata"}</TableCell>
                                            <TableCell>{item.transactionType}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(item.value)}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.status === "pago" ? "success" : "secondary"}>{item.status}</Badge>
                                            </TableCell>
                                            <TableCell>{formatDate(item.paidAt)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
