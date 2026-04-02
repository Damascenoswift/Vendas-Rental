"use client"

import { useEffect, useMemo, useState } from "react"
import type { Product } from "@/services/product-service"
import { createProposal, updateProposal } from "@/services/proposal-service"
import type {
    PricingRule,
    ProposalInsert,
    ProposalEditorData,
    ProposalStatus,
    ProposalSellerOption,
} from "@/services/proposal-service"
import {
    calculateProposal,
    calculateInstallmentFromRate,
    calculateFinancedBalanceAfterGrace,
    solveMonthlyRateFromInstallment,
    type ProposalCalcInput,
    type ProposalCalcParams
} from "@/lib/proposal-calculation"
import {
    formatManualContractProductionEstimateInput,
    getManualContractProductionEstimate,
    withManualContractProductionEstimate,
} from "@/lib/proposal-contract-estimate"
import {
    getProposalStakeholderContacts,
    withProposalStakeholderContacts,
    type ProposalStakeholderBillingSource,
} from "@/lib/proposal-stakeholders"
import {
    buildEditProposalClientLinkPatch,
    validateProposalClientCreation,
} from "@/lib/proposal-client-binding"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { CurrencyMaskedInput } from "@/components/ui/currency-masked-input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, Calculator } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { LeadSelect } from "@/components/admin/tasks/lead-select"
import type {
    ProposalClientPrefill,
    ProposalMergeCandidate,
} from "@/components/admin/proposals/proposal-calculator"

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
    initialProposal?: ProposalEditorData | null
    intent?: "create" | "edit"
    sellerOptions?: ProposalSellerOption[]
    canAssignSeller?: boolean
    currentUserId?: string | null
    mergedProposal?: ProposalMergeCandidate | null
    initialClientPrefill?: ProposalClientPrefill | null
}

type RuleMap = Record<string, number>

type SelectedContact = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    whatsapp: string | null
    phone: string | null
    mobile: string | null
}

type ManualContactState = {
    first_name: string
    last_name: string
    whatsapp: string
}

type ProductionIndexSplitState = {
    label: string
    qtd_modulos: number
    indice_producao: number
}

const COMMISSION_SPLIT_PERCENT_OPTIONS = [1, 1.5, 2, 2.5, 3] as const
const COMMISSION_SPLIT_PERCENT_SET = new Set<number>(
    COMMISSION_SPLIT_PERCENT_OPTIONS.map((value) => Math.round(value * 10) / 10)
)

