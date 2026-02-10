import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getFinancialSummary } from "@/app/actions/financial"
import { FinancialList } from "@/components/financial/financial-list"
import { getUsers } from "@/app/actions/auth-admin"
import { NewTransactionDialog } from "@/components/financial/new-transaction-dialog"
import { RentalCommissionSettings } from "@/components/financial/rental-commission-settings"
import { getPricingRules } from "@/services/proposal-service"
import { Wallet } from "lucide-react"
import { getProfile, hasFullAccess } from "@/lib/auth"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

type FinancialSearchParams = {
    seller?: string | string[]
}

type SellerRow = {
    id: string
    name: string
    email: string
}

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

function extractRentalBase(metadata: any, fallbackValue: number) {
    const consumoMedioKwh = toNumber(
        metadata?.consumoMedioPF ??
        metadata?.consumoMedioKwh ??
        metadata?.consumo_medio_kwh ??
        0
    )
    const precoKwh = toNumber(metadata?.precoKwh ?? metadata?.preco_kwh ?? 0)
    const descontoRaw = toNumber(metadata?.desconto ?? metadata?.desconto_percent ?? 0)
    const desconto = Math.min(Math.max(descontoRaw, 0), 100)
    const precoComDesconto = precoKwh > 0 ? precoKwh * (1 - desconto / 100) : 0
    const valorContaEnergia = toNumber(metadata?.valorContaEnergia ?? metadata?.valor_conta_energia ?? 0)
    const precoPelaConta = consumoMedioKwh > 0 ? valorContaEnergia / consumoMedioKwh : 0

    const precoFinal = precoComDesconto > 0 ? precoComDesconto : (precoKwh > 0 ? precoKwh : precoPelaConta)
    const calculado = consumoMedioKwh > 0 && precoFinal > 0
        ? consumoMedioKwh * precoFinal
        : fallbackValue

    return {
        baseValue: calculado,
        consumoMedioKwh,
        precoKwh: precoFinal,
    }
}