function toNumber(value: string) {
    const raw = (value ?? "").trim()
    if (!raw) return 0

    const sanitized = raw.replace(/\s/g, "")
    const normalized = sanitized.includes(",")
        ? sanitized.replace(/\./g, "").replace(",", ".")
        : sanitized

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrencyValue(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function formatDecimalForInput(value: number, fractionDigits = 2) {
    if (!Number.isFinite(value)) return ""
    return value.toFixed(fractionDigits).replace(".", ",")
}

function buildRuleMap(rules?: PricingRule[]) {
    const map: RuleMap = {}
    ;(rules ?? []).forEach((rule) => {
        if (rule.active) {
            map[rule.key] = Number(rule.value)
        }
    })
    return map
}

function normalizePercent(value: number, fallback: number) {
    if (!Number.isFinite(value)) return fallback
    return value > 1 ? value / 100 : value
}

function normalizeNonNegativePercent(value: number, fallback: number) {
    return Math.max(normalizePercent(value, fallback), 0)
}

function normalizeTradeMode(value: string | null | undefined): NonNullable<ProposalCalcInput["trade"]>["mode"] {
    return value === "INSTALLMENTS" ? "INSTALLMENTS" : "TOTAL_VALUE"
}

function normalizeInverterType(value: string | null | undefined): ProposalCalcInput["dimensioning"]["tipo_inversor"] {
    if (value === "MICRO") return "MICRO"
    if (value === "AMPLIACAO") return "AMPLIACAO"
    return "STRING"
}

function normalizeStatusForForm(status: ProposalStatus | null | undefined): "draft" | "sent" {
    return status === "draft" ? "draft" : "sent"
}

function toInverterTypeLabel(value: ProposalCalcInput["dimensioning"]["tipo_inversor"]) {
    if (value === "MICRO") return "Micro inversor"
    if (value === "AMPLIACAO") return "Ampliação (sem inversor)"
    return "String"
}

function toStatusLabel(status: string | null | undefined) {
    if (!status) return "Sem status"
    if (status === "draft") return "Rascunho"
    if (status === "sent") return "Enviado"
    if (status === "accepted") return "Aceito"
    if (status === "rejected") return "Rejeitado"
    return status
}

function parseCommissionSplitPercentDisplay(value: unknown) {
    const parsed = toNumber(String(value ?? ""))
    if (!Number.isFinite(parsed)) return null
    const normalized = Math.round(parsed * 10) / 10
    return COMMISSION_SPLIT_PERCENT_SET.has(normalized) ? normalized : null
}

function formatSplitPercentOption(value: number) {
    return `${value.toFixed(1).replace(/\.0$/, "").replace(".", ",")}%`
}

function buildInitialProductionIndexSplits(params: {
    initialInput: ProposalCalcInput | null
    defaultIndex: number
    totalModules: number
}) {
    const rawSplits = Array.isArray(params.initialInput?.dimensioning?.indices_producao_multiplos)
        ? params.initialInput?.dimensioning?.indices_producao_multiplos
        : []

    const normalizedSplits = rawSplits
        .map((split) => ({
            label: (split?.label || "").trim(),
            qtd_modulos: Number(split?.qtd_modulos || 0),
            indice_producao: Number(split?.indice_producao || 0),
        }))
        .filter((split) =>
            Number.isFinite(split.qtd_modulos) &&
            split.qtd_modulos >= 0 &&
            Number.isFinite(split.indice_producao) &&
            split.indice_producao >= 0
        )

    if (normalizedSplits.length >= 2) {
        const [first, second] = normalizedSplits
        return {
            enabled: true,
            first: {
                label: first.label || "Norte",
                qtd_modulos: first.qtd_modulos,
                indice_producao: first.indice_producao,
            } satisfies ProductionIndexSplitState,
            second: {
                label: second.label || "Sul",
                qtd_modulos: second.qtd_modulos,
                indice_producao: second.indice_producao,
            } satisfies ProductionIndexSplitState,
        }
    }

    const safeTotalModules = Number.isFinite(params.totalModules) && params.totalModules > 0 ? params.totalModules : 0
    const firstModules = Math.floor(safeTotalModules / 2)
    const secondModules = Math.max(safeTotalModules - firstModules, 0)
    return {
        enabled: false,
        first: {
            label: "Norte",
            qtd_modulos: firstModules,
            indice_producao: params.defaultIndex,
        } satisfies ProductionIndexSplitState,
        second: {
            label: "Sul",
            qtd_modulos: secondModules,
            indice_producao: params.defaultIndex,
        } satisfies ProductionIndexSplitState,
    }
}

export function ProposalCalculatorSimple({
    products,
    pricingRules = [],
    initialProposal = null,
    intent = "create",
    sellerOptions = [],
    canAssignSeller = false,
    currentUserId = null,
    mergedProposal = null,
    initialClientPrefill = null,
}: ProposalCalculatorProps) {
    const rules = useMemo(() => buildRuleMap(pricingRules), [pricingRules])
    const defaultModulePower = rules.potencia_modulo_w ?? 700
    const defaultSoloUnitValue = rules.valor_unit_solo ?? 0
    const defaultInterest = normalizePercent(rules.juros_mensal ?? 0.019, 0.019)
    const defaultProductionIndex = rules.indice_producao ?? 112
    const defaultMargin = normalizePercent(rules.margem_percentual ?? rules.default_margin ?? 0.1, 0.1)
    const defaultTariffKwh = Number(rules.valor_kwh ?? rules.preco_kwh ?? 0.95)

    const params: ProposalCalcParams = useMemo(
        () => ({
            default_oversizing_factor: 1,
            micro_per_modules_divisor: 4,
            micro_unit_power_kw: 2,
            micro_rounding_mode: "CEIL",
            grace_interest_mode: "COMPOUND",
            duplication_rule: "DUPLICATE_KIT_AND_SOLO_STRUCTURE",
        }),
        []
    )

    const initialInput =
        initialProposal?.calculation?.input && typeof initialProposal.calculation.input === "object"
            ? (initialProposal.calculation.input as ProposalCalcInput)
            : null
    const initialOutput =
        initialProposal?.calculation?.output && typeof initialProposal.calculation.output === "object"
            ? initialProposal.calculation.output
            : null
    const initialManualContractEstimate = formatManualContractProductionEstimateInput(
        getManualContractProductionEstimate(initialProposal?.calculation ?? null) ?? ""
    )
    const initialStakeholders = getProposalStakeholderContacts(initialProposal?.calculation ?? null)
    const isEditMode = intent === "edit" && Boolean(initialProposal?.id)
    const initialProductionSplitsConfig = buildInitialProductionIndexSplits({
        initialInput,
        defaultIndex: defaultProductionIndex,
        totalModules: Number(initialInput?.dimensioning?.qtd_modulos ?? 0),
    })
    const normalizedPrefillName = (initialClientPrefill?.name ?? "").trim()
    const prefillNameParts = normalizedPrefillName.split(" ").filter(Boolean)
    const prefillFirstName = prefillNameParts[0] ?? ""
    const prefillLastName = prefillNameParts.slice(1).join(" ")
    const prefillWhatsapp = (initialClientPrefill?.whatsapp ?? "").trim()

    const [selectedIndicacaoId, setSelectedIndicacaoId] = useState<string | null>(initialProposal?.client_id ?? null)
    const [selectedContact, setSelectedContact] = useState<SelectedContact | null>(() => {
        const contact = initialProposal?.contact
        if (!contact?.id) return null
        return {
            id: contact.id,
            full_name: contact.full_name ?? null,
            first_name: contact.first_name ?? null,
            last_name: contact.last_name ?? null,
            email: contact.email ?? null,
            whatsapp: contact.whatsapp ?? null,
            phone: contact.phone ?? null,
            mobile: contact.mobile ?? null,
        }
    })
    const [contactSelectKey, setContactSelectKey] = useState(0)
    const [manualContact, setManualContact] = useState<ManualContactState>(() => ({
        first_name:
            initialProposal?.contact?.first_name ??
            initialProposal?.client_name?.split(" ")[0] ??
            prefillFirstName,
        last_name:
            initialProposal?.contact?.last_name ??
            initialProposal?.client_name?.split(" ").slice(1).join(" ") ??
            prefillLastName,
        whatsapp:
            initialProposal?.contact?.whatsapp ??
            initialProposal?.contact?.phone ??
            initialProposal?.contact?.mobile ??
            prefillWhatsapp,
    }))
    const [manualContractEstimate, setManualContractEstimate] = useState(initialManualContractEstimate)
    const [workOwnerName, setWorkOwnerName] = useState(initialStakeholders.owner.name)
    const [workOwnerWhatsapp, setWorkOwnerWhatsapp] = useState(initialStakeholders.owner.whatsapp)
    const [workBillingContactSource, setWorkBillingContactSource] = useState<ProposalStakeholderBillingSource>(
        initialStakeholders.billingSource
    )
    const [workBillingName, setWorkBillingName] = useState(initialStakeholders.billing.name)
    const [workBillingWhatsapp, setWorkBillingWhatsapp] = useState(initialStakeholders.billing.whatsapp)

    const [proposalStatus, setProposalStatus] = useState<"draft" | "sent">(
        normalizeStatusForForm(initialProposal?.status)
    )
    const isStatusLocked =
        isEditMode &&
        Boolean(initialProposal?.status) &&
        initialProposal?.status !== "draft" &&
        initialProposal?.status !== "sent"
    const canSelectSeller = canAssignSeller && sellerOptions.length > 0
    const preferredSellerId = initialProposal?.seller_id ?? currentUserId ?? ""
    const defaultSellerId = canSelectSeller
        ? (sellerOptions.some((seller) => seller.id === preferredSellerId) ? preferredSellerId : (sellerOptions[0]?.id ?? ""))
        : preferredSellerId
    const [selectedSellerId, setSelectedSellerId] = useState(defaultSellerId)
    const initialCommissionSplit = initialProposal?.calculation?.commission_split
    const initialCommissionSplitPercentDisplay =
        parseCommissionSplitPercentDisplay(
            initialCommissionSplit?.percent_display ??
            (initialCommissionSplit?.percent != null ? Number(initialCommissionSplit.percent) * 100 : null)
        ) ?? COMMISSION_SPLIT_PERCENT_OPTIONS[0]
    const [commissionSplitEnabled, setCommissionSplitEnabled] = useState(
        Boolean(initialCommissionSplit?.enabled !== false && initialCommissionSplit?.seller_id)
    )
    const [commissionSplitPercentDisplay, setCommissionSplitPercentDisplay] = useState(
        initialCommissionSplitPercentDisplay
    )
    const [commissionSplitSellerId, setCommissionSplitSellerId] = useState(
        initialCommissionSplit?.seller_id ?? ""
    )

    const [qtdModulos, setQtdModulos] = useState(
        initialInput?.dimensioning?.qtd_modulos ?? 0
    )
    const [potenciaModuloW, setPotenciaModuloW] = useState(
        initialInput?.dimensioning?.potencia_modulo_w ?? defaultModulePower
    )
    const [indiceProducao, setIndiceProducao] = useState(
        initialInput?.dimensioning?.indice_producao ?? defaultProductionIndex
    )
    const [useMultipleProductionIndexes, setUseMultipleProductionIndexes] = useState(
        initialProductionSplitsConfig.enabled
    )
    const [splitNorth, setSplitNorth] = useState<ProductionIndexSplitState>(initialProductionSplitsConfig.first)
    const [splitSouth, setSplitSouth] = useState<ProductionIndexSplitState>(initialProductionSplitsConfig.second)
    const [tipoInversor, setTipoInversor] = useState<ProposalCalcInput["dimensioning"]["tipo_inversor"]>(
        normalizeInverterType(initialInput?.dimensioning?.tipo_inversor)
    )
    const [qtdInversorString, setQtdInversorString] = useState(
        initialInput?.dimensioning?.qtd_inversor_string ?? 1
    )
    const [qtdInversorMicro, setQtdInversorMicro] = useState(
        initialInput?.dimensioning?.qtd_inversor_micro ?? 0
    )
    const [potenciaInversorStringKw, setPotenciaInversorStringKw] = useState(
        initialInput?.dimensioning?.potencia_inversor_string_kw ??
            initialOutput?.dimensioning?.inversor?.pot_string_kw ??
            0
    )
    const [kitGeradorValor, setKitGeradorValor] = useState(
        roundCurrencyValue(Number(initialProposal?.calculation?.output?.kit?.custo_kit ?? 0))
    )
    const [margemPercentual, setMargemPercentual] = useState(
        initialInput?.margin?.margem_percentual ?? defaultMargin
    )
    const [valorAdicional, setValorAdicional] = useState(
        initialInput?.extras?.valor_adequacao_padrao ?? 0
    )

    const [hasSoloStructure, setHasSoloStructure] = useState(
        (initialInput?.structure?.qtd_placas_solo ?? 0) > 0
    )
    const [soloUnitValue, setSoloUnitValue] = useState(
        initialInput?.structure?.valor_unit_solo ?? defaultSoloUnitValue
    )

    const [financeEnabled, setFinanceEnabled] = useState(
        initialInput?.finance?.enabled ?? false
    )
    const [entradaValor, setEntradaValor] = useState(
        initialInput?.finance?.entrada_valor ?? 0
    )
    const [carenciaMeses, setCarenciaMeses] = useState(
        initialInput?.finance?.carencia_meses ?? 0
    )
    const [jurosMensal, setJurosMensal] = useState(
        normalizeNonNegativePercent(Number(initialInput?.finance?.juros_mensal ?? defaultInterest), defaultInterest)
    )
    const [numParcelas, setNumParcelas] = useState(
        initialInput?.finance?.num_parcelas ?? 0
    )
    const [tarifaKwh, setTarifaKwh] = useState(
        Number(initialInput?.commercial?.tarifa_kwh ?? initialOutput?.commercial?.tarifa_kwh ?? defaultTariffKwh)
    )
    const [tradeEnabled, setTradeEnabled] = useState(
        initialInput?.trade?.enabled ?? false
    )
    const [tradeMode, setTradeMode] = useState<NonNullable<ProposalCalcInput["trade"]>["mode"]>(
        normalizeTradeMode(initialInput?.trade?.mode)
    )
    const [tradeValue, setTradeValue] = useState(
        initialInput?.trade?.value ?? 0
    )
    const [interestInputDraft, setInterestInputDraft] = useState<string | null>(null)

    const { showToast } = useToast()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const productionSplitTotalModules = splitNorth.qtd_modulos + splitSouth.qtd_modulos
    const productionSplitDifference = qtdModulos - productionSplitTotalModules
    const productionSplitEntries = useMemo<ProposalCalcInput["dimensioning"]["indices_producao_multiplos"]>(() => {
        if (!useMultipleProductionIndexes) return undefined
        return [
            {
                label: splitNorth.label,
                qtd_modulos: splitNorth.qtd_modulos,
                indice_producao: splitNorth.indice_producao,
            },
            {
                label: splitSouth.label,
                qtd_modulos: splitSouth.qtd_modulos,
                indice_producao: splitSouth.indice_producao,
            },
        ]
    }, [splitNorth, splitSouth, useMultipleProductionIndexes])

    const calculationInput = useMemo<ProposalCalcInput>(() => {
        const denominator = qtdModulos * potenciaModuloW
        const moduleCostPerWatt = denominator > 0 ? kitGeradorValor / denominator : 0
        const inverterStringQtyForCalculation = tipoInversor === "STRING" ? qtdInversorString : 0
        const inverterMicroQtyForCalculation = tipoInversor === "MICRO" ? qtdInversorMicro : 0
        const inverterStringPowerForCalculation = tipoInversor === "STRING" ? potenciaInversorStringKw : 0

        return {
            dimensioning: {
                qtd_modulos: qtdModulos,
                potencia_modulo_w: potenciaModuloW,
                indice_producao: indiceProducao,
                indices_producao_multiplos: productionSplitEntries,
                tipo_inversor: tipoInversor,
                fator_oversizing: 1,
                potencia_inversor_string_kw: inverterStringPowerForCalculation,
                qtd_inversor_string: inverterStringQtyForCalculation,
                qtd_inversor_micro: inverterMicroQtyForCalculation,
            },
            kit: {
                module_cost_per_watt: moduleCostPerWatt,
                cabling_unit_cost: 0,
                micro_unit_cost: 0,
                string_inverter_total_cost: 0,
            },
            structure: {
                qtd_placas_solo: hasSoloStructure ? qtdModulos : 0,
                qtd_placas_telhado: 0,
                valor_unit_solo: hasSoloStructure ? soloUnitValue : 0,
                valor_unit_telhado: 0,
            },
            margin: {
                margem_percentual: margemPercentual,
            },
            extras: {
                valor_baterias: 0,
                valor_adequacao_padrao: valorAdicional,
                outros_extras: [],
            },
            finance: {
                enabled: financeEnabled,
                entrada_valor: entradaValor,
                carencia_meses: carenciaMeses,
                juros_mensal: jurosMensal,
                num_parcelas: numParcelas,
                baloes: [],
            },
            commercial: {
                tarifa_kwh: tarifaKwh,
            },
            trade: {
                enabled: tradeEnabled,
                mode: tradeMode,
                value: tradeValue,
            },
            params,
        }
    }, [
        qtdModulos,
        potenciaModuloW,
        kitGeradorValor,
        margemPercentual,
        valorAdicional,
        indiceProducao,
        productionSplitEntries,
        tipoInversor,
        potenciaInversorStringKw,
        qtdInversorString,
        qtdInversorMicro,
        hasSoloStructure,
        soloUnitValue,
        financeEnabled,
        entradaValor,
        carenciaMeses,
        jurosMensal,
        numParcelas,
        tarifaKwh,
        tradeEnabled,
        tradeMode,
        tradeValue,
        params,
    ])

    const calculated = useMemo(() => calculateProposal(calculationInput), [calculationInput])
    const tradeOutput = calculated.output.trade
    const hasInstallmentTradeWithoutFinance = tradeEnabled && tradeMode === "INSTALLMENTS" && !financeEnabled
    const selectedContactPhone = selectedContact?.whatsapp || selectedContact?.phone || selectedContact?.mobile || ""
    const isContactPhoneLocked = Boolean(selectedContact && selectedContactPhone)
    const usesInventory = products.length > 0
    const kitDuplicado = calculated.output.kit.custo_kit * 2
    const estruturaDuplicada = calculated.output.structure.valor_estrutura_solo * 2
    const sellerIdForSplit = canSelectSeller
        ? selectedSellerId || initialProposal?.seller_id || currentUserId || ""
        : ""
    const commissionSplitSellerOptions = useMemo(
        () => sellerOptions.filter((seller) => seller.id !== sellerIdForSplit),
        [sellerIdForSplit, sellerOptions]
    )
    const mergedProposalValue = mergedProposal ? Math.max(Number(mergedProposal.total_value || 0), 0) : 0
    const mergedProposalPower = mergedProposal ? Math.max(Number(mergedProposal.total_power || 0), 0) : 0
    const mergedModuleCount = mergedProposal ? Math.max(Number(mergedProposal.module_count || 0), 0) : 0
    const mergedMaterialTotal = mergedProposal ? Math.max(Number(mergedProposal.material_total || 0), 0) : 0
    const unifiedTotalAvista = calculated.output.totals.total_a_vista + mergedProposalValue
    const unifiedTotalPower = calculated.output.dimensioning.kWp + mergedProposalPower
    const unifiedModuleCount = qtdModulos + mergedModuleCount
    const unifiedMaterialTotal = calculated.output.totals.views.view_material + mergedMaterialTotal
    const unifiedFinance = useMemo(() => {
        if (!financeEnabled) {
            return {
                entrada_percentual: 0,
                valor_financiado: 0,
                saldo_pos_carencia: 0,
                parcela_mensal_base: 0,
                parcela_permuta_mensal: 0,
                parcela_mensal: 0,
                total_pago: unifiedTotalAvista,
                total_pago_liquido: unifiedTotalAvista,
            }
        }

        const financedValue = Math.max(unifiedTotalAvista - entradaValor, 0)
        const baseInstallment = calculateInstallmentFromRate({
            financed_value: financedValue,
            monthly_rate: jurosMensal,
            grace_months: carenciaMeses,
            grace_interest_mode: params.grace_interest_mode,
            installments: numParcelas,
        })
        const installmentTradeDiscount =
            tradeEnabled && tradeMode === "INSTALLMENTS"
                ? Math.min(Math.max(tradeValue, 0), Math.max(baseInstallment, 0))
                : 0
        const installment = Math.max(baseInstallment - installmentTradeDiscount, 0)
        const parcels = Math.max(numParcelas, 0)
        const totalPaid = entradaValor + (baseInstallment * parcels)
        const totalPaidNet = entradaValor + (installment * parcels)

        return {
            entrada_percentual: unifiedTotalAvista > 0 ? entradaValor / unifiedTotalAvista : 0,
            valor_financiado: financedValue,
            saldo_pos_carencia: calculateFinancedBalanceAfterGrace({
                financed_value: financedValue,
                monthly_rate: jurosMensal,
                grace_months: carenciaMeses,
                grace_interest_mode: params.grace_interest_mode,
            }),
            parcela_mensal_base: baseInstallment,
            parcela_permuta_mensal: installmentTradeDiscount,
            parcela_mensal: installment,
            total_pago: totalPaid,
            total_pago_liquido: totalPaidNet,
        }
    }, [
        financeEnabled,
        unifiedTotalAvista,
        entradaValor,
        jurosMensal,
        carenciaMeses,
        params.grace_interest_mode,
        numParcelas,
        tradeEnabled,
        tradeMode,
        tradeValue,
    ])

    useEffect(() => {
        if (!commissionSplitEnabled) return
        if (commissionSplitSellerId && commissionSplitSellerId === sellerIdForSplit) {
            setCommissionSplitSellerId("")
        }
    }, [commissionSplitEnabled, commissionSplitSellerId, sellerIdForSplit])

    useEffect(() => {
        if (!commissionSplitEnabled) return
        if (commissionSplitSellerId) return
        const fallbackSellerId = commissionSplitSellerOptions[0]?.id ?? ""
        if (fallbackSellerId) {
            setCommissionSplitSellerId(fallbackSellerId)
        }
    }, [commissionSplitEnabled, commissionSplitSellerId, commissionSplitSellerOptions])

    const handleTotalUsinaChange = (targetTotal: number) => {
        const baseValue = calculated.output.totals.soma_com_estrutura
        const extrasValue = calculated.output.extras.extras_total
        const tradeAdjustment = tradeEnabled && tradeMode === "TOTAL_VALUE" ? Math.max(tradeValue, 0) : 0

        if (!Number.isFinite(baseValue) || baseValue <= 0) {
            setMargemPercentual(0)
            return
        }

        const nextMarginPercent = (targetTotal + tradeAdjustment - extrasValue - baseValue) / baseValue
        setMargemPercentual(Number.isFinite(nextMarginPercent) ? nextMarginPercent : 0)
    }

    const handleInstallmentChange = (targetInstallment: number) => {
        const permutaMensal = tradeEnabled && tradeMode === "INSTALLMENTS" && financeEnabled
            ? Math.max(Math.min(tradeValue, calculated.output.finance.parcela_mensal_base), 0)
            : 0
        const monthlyRate = solveMonthlyRateFromInstallment({
            desired_installment: targetInstallment + permutaMensal,
            financed_value: calculated.output.finance.valor_financiado,
            grace_months: carenciaMeses,
            grace_interest_mode: params.grace_interest_mode,
            installments: numParcelas,
        })

        setJurosMensal(monthlyRate)
    }

    const handleInterestChange = (value: string) => {
        setJurosMensal(normalizeNonNegativePercent(toNumber(value), 0))
    }

    const handleInterestInputChange = (value: string) => {
        setInterestInputDraft(value)
        if (!value.trim()) return
        handleInterestChange(value)
    }

    const handleInterestInputBlur = () => {
        if (interestInputDraft === null) return
        if (interestInputDraft.trim()) {
            handleInterestChange(interestInputDraft)
        }
        setInterestInputDraft(null)
    }

    const buildManualFromName = (fullName: string | null | undefined): ManualContactState => {
        const safeName = (fullName ?? "").trim()
        if (!safeName) {
            return { first_name: "", last_name: "", whatsapp: "" }
        }
        const [firstName, ...rest] = safeName.split(" ")
        return { first_name: firstName ?? "", last_name: rest.join(" "), whatsapp: "" }
    }

    const applyContactToManual = (contact: SelectedContact): ManualContactState => {
        const fullName =
            contact.full_name?.trim() ||
            [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim()
        const base = buildManualFromName(fullName)
        return {
            ...base,
            whatsapp: (contact.whatsapp || contact.phone || contact.mobile || "").trim(),
        }
    }

    const clearClientSelection = () => {
        setSelectedIndicacaoId(null)
        setSelectedContact(null)
        setManualContact({ first_name: "", last_name: "", whatsapp: "" })
        setContactSelectKey((prev) => prev + 1)
    }

    const updateManualContact = (patch: Partial<typeof manualContact>) => {
        setManualContact((prev) => ({ ...prev, ...patch }))
        if (selectedContact || selectedIndicacaoId) {
            setSelectedContact(null)
            setSelectedIndicacaoId(null)
            setContactSelectKey((prev) => prev + 1)
        }
    }

    const handleSave = async () => {
        if (loading) return

        if (qtdModulos <= 0 || potenciaModuloW <= 0) {
            showToast({
                variant: "error",
                title: "Dados incompletos",
                description: "Informe potência do módulo e quantidade de placas.",
            })
            return
        }

        if (useMultipleProductionIndexes) {
            if (productionSplitTotalModules <= 0) {
                showToast({
                    variant: "error",
                    title: "Índices de produção incompletos",
                    description: "Informe a quantidade de placas para Norte e Sul.",
                })
                return
            }

            if (Math.abs(productionSplitDifference) > 0.0001) {
                showToast({
                    variant: "error",
                    title: "Total de placas divergente",
                    description: "A soma das placas em Norte e Sul deve ser igual à quantidade total de placas.",
                })
                return
            }
        }

        if (kitGeradorValor <= 0) {
            showToast({
                variant: "error",
                title: "Kit gerador obrigatório",
                description: "Informe o valor total do kit gerador.",
            })
            return
        }

        if (tipoInversor === "STRING" && qtdInversorString <= 0) {
            showToast({
                variant: "error",
                title: "Inversor string obrigatório",
                description: "Informe a quantidade de inversores string.",
            })
            return
        }

        if (tipoInversor === "MICRO" && qtdInversorMicro <= 0) {
            showToast({
                variant: "error",
                title: "Micro inversor obrigatório",
                description: "Informe a quantidade de micro inversores.",
            })
            return
        }

        const manualFirstName = manualContact.first_name.trim()
        const manualLastName = manualContact.last_name.trim()
        const manualWhatsapp = manualContact.whatsapp.trim()

        if (!isEditMode) {
            const clientValidationError = validateProposalClientCreation({
                selectedIndicacaoId,
                selectedContactId: selectedContact?.id ?? null,
                manualFirstName,
            })
            if (clientValidationError) {
                showToast({
                    variant: "error",
                    title: clientValidationError.title,
                    description: clientValidationError.description,
                })
                return
            }
        }

        const sellerIdForSave = canSelectSeller
            ? selectedSellerId || initialProposal?.seller_id || currentUserId || null
            : null

        if (canSelectSeller && !sellerIdForSave) {
            showToast({
                variant: "error",
                title: "Vendedor obrigatório",
                description: "Selecione o vendedor responsável para salvar o orçamento.",
            })
            return
        }

        const shouldSplitCommission = canSelectSeller && commissionSplitEnabled
        if (shouldSplitCommission) {
            if (commissionSplitSellerOptions.length === 0) {
                showToast({
                    variant: "error",
                    title: "Divisão indisponível",
                    description: "Não há outro vendedor disponível para dividir a comissão.",
                })
                return
            }
            if (!commissionSplitSellerId) {
                showToast({
                    variant: "error",
                    title: "Vendedor da divisão obrigatório",
                    description: "Selecione com quem a comissão será dividida.",
                })
                return
            }
            if (commissionSplitSellerId === sellerIdForSave) {
                showToast({
                    variant: "error",
                    title: "Divisão inválida",
                    description: "O vendedor da divisão deve ser diferente do vendedor responsável.",
                })
                return
            }
        }

        setLoading(true)
        try {
            const calculationWithCommissionSplit: Record<string, unknown> = {
                ...calculated,
                output: {
                    ...calculated.output,
                    dimensioning: {
                        ...calculated.output.dimensioning,
                        kWp: unifiedTotalPower,
                    },
                    totals: {
                        ...calculated.output.totals,
                        total_a_vista: unifiedTotalAvista,
                    },
                    finance: {
                        ...calculated.output.finance,
                        entrada_percentual: unifiedFinance.entrada_percentual,
                        valor_financiado: unifiedFinance.valor_financiado,
                        saldo_pos_carencia: unifiedFinance.saldo_pos_carencia,
                        parcela_mensal_base: unifiedFinance.parcela_mensal_base,
                        parcela_permuta_mensal: unifiedFinance.parcela_permuta_mensal,
                        parcela_mensal: unifiedFinance.parcela_mensal,
                        total_pago: unifiedFinance.total_pago,
                        total_pago_liquido: unifiedFinance.total_pago_liquido,
                        juros_pagos: Math.max(unifiedFinance.total_pago - unifiedTotalAvista, 0),
                    },
                },
                ...(shouldSplitCommission
                    ? {
                        commission_split: {
                            enabled: true,
                            seller_id: commissionSplitSellerId,
                            percent: commissionSplitPercentDisplay / 100,
                            percent_display: commissionSplitPercentDisplay,
                        },
                    }
                    : {}),
            }
            if (mergedProposal) {
                calculationWithCommissionSplit.bundle = {
                    enabled: true,
                    secondary_proposal_ids: [mergedProposal.id],
                    consolidated: {
                        total_value: unifiedTotalAvista,
                        total_power: unifiedTotalPower,
                        module_count: unifiedModuleCount,
                        material_total: unifiedMaterialTotal,
                    },
                }
            }

            const calculationForSave = withManualContractProductionEstimate(
                calculationWithCommissionSplit,
                manualContractEstimate,
            )
            const billingContactData =
                workBillingContactSource === "owner"
                    ? {
                        name: workOwnerName,
                        whatsapp: workOwnerWhatsapp,
                    }
                    : workBillingContactSource === "custom"
                        ? {
                            name: workBillingName,
                            whatsapp: workBillingWhatsapp,
                        }
                        : null
            const calculationWithStakeholders = withProposalStakeholderContacts(
                calculationForSave,
                {
                    owner: {
                        name: workOwnerName,
                        whatsapp: workOwnerWhatsapp,
                    },
                    billing: billingContactData,
                    billingSource: workBillingContactSource,
                }
            )
            const editClientLinkPatch = isEditMode
                ? buildEditProposalClientLinkPatch({
                    initialClientId: initialProposal?.client_id ?? null,
                    initialContactId: initialProposal?.contact_id ?? initialProposal?.contact?.id ?? null,
                    selectedIndicacaoId,
                    selectedContactId: selectedContact?.id ?? null,
                })
                : {}

            const proposalData: ProposalInsert & { source_mode: "simple" } = {
                status: isStatusLocked ? (initialProposal?.status ?? proposalStatus) : proposalStatus,
                total_value: unifiedTotalAvista,
                equipment_cost: calculated.output.kit.custo_kit,
                additional_cost: calculated.output.extras.extras_total,
                profit_margin: calculated.output.margin.margem_valor,
                total_power: unifiedTotalPower,
                calculation: calculationWithStakeholders as ProposalInsert["calculation"],
                source_mode: "simple",
                ...editClientLinkPatch,
                ...(sellerIdForSave ? { seller_id: sellerIdForSave } : {}),
            }

            const result = isEditMode
                ? await updateProposal(initialProposal!.id, proposalData, [])
                : await createProposal(proposalData, [], {
                    client: {
                        indicacao_id: selectedIndicacaoId,
                        contact: selectedIndicacaoId
                            ? null
                            : selectedContact
                                ? {
                                    ...selectedContact,
                                    whatsapp: selectedContact.whatsapp || manualWhatsapp || null,
                                    phone: selectedContact.phone || manualWhatsapp || null,
                                }
                                : {
                                    first_name: manualFirstName,
                                    last_name: manualLastName || null,
                                    full_name: [manualFirstName, manualLastName].filter(Boolean).join(" "),
                                    whatsapp: manualWhatsapp,
                                    email: null,
                                    phone: null,
                                    mobile: null,
                                },
                    },
                    crm_brand: "dorata",
                })

            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Erro",
                    description: result.error,
                })
                return
            }

            showToast({
                title: isEditMode ? "Orçamento atualizado" : "Orçamento criado",
                description: isEditMode
                    ? "As alterações do orçamento foram salvas."
                    : "Orçamento salvo com sucesso.",
                variant: "success",
            })
            router.push("/admin/orcamentos")
        } catch (error) {
            console.error(error)
            const message = error instanceof Error ? error.message : "Falha ao salvar o orçamento."
            showToast({
                variant: "error",
                title: "Erro",
                description: message,
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{isEditMode ? "Cliente Vinculado" : "Cliente"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isEditMode ? (
                            <div className="space-y-2 rounded-md border p-3 text-sm">
                                <p>
                                    <span className="font-medium">Cliente atual:</span>{" "}
                                    {initialProposal?.client_name || initialProposal?.contact_name || "Não informado"}
                                </p>
                                <p>
                                    <span className="font-medium">Status atual:</span>{" "}
                                    {toStatusLabel(initialProposal?.status)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Você pode alterar ou limpar o vínculo deste orçamento abaixo.
                                </p>
                            </div>
                        ) : null}
                        <div className="space-y-2">
                            <Label>Buscar cliente (contatos ou indicações)</Label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <LeadSelect
                                        key={contactSelectKey}
                                        mode="both"
                                        leadBrand="dorata"
                                        value={selectedIndicacaoId ?? undefined}
                                        onChange={(value) => setSelectedIndicacaoId(value ?? null)}
                                        onSelectLead={(lead, source) => {
                                            if (source === "indicacao") {
                                                setSelectedIndicacaoId(lead.id)
                                                setSelectedContact(null)
                                                setManualContact(buildManualFromName(lead.nome))
                                            }
                                        }}
                                        onSelectContact={(contact) => {
                                            setSelectedContact(contact)
                                            setSelectedIndicacaoId(null)
                                            setManualContact(applyContactToManual(contact))
                                        }}
                                    />
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={clearClientSelection}>
                                    Limpar
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {isEditMode
                                    ? "Selecione uma indicação/contato para atualizar o vínculo deste orçamento."
                                    : "Selecione um contato/indicação ou informe somente o nome para criar o cliente."}
                            </p>
                        </div>

                        {!isEditMode ? (
                            <>
                                <Separator />

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Nome</Label>
                                        <Input
                                            type="text"
                                            value={manualContact.first_name}
                                            onChange={(e) => updateManualContact({ first_name: e.target.value })}
                                            disabled={Boolean(selectedContact) || Boolean(selectedIndicacaoId)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Sobrenome</Label>
                                        <Input
                                            type="text"
                                            value={manualContact.last_name}
                                            onChange={(e) => updateManualContact({ last_name: e.target.value })}
                                            disabled={Boolean(selectedContact) || Boolean(selectedIndicacaoId)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>WhatsApp</Label>
                                        <Input
                                            type="text"
                                            value={manualContact.whatsapp}
                                            onChange={(e) => updateManualContact({ whatsapp: e.target.value })}
                                            disabled={Boolean(selectedIndicacaoId) || isContactPhoneLocked}
                                        />
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Orçamento Simples</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Quantidade de placas</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={qtdModulos}
                                    onChange={(e) => setQtdModulos(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Potência do módulo (W)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={potenciaModuloW}
                                    onChange={(e) => setPotenciaModuloW(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Índice de produção</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={indiceProducao}
                                    onChange={(e) => setIndiceProducao(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-3 rounded-md border p-3 md:col-span-2">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={useMultipleProductionIndexes}
                                        onChange={(e) => {
                                            const enabled = e.target.checked
                                            setUseMultipleProductionIndexes(enabled)
                                            if (!enabled) return
                                            if (splitNorth.qtd_modulos > 0 || splitSouth.qtd_modulos > 0) return
                                            const northModules = Math.floor(qtdModulos / 2)
                                            const southModules = Math.max(qtdModulos - northModules, 0)
                                            setSplitNorth((prev) => ({ ...prev, qtd_modulos: northModules, indice_producao: indiceProducao }))
                                            setSplitSouth((prev) => ({ ...prev, qtd_modulos: southModules, indice_producao: indiceProducao }))
                                        }}
                                    />
                                    <Label>Usar 2 índices de produção (Norte e Sul)</Label>
                                </div>
                                {useMultipleProductionIndexes ? (
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Qtd. placas Norte</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={splitNorth.qtd_modulos}
                                                onChange={(e) =>
                                                    setSplitNorth((prev) => ({ ...prev, qtd_modulos: toNumber(e.target.value) }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Índice Norte</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={splitNorth.indice_producao}
                                                onChange={(e) =>
                                                    setSplitNorth((prev) => ({ ...prev, indice_producao: toNumber(e.target.value) }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Qtd. placas Sul</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={splitSouth.qtd_modulos}
                                                onChange={(e) =>
                                                    setSplitSouth((prev) => ({ ...prev, qtd_modulos: toNumber(e.target.value) }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Índice Sul</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={splitSouth.indice_producao}
                                                onChange={(e) =>
                                                    setSplitSouth((prev) => ({ ...prev, indice_producao: toNumber(e.target.value) }))
                                                }
                                            />
                                        </div>
                                        <p className={`text-xs md:col-span-2 ${Math.abs(productionSplitDifference) > 0.0001 ? "text-red-600" : "text-muted-foreground"}`}>
                                            Total nas orientações: {productionSplitTotalModules.toLocaleString("pt-BR")} placas.
                                            {Math.abs(productionSplitDifference) > 0.0001
                                                ? ` Ajuste para bater com o total de ${qtdModulos.toLocaleString("pt-BR")} placas.`
                                                : " Total válido para o cálculo."}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label>Tarifa kWh (R$)</Label>
                                <CurrencyMaskedInput
                                    value={tarifaKwh}
                                    fractionDigits={4}
                                    onValueChange={setTarifaKwh}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Valor por kWh usado para calcular a economia desta proposta.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de inversor</Label>
                                <Select
                                    value={tipoInversor}
                                    onValueChange={(value) =>
                                        setTipoInversor(value as ProposalCalcInput["dimensioning"]["tipo_inversor"])
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="STRING">String</SelectItem>
                                        <SelectItem value="MICRO">Micro inversor</SelectItem>
                                        <SelectItem value="AMPLIACAO">Ampliação (sem inversor)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. inversor string</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={qtdInversorString}
                                    disabled={tipoInversor !== "STRING"}
                                    onChange={(e) => setQtdInversorString(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Potência inversor string (kW)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={potenciaInversorStringKw}
                                    disabled={tipoInversor !== "STRING"}
                                    onChange={(e) => setPotenciaInversorStringKw(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. micro inversor</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={qtdInversorMicro}
                                    disabled={tipoInversor !== "MICRO"}
                                    onChange={(e) => setQtdInversorMicro(toNumber(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {tipoInversor === "AMPLIACAO"
                                        ? "Modo ampliação: este orçamento não inclui inversor."
                                        : `Sugestão automática atual: ${calculated.output.dimensioning.inversor.qtd_micro_sugerida}`}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor do kit gerador (R$)</Label>
                                <CurrencyMaskedInput
                                    value={kitGeradorValor}
                                    onValueChange={setKitGeradorValor}
                                />
                                <p className="text-xs text-muted-foreground">
                                    No cálculo, o sistema aplica automaticamente kit x2.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Status do orçamento</Label>
                                {isStatusLocked ? (
                                    <Input value={toStatusLabel(initialProposal?.status)} disabled />
                                ) : (
                                    <Select
                                        value={proposalStatus}
                                        onValueChange={(value) => setProposalStatus(value as "draft" | "sent")}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="draft">Rascunho</SelectItem>
                                            <SelectItem value="sent">Enviado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                {isStatusLocked ? (
                                    <p className="text-xs text-muted-foreground">
                                        Status atual ({toStatusLabel(initialProposal?.status)}) é mantido automaticamente.
                                    </p>
                                ) : null}
                            </div>
                            {canSelectSeller ? (
                                <div className="space-y-2">
                                    <Label>Vendedor responsável</Label>
                                    <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o vendedor" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sellerOptions.map((seller) => (
                                                <SelectItem key={seller.id} value={seller.id}>
                                                    {seller.name || seller.email || seller.id}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}
                            {canSelectSeller ? (
                                <div className="space-y-3 rounded-md border p-3 md:col-span-2">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={commissionSplitEnabled}
                                            onChange={(e) => setCommissionSplitEnabled(e.target.checked)}
                                        />
                                        <Label>Dividir comissão com outro vendedor</Label>
                                    </div>
                                    {commissionSplitEnabled ? (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Percentual da divisão</Label>
                                                <Select
                                                    value={String(commissionSplitPercentDisplay)}
                                                    onValueChange={(value) => {
                                                        const parsed = parseCommissionSplitPercentDisplay(value)
                                                        if (parsed !== null) {
                                                            setCommissionSplitPercentDisplay(parsed)
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione o percentual" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {COMMISSION_SPLIT_PERCENT_OPTIONS.map((percent) => (
                                                            <SelectItem key={percent} value={String(percent)}>
                                                                {formatSplitPercentOption(percent)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Vendedor para dividir</Label>
                                                <Select value={commissionSplitSellerId} onValueChange={setCommissionSplitSellerId}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione o vendedor" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {commissionSplitSellerOptions.map((seller) => (
                                                            <SelectItem key={seller.id} value={seller.id}>
                                                                {seller.name || seller.email || seller.id}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {commissionSplitSellerOptions.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        Não há outro vendedor disponível para divisão.
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-3 md:col-span-2">
                                <Label className="font-bold text-emerald-900">kWh para contrato</Label>
                                <Input
                                    placeholder="Ex: 13.500 KWH"
                                    value={manualContractEstimate}
                                    className="border-emerald-300 bg-white font-bold text-emerald-900"
                                    onChange={(event) =>
                                        setManualContractEstimate(
                                            formatManualContractProductionEstimateInput(event.target.value)
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-3 rounded-md border border-sky-200 bg-sky-50/70 p-3 md:col-span-2">
                                <Label className="font-bold text-sky-900">Contatos da obra</Label>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Nome do dono</Label>
                                        <Input
                                            placeholder="Ex: João da Silva"
                                            value={workOwnerName}
                                            onChange={(event) => setWorkOwnerName(event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>WhatsApp do dono</Label>
                                        <Input
                                            placeholder="Ex: +55 (66) 99999-9999"
                                            value={workOwnerWhatsapp}
                                            onChange={(event) => setWorkOwnerWhatsapp(event.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Contato financeiro</Label>
                                    <Select
                                        value={workBillingContactSource}
                                        onValueChange={(value) =>
                                            setWorkBillingContactSource(value as ProposalStakeholderBillingSource)
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="owner">Mesmo do dono da obra</SelectItem>
                                            <SelectItem value="linked_contact">Usar contato vinculado do orçamento</SelectItem>
                                            <SelectItem value="custom">Informar financeiro manualmente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {workBillingContactSource === "custom" ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Nome do financeiro</Label>
                                            <Input
                                                placeholder="Ex: Maria Financeiro"
                                                value={workBillingName}
                                                onChange={(event) => setWorkBillingName(event.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>WhatsApp do financeiro</Label>
                                            <Input
                                                placeholder="Ex: +55 (66) 99999-9999"
                                                value={workBillingWhatsapp}
                                                onChange={(event) => setWorkBillingWhatsapp(event.target.value)}
                                            />
                                        </div>
                                    </div>
                                ) : null}
                                {workBillingContactSource === "linked_contact" ? (
                                    <p className="text-xs text-muted-foreground">
                                        O botão de WhatsApp Financeiro em Obras vai usar o contato vinculado neste orçamento.
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label>Potência total calculada</Label>
                                <Input value={`${calculated.output.dimensioning.kWp.toFixed(2)} kWp`} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Geração estimada</Label>
                                <Input value={`${calculated.output.dimensioning.kWh_estimado.toFixed(2)} kWh`} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Índice efetivo aplicado</Label>
                                <Input value={calculated.output.dimensioning.indice_producao_efetivo.toFixed(2)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de inversor</Label>
                                <Input value={toInverterTypeLabel(calculated.output.dimensioning.inversor.tipo)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. inversor string</Label>
                                <Input value={calculated.output.dimensioning.inversor.qtd_string} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. micro inversor</Label>
                                <Input value={calculated.output.dimensioning.inversor.qtd_micro} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Potência inversor string (kW)</Label>
                                <Input value={calculated.output.dimensioning.inversor.pot_string_kw.toFixed(2)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Kit aplicado no cálculo (x2)</Label>
                                <Input value={formatCurrency(kitDuplicado)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Soma base (kit e estrutura x2)</Label>
                                <Input value={formatCurrency(calculated.output.totals.soma_com_estrutura)} disabled />
                            </div>
                        </div>

                        {!usesInventory && (
                            <p className="text-xs text-muted-foreground">
                                Estoque vazio: o orçamento será salvo normalmente sem itens de estoque.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Estrutura Solo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={hasSoloStructure}
                                onChange={(e) => setHasSoloStructure(e.target.checked)}
                            />
                            <Label>Tem estrutura solo</Label>
                        </div>

                        {hasSoloStructure ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Valor por placa (R$)</Label>
                                    <CurrencyMaskedInput
                                        value={soloUnitValue}
                                        onValueChange={setSoloUnitValue}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Total estrutura solo</Label>
                                    <Input value={formatCurrency(calculated.output.structure.valor_estrutura_solo)} disabled />
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Estrutura solo desativada para este orçamento.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Margem e adicional</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Total da usina (R$)</Label>
                                <CurrencyMaskedInput
                                    value={calculated.output.totals.total_a_vista}
                                    onValueChange={handleTotalUsinaChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Margem calculada</Label>
                                <Input value={formatCurrency(calculated.output.margin.margem_valor)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Margem (%) calculada</Label>
                                <Input value={(margemPercentual * 100).toFixed(4)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Valor adicional (R$)</Label>
                                <CurrencyMaskedInput
                                    value={valorAdicional}
                                    onValueChange={setValorAdicional}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Adicional aplicado</Label>
                                <Input value={formatCurrency(calculated.output.extras.extras_total)} disabled />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Financiamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={financeEnabled}
                                onChange={(e) => setFinanceEnabled(e.target.checked)}
                            />
                            <Label>Ativar financiamento</Label>
                        </div>

                        {financeEnabled && (
                            <div className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Entrada (R$)</Label>
                                        <CurrencyMaskedInput
                                            value={entradaValor}
                                            onValueChange={setEntradaValor}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Entrada (%)</Label>
                                        <Input value={(calculated.output.finance.entrada_percentual * 100).toFixed(2)} disabled />
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>Carência (meses)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={carenciaMeses}
                                            onChange={(e) => setCarenciaMeses(toNumber(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Parcela mensal (R$)</Label>
                                        <CurrencyMaskedInput
                                            value={calculated.output.finance.parcela_mensal}
                                            onValueChange={handleInstallmentChange}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Número de parcelas</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={numParcelas}
                                            onChange={(e) => setNumParcelas(toNumber(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Juros mensal (%)</Label>
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                                interestInputDraft ??
                                                formatDecimalForInput(jurosMensal * 100, 4)
                                            }
                                            onChange={(e) => handleInterestInputChange(e.target.value)}
                                            onBlur={handleInterestInputBlur}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Permuta</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={tradeEnabled}
                                onChange={(e) => setTradeEnabled(e.target.checked)}
                            />
                            <Label>Ativar permuta</Label>
                        </div>

                        {tradeEnabled && (
                            <div className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>Tipo de abatimento</Label>
                                        <Select
                                            value={tradeMode}
                                            onValueChange={(value) =>
                                                setTradeMode(value as NonNullable<ProposalCalcInput["trade"]>["mode"])
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="TOTAL_VALUE">Abater no valor total da obra</SelectItem>
                                                <SelectItem value="INSTALLMENTS">Abater nas parcelas</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>
                                            {tradeMode === "INSTALLMENTS"
                                                ? "Valor mensal da permuta (R$)"
                                                : "Valor da permuta (R$)"}
                                        </Label>
                                        <CurrencyMaskedInput
                                            value={tradeValue}
                                            onValueChange={setTradeValue}
                                        />
                                    </div>
                                </div>

                                {hasInstallmentTradeWithoutFinance ? (
                                    <p className="text-xs text-muted-foreground">
                                        Para aplicar abatimento nas parcelas, ative o financiamento.
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        {tradeMode === "TOTAL_VALUE"
                                            ? `Abatimento aplicado: ${formatCurrency(tradeOutput.applied_total_value)}`
                                            : `Desconto mensal: ${formatCurrency(calculated.output.finance.parcela_permuta_mensal)} • Total aplicado: ${formatCurrency(tradeOutput.applied_installments_value)}`}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-1">
                <Card className="sticky top-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calculator className="h-5 w-5" /> Resumo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Potência total</span>
                            <span className="font-medium">{calculated.output.dimensioning.kWp.toFixed(2)} kWp</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tarifa kWh</span>
                            <span className="font-medium">{formatCurrency(calculated.output.commercial.tarifa_kwh)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Economia anual estimada</span>
                            <span className="font-medium text-primary">
                                {formatCurrency(calculated.output.commercial.economia_anual_estimada)}
                            </span>
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Kit gerador informado</span>
                                <span>{formatCurrency(calculated.output.kit.custo_kit)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Kit aplicado (x2)</span>
                                <span>{formatCurrency(kitDuplicado)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Estrutura solo aplicada (x2)</span>
                                <span>{formatCurrency(estruturaDuplicada)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Soma base</span>
                                <span>{formatCurrency(calculated.output.totals.soma_com_estrutura)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Margem</span>
                                <span>{formatCurrency(calculated.output.margin.margem_valor)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Valor adicional</span>
                                <span>{formatCurrency(calculated.output.extras.extras_total)}</span>
                            </div>
                            {tradeEnabled && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        Permuta ({tradeMode === "TOTAL_VALUE" ? "total" : "parcelas"})
                                    </span>
                                    <span>
                                        {formatCurrency(
                                            tradeMode === "TOTAL_VALUE"
                                                ? tradeOutput.applied_total_value
                                                : tradeOutput.applied_installments_value
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-lg font-bold">Total à vista</span>
                            <span className="text-xl font-bold text-primary">
                                {formatCurrency(calculated.output.totals.total_a_vista)}
                            </span>
                        </div>
                        {financeEnabled && (
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Valor financiado</span>
                                    <span>{formatCurrency(calculated.output.finance.valor_financiado)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Parcela mensal</span>
                                    <span>{formatCurrency(calculated.output.finance.parcela_mensal)}</span>
                                </div>
                                {tradeEnabled && tradeMode === "INSTALLMENTS" && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Parcela base (com juros)</span>
                                            <span>{formatCurrency(calculated.output.finance.parcela_mensal_base)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Desconto permuta/mês</span>
                                            <span>{formatCurrency(calculated.output.finance.parcela_permuta_mensal)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total com juros</span>
                                    <span>{formatCurrency(calculated.output.finance.total_pago)}</span>
                                </div>
                                {tradeEnabled && tradeMode === "INSTALLMENTS" && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total após permuta</span>
                                        <span>{formatCurrency(calculated.output.finance.total_pago_liquido)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {mergedProposal && (
                            <>
                                <Separator />
                                <div className="space-y-2 text-sm">
                                    <p className="font-semibold">Visão unificada</p>
                                    <div className="rounded-md border px-3 py-2">
                                        <div className="text-xs font-medium">Orçamento 01 (atual)</div>
                                        <div className="mt-1 flex justify-between text-xs">
                                            <span className="text-muted-foreground">Módulos</span>
                                            <span>{qtdModulos.toLocaleString("pt-BR")}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Potência</span>
                                            <span>{calculated.output.dimensioning.kWp.toFixed(2)} kWp</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Material</span>
                                            <span>{formatCurrency(calculated.output.totals.views.view_material)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Total à vista</span>
                                            <span>{formatCurrency(calculated.output.totals.total_a_vista)}</span>
                                        </div>
                                    </div>
                                    <div className="rounded-md border px-3 py-2">
                                        <div className="text-xs font-medium">Orçamento 02 (vinculado)</div>
                                        <div className="mt-1 flex justify-between text-xs">
                                            <span className="text-muted-foreground">Módulos</span>
                                            <span>{mergedModuleCount.toLocaleString("pt-BR")}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Potência</span>
                                            <span>{mergedProposalPower.toFixed(2)} kWp</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Material</span>
                                            <span>{formatCurrency(mergedMaterialTotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Total à vista</span>
                                            <span>{formatCurrency(mergedProposalValue)}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>Módulos totais</span>
                                        <span>{unifiedModuleCount.toLocaleString("pt-BR")}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>Potência total unificada</span>
                                        <span>{unifiedTotalPower.toFixed(2)} kWp</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>Material total unificado</span>
                                        <span>{formatCurrency(unifiedMaterialTotal)}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>Total à vista unificado</span>
                                        <span>{formatCurrency(unifiedTotalAvista)}</span>
                                    </div>
                                    {financeEnabled && (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Valor financiado unificado</span>
                                                <span>{formatCurrency(unifiedFinance.valor_financiado)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Parcela unificada</span>
                                                <span>{formatCurrency(unifiedFinance.parcela_mensal)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Total com juros unificado</span>
                                                <span>{formatCurrency(unifiedFinance.total_pago)}</span>
                                            </div>
                                            {tradeEnabled && tradeMode === "INSTALLMENTS" && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Total após permuta (unificado)</span>
                                                    <span>{formatCurrency(unifiedFinance.total_pago_liquido)}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleSave} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditMode ? "Salvar Alterações" : "Salvar Orçamento"}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