export default async function FinancialPage({ searchParams }: { searchParams?: Promise<FinancialSearchParams> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    if (!profile || (!hasFullAccess(role) && !['funcionario_n1', 'funcionario_n2'].includes(role ?? ''))) {
        redirect("/dashboard")
    }

    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const sellerParam = Array.isArray(resolvedSearchParams?.seller)
        ? resolvedSearchParams?.seller[0]
        : resolvedSearchParams?.seller

    const selectedSellerId = typeof sellerParam === "string" && sellerParam.length > 0
        ? sellerParam
        : "all"
    const sellerFilterId = selectedSellerId === "all" ? null : selectedSellerId

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
    ] = await Promise.all([
        supabaseAdmin
            .from('proposals')
            .select('id, created_at, total_value, calculation, seller_id, seller:users(id, name, email), cliente:indicacoes(id, nome, marca)')
            .eq('status', 'sent')
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('indicacoes')
            .select('id, created_at, nome, status, valor, user_id, assinada_em, compensada_em, users!indicacoes_user_id_fkey(id, name, email)')
            .eq('marca', 'rental')
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('indicacoes')
            .select('id, created_at, nome, status, valor, user_id, users!indicacoes_user_id_fkey(id, name, email)')
            .eq('marca', 'dorata')
            .not('valor', 'is', null)
            .order('created_at', { ascending: false }),
        supabaseAdmin
            .from('faturas_conciliacao')
            .select('cliente_id, mes_ano, status_pagamento')
            .eq('status_pagamento', 'PAGO')
    ])

    const dorataProposals = dorataProposalsResult.data ?? []
    const rentalIndicacoes = rentalIndicacoesResult.data ?? []
    const dorataIndicacoes = dorataIndicacoesResult.data ?? []
    const paidInvoices = paidInvoicesResult.data ?? []

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

    const sellerPercentByUserId = new Map<string, number>()
    const sellerPercentDisplayByUserId = new Map<string, number>()
    for (const rule of pricingRules) {
        if (!rule.key.startsWith('rental_commission_percent_user_')) continue
        const userId = rule.key.replace('rental_commission_percent_user_', '').trim()
        if (!userId) continue
        sellerPercentByUserId.set(userId, toFraction(rule.value, rentalDefaultPercentDisplay))
        sellerPercentDisplayByUserId.set(userId, toPercentDisplay(rule.value, rentalDefaultPercentDisplay))
    }

    const managerUser = (users as any[]).find((item) => normalizeText(item.name) === "guilherme damasceno")
    const managerUserId = managerUser?.id ?? null
    const managerName = managerUser?.name || "Guilherme Damasceno"

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
    for (const tx of transactions as any[]) {
        if (tx.status !== 'pago') continue
        if (!tx.origin_lead_id || !tx.beneficiary_user_id) continue
        const amount = toNumber(tx.amount)
        if (amount <= 0) continue
        const key = `${tx.origin_lead_id}:${tx.beneficiary_user_id}`

        if (tx.type === 'comissao_venda') {
            paidCommissionByLeadBeneficiary.set(key, (paidCommissionByLeadBeneficiary.get(key) ?? 0) + amount)
        }
        if (tx.type === 'override_gestao') {
            paidOverrideByLeadBeneficiary.set(key, (paidOverrideByLeadBeneficiary.get(key) ?? 0) + amount)
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

    const dorataProposalsFiltered = dorataProposals.filter(
        (proposal: any) => proposal?.cliente?.marca === 'dorata'
    )

    const dorataProposalClientIds = new Set(
        dorataProposalsFiltered
            .map((proposal: any) => proposal?.cliente?.id)
            .filter(Boolean)
    )

    const dorataForecastsFromProposals = dorataProposalsFiltered.map((proposal: any) => {
        const calculation = proposal.calculation as any
        const storedCommission = calculation?.commission
        const contractValue = Number(storedCommission?.base_value ?? proposal.total_value ?? 0)
        const commissionPercent = Number(storedCommission?.percent ?? defaultDorataCommissionPercent)
        const commissionValue = Number(storedCommission?.value ?? contractValue * commissionPercent)

        return {
            id: proposal.id as string,
            created_at: proposal.created_at as string,
            sellerId: (proposal.seller?.id as string | null) ?? (proposal.seller_id as string | null) ?? null,
            seller: proposal.seller,
            contractValue,
            commissionPercent,
            commissionValue
        }
    })

    const dorataForecastsFromIndicacoes = dorataIndicacoes
        .filter((indicacao: any) => !dorataProposalClientIds.has(indicacao.id))
        .map((indicacao: any) => {
            const contractValue = Number(indicacao.valor ?? 0)
            const commissionPercent = Number(defaultDorataCommissionPercent)
            const commissionValue = contractValue * commissionPercent

            return {
                id: indicacao.id as string,
                created_at: indicacao.created_at as string,
                sellerId: (indicacao.users?.id as string | null) ?? (indicacao.user_id as string | null) ?? null,
                seller: indicacao.users,
                contractValue,
                commissionPercent,
                commissionValue
            }
        })

    const dorataForecasts = [...dorataForecastsFromProposals, ...dorataForecastsFromIndicacoes]
    const filteredDorataForecasts = sellerFilterId
        ? dorataForecasts.filter((item) => item.sellerId === sellerFilterId)
        : dorataForecasts

    const rentalForecastRows = rentalIndicacoes.map((indicacao: any) => {
        const metadata = rentalMetadataByLead.get(indicacao.id) ?? null
        const base = extractRentalBase(metadata, Number(indicacao.valor ?? 0))
        const sellerId = indicacao.user_id as string
        const sellerPercent = sellerPercentByUserId.get(sellerId) ?? rentalDefaultCommissionPercent
        const sellerPercentDisplay = sellerPercentDisplayByUserId.get(sellerId) ?? rentalDefaultPercentDisplay

        const commissionTotal = base.baseValue * sellerPercent
        const thirtyPercentValue = commissionTotal * 0.3
        const seventyPercentForecast = commissionTotal * 0.7
        const signed = Boolean(indicacao.assinada_em) || indicacao.status === "CONCLUIDA"
        const paidInvoiceDate = paidInvoiceDateByLead.get(indicacao.id as string) ?? null
        const hasPaidInvoice = Boolean(paidInvoiceDate)

        const paidSellerCommission = paidCommissionByLeadBeneficiary.get(`${indicacao.id}:${sellerId}`) ?? 0
        const thirtyStatus = signed
            ? (paidSellerCommission >= thirtyPercentValue ? "Pago" : "Liberado")
            : "Aguardando assinatura"
        const seventyStatus = hasPaidInvoice
            ? (paidSellerCommission >= commissionTotal ? "Pago" : "Liberado")
            : "Aguardando fatura paga"

        const seventyAdjusted = hasPaidInvoice
            ? Math.max(commissionTotal - paidSellerCommission, 0)
            : seventyPercentForecast

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
        }
    })

    const filteredRentalForecastRows = sellerFilterId
        ? rentalForecastRows.filter((row) => row.sellerId === sellerFilterId)
        : rentalForecastRows

    const managerOverrideRows = managerUserId
        ? rentalForecastRows
            .filter((row) => row.sellerId !== managerUserId)
            .map((row) => {
                const commissionTotal = row.baseValue * managerOverridePercent
                const thirtyPercentValue = commissionTotal * 0.3
                const seventyPercentForecast = commissionTotal * 0.7
                const paidOverride = paidOverrideByLeadBeneficiary.get(`${row.id}:${managerUserId}`) ?? 0

                const seventyAdjusted = row.hasPaidInvoice
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
                    thirtyStatus: row.signed
                        ? (paidOverride >= thirtyPercentValue ? "Pago" : "Liberado")
                        : "Aguardando assinatura",
                    seventyStatus: row.hasPaidInvoice
                        ? (paidOverride >= commissionTotal ? "Pago" : "Liberado")
                        : "Aguardando fatura paga",
                }
            })
        : []

    const filteredManagerOverrideRows = !sellerFilterId
        ? managerOverrideRows
        : managerOverrideRows.filter((row) => row.sellerId === sellerFilterId || row.beneficiaryUserId === sellerFilterId)

    const sellerRowsMap = new Map<string, SellerRow>()
    for (const row of rentalForecastRows) {
        sellerRowsMap.set(row.sellerId, {
            id: row.sellerId,
            name: row.sellerName,
            email: row.sellerEmail,
        })
    }
    for (const userRow of users as any[]) {
        const hasRentalBrand = Array.isArray(userRow.allowed_brands) && userRow.allowed_brands.includes("rental")
        if (!hasRentalBrand && !sellerRowsMap.has(userRow.id)) continue
        sellerRowsMap.set(userRow.id, {
            id: userRow.id,
            name: userRow.name || userRow.email || "Sem nome",
            email: userRow.email || "",
        })
    }

    const sellerOptions = Array.from(sellerRowsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    const commissionSettingsRows = sellerOptions.map((seller) => ({
        userId: seller.id,
        name: seller.name,
        email: seller.email,
        percent: sellerPercentDisplayByUserId.get(seller.id) ?? rentalDefaultPercentDisplay,
        isCustom: sellerPercentDisplayByUserId.has(seller.id),
    }))

    const totalDorataContract = filteredDorataForecasts.reduce((sum, item) => sum + item.contractValue, 0)
    const totalDorataCommission = filteredDorataForecasts.reduce((sum, item) => sum + item.commissionValue, 0)

    const totalRentalBase = filteredRentalForecastRows.reduce((sum, item) => sum + item.baseValue, 0)
    const totalRentalCommission = filteredRentalForecastRows.reduce((sum, item) => sum + item.commissionTotal, 0)
    const totalRentalThirty = filteredRentalForecastRows.reduce((sum, item) => sum + item.thirtyPercentValue, 0)
    const totalRentalSeventyAdjusted = filteredRentalForecastRows.reduce((sum, item) => sum + item.seventyAdjusted, 0)
    const totalManagerOverride = filteredManagerOverrideRows.reduce((sum, item) => sum + item.commissionTotal, 0)

    const filteredTransactions = sellerFilterId
        ? (transactions as any[]).filter((tx) => tx.beneficiary_user_id === sellerFilterId)
        : (transactions as any[])

    const dorataPayments = filteredTransactions.filter((tx: any) => tx.type === 'comissao_dorata')
    const rentalPayments = filteredTransactions.filter((tx: any) => tx.type === 'comissao_venda')
    const overridePayments = filteredTransactions.filter((tx: any) => tx.type === 'override_gestao')

    const dorataPaymentsTotal = dorataPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const rentalPaymentsTotal = rentalPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const overridePaymentsTotal = overridePayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const totalBalance = filteredTransactions.reduce((acc, curr) => acc + (curr.amount || 0), 0)

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestão de Comissões</h1>
                    <p className="text-muted-foreground">
                        Rental com gatilho 30/70, cálculo por vendedor e override do gestor.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <form method="get" className="flex items-center gap-2">
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
                    <NewTransactionDialog users={users as any[]} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
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
                    <p className="text-xs text-muted-foreground">Valor da etapa contrato assinado</p>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">70% Ajustado</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(totalRentalSeventyAdjusted)}</div>
                    <p className="text-xs text-muted-foreground">Saldo após descontar o que já foi pago</p>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Override {managerName}</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(totalManagerOverride)}</div>
                    <p className="text-xs text-muted-foreground">{formatPercent(managerOverridePercentDisplay)} sobre vendas de terceiros</p>
                </div>
            </div>

            <RentalCommissionSettings
                managerName={managerName}
                defaultPercent={rentalDefaultPercentDisplay}
                managerOverridePercent={managerOverridePercentDisplay}
                sellerRates={commissionSettingsRows}
            />

            <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4 overflow-x-auto">
                    <div>
                        <h2 className="text-lg font-semibold">Previsões Rental (30/70)</h2>
                        <p className="text-sm text-muted-foreground">
                            30% libera em contrato assinado. 70% libera com Fatura PAGO e ajusta pelo já pago.
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
                            {filteredRentalForecastRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                                        Nenhuma previsão Rental registrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRentalForecastRows.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                                        <TableCell>{item.sellerName}</TableCell>
                                        <TableCell>{item.nome}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.baseValue)}</TableCell>
                                        <TableCell className="text-right">{formatPercent(item.commissionPercentDisplay)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.commissionTotal)}</TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <div className="font-medium">{formatCurrency(item.thirtyPercentValue)}</div>
                                                <div className="text-muted-foreground">{item.thirtyStatus}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <div className="font-medium">{formatCurrency(item.seventyAdjusted)}</div>
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
                            {filteredManagerOverrideRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                        Nenhum override do gestor para o filtro atual.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredManagerOverrideRows.map((item) => (
                                    <TableRow key={`override-${item.id}`}>
                                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                                        <TableCell>{item.sellerName}</TableCell>
                                        <TableCell>{item.nome}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.commissionTotal)}</TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <div className="font-medium">{formatCurrency(item.thirtyPercentValue)}</div>
                                                <div className="text-muted-foreground">{item.thirtyStatus}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xs">
                                                <div className="font-medium">{formatCurrency(item.seventyAdjusted)}</div>
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

            <div className="grid gap-6 xl:grid-cols-2">
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
                                <TableHead className="text-right">Contrato</TableHead>
                                <TableHead className="text-right">Comissão</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredDorataForecasts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                        Nenhuma previsão Dorata registrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredDorataForecasts.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{formatDate(item.created_at)}</TableCell>
                                        <TableCell>{item.seller?.name || item.seller?.email || 'Sistema'}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.contractValue)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.commissionValue)}</TableCell>
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

            <div className="grid gap-6 xl:grid-cols-2">
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
        </div>
    )
}
