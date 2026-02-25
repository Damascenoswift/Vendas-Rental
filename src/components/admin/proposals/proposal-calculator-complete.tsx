"use client"

import { useMemo, useState } from "react"
import type { Product } from "@/services/product-service"
import { createProposal, updateProposal } from "@/services/proposal-service"
import type {
    ProposalEditorData,
    ProposalItemInsert,
    ProposalInsert,
    PricingRule,
    ProposalStatus,
} from "@/services/proposal-service"
import {
    calculateProposal,
    solveMonthlyRateFromInstallment,
    type ProposalCalcInput,
    type ProposalCalcParams,
    type ProposalStringInverterInput,
} from "@/lib/proposal-calculation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, Calculator, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { LeadSelect } from "@/components/admin/tasks/lead-select"

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
    initialProposal?: ProposalEditorData | null
    intent?: "create" | "edit"
}

type ExtraItem = { id: string; name: string; value: number }

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

type StringInverterRow = {
    row_id: string
    product_id: string
    quantity: number
    unit_cost: number
    power_kw: number
    power_source: "product" | "manual"
    purchase_required: boolean
}

function createRowId() {
    return Math.random().toString(36).slice(2, 10)
}

function normalizeQuantity(value: number) {
    if (!Number.isFinite(value)) return 1
    return value > 0 ? value : 1
}

function normalizePositive(value: number) {
    if (!Number.isFinite(value)) return 0
    return value > 0 ? value : 0
}

function toPowerKwFromProduct(product?: Product | null) {
    if (!product) return 0
    const watts = Number(product.power || 0)
    if (!Number.isFinite(watts) || watts <= 0) return 0
    return watts / 1000
}

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

function normalizeStatusForForm(status: ProposalStatus | null | undefined): "draft" | "sent" {
    return status === "draft" ? "draft" : "sent"
}

function toStatusLabel(status: string | null | undefined) {
    if (!status) return "Sem status"
    if (status === "draft") return "Rascunho"
    if (status === "sent") return "Enviado"
    if (status === "accepted") return "Aceito"
    if (status === "rejected") return "Rejeitado"
    return status
}

function getSpecValue(product: Product, key: string) {
    const specs = product.specs
    if (!specs || typeof specs !== "object" || Array.isArray(specs)) {
        return undefined
    }
    return (specs as Record<string, any>)[key]
}

export function ProposalCalculatorComplete({
    products,
    pricingRules = [],
    initialProposal = null,
    intent = "create",
}: ProposalCalculatorProps) {
    const panelProducts = products.filter((p) => p.type === "module")
    const inverterProducts = products.filter((p) => p.type === "inverter")
    const microInverterProducts = inverterProducts.filter(
        (p) => getSpecValue(p, "inverter_kind") === "micro"
    )
    const stringInverterProducts = inverterProducts.filter(
        (p) => getSpecValue(p, "inverter_kind") === "string"
    )
    const effectiveMicroInverters = microInverterProducts.length ? microInverterProducts : inverterProducts
    const effectiveStringInverters = stringInverterProducts.length ? stringInverterProducts : inverterProducts
    const structureProducts = products.filter((p) => p.type === "structure")

    const rules = useMemo(() => buildRuleMap(pricingRules), [pricingRules])
    const defaultModulePower = rules.potencia_modulo_w ?? 700
    const defaultModuleCostPerWatt =
        rules.module_cost_per_watt ??
        ((rules.module_unit_cost ?? 0) / (defaultModulePower > 0 ? defaultModulePower : 1))

    const params: ProposalCalcParams = useMemo(
        () => ({
            default_oversizing_factor: rules.default_oversizing_factor ?? 1.25,
            micro_per_modules_divisor: rules.micro_per_modules_divisor ?? 4,
            micro_unit_power_kw: rules.micro_unit_power_kw ?? 2,
            micro_rounding_mode: "CEIL",
            grace_interest_mode: "COMPOUND",
            duplication_rule: "DUPLICATE_KIT_AND_SOLO_STRUCTURE",
        }),
        [rules]
    )

    const isEditMode = intent === "edit" && Boolean(initialProposal?.id)
    const initialCalculationInput =
        initialProposal?.calculation?.input && typeof initialProposal.calculation.input === "object"
            ? (initialProposal.calculation.input as Partial<ProposalCalcInput>)
            : null

    const productById = useMemo(() => {
        const map = new Map<string, Product>()
        for (const product of products) {
            map.set(product.id, product)
        }
        return map
    }, [products])

    const initialProposalItems = initialProposal?.items ?? []
    const initialInverterMode = initialCalculationInput?.dimensioning?.tipo_inversor ?? "STRING"
    const initialModuleItem = initialProposalItems.find((item) => {
        const productId = item.product_id ?? ""
        return productById.get(productId)?.type === "module"
    })
    const initialMicroItem = initialProposalItems.find((item) => {
        const productId = item.product_id ?? ""
        const product = productById.get(productId)
        if (!product || product.type !== "inverter") return false
        const kind = getSpecValue(product, "inverter_kind")
        if (kind === "micro") return true
        return initialInverterMode === "MICRO" && kind !== "string"
    })

    const buildInitialStringInverterRows = () => {
        const fromCalculation = initialCalculationInput?.dimensioning?.string_inverters
        if (Array.isArray(fromCalculation) && fromCalculation.length > 0) {
            const rows = fromCalculation
                .map((line) => {
                    const productId = typeof line?.product_id === "string" ? line.product_id : ""
                    if (!productId) return null
                    const quantity = normalizeQuantity(Number(line?.quantity || 0))
                    const unitCost = normalizePositive(Number(line?.unit_cost || 0))
                    const powerKw = normalizePositive(Number(line?.power_kw || 0))
                    const powerSource = line?.power_source === "manual" ? "manual" : "product"
                    const purchaseRequired = line?.purchase_required === true || powerSource === "manual"
                    return {
                        row_id: createRowId(),
                        product_id: productId,
                        quantity,
                        unit_cost: unitCost,
                        power_kw: powerKw,
                        power_source: powerSource,
                        purchase_required: purchaseRequired,
                    } satisfies StringInverterRow
                })
                .filter((row): row is StringInverterRow => Boolean(row))

            if (rows.length > 0) return rows
        }

        if (initialInverterMode !== "STRING") return [] as StringInverterRow[]

        const fallbackItems = initialProposalItems.filter((item) => {
            const productId = item.product_id ?? ""
            const product = productById.get(productId)
            if (!product || product.type !== "inverter") return false
            const kind = getSpecValue(product, "inverter_kind")
            return kind === "string" || !kind
        })

        if (fallbackItems.length === 0) return [] as StringInverterRow[]

        const legacyTotalPowerKw = normalizePositive(
            Number(
                initialCalculationInput?.dimensioning?.potencia_inversor_string_kw ??
                    initialProposal?.calculation?.output?.dimensioning?.inversor?.pot_string_kw ??
                    0
            )
        )
        const fallbackTotalQty = fallbackItems.reduce((acc, item) => acc + normalizeQuantity(Number(item.quantity || 0)), 0)
        const fallbackPerUnitPowerKw = fallbackTotalQty > 0 ? legacyTotalPowerKw / fallbackTotalQty : 0

        return fallbackItems.map((item) => {
            const productId = item.product_id ?? ""
            const product = productById.get(productId)
            const powerKwFromProduct = toPowerKwFromProduct(product)
            const quantity = normalizeQuantity(Number(item.quantity || 0))
            const unitCost = normalizePositive(Number(item.unit_price || 0))
            const powerKw = powerKwFromProduct > 0 ? powerKwFromProduct : fallbackPerUnitPowerKw
            const powerSource: "product" | "manual" = powerKwFromProduct > 0 ? "product" : "manual"
            return {
                row_id: createRowId(),
                product_id: productId,
                quantity,
                unit_cost: unitCost,
                power_kw: normalizePositive(powerKw),
                power_source: powerSource,
                purchase_required: powerSource === "manual",
            } satisfies StringInverterRow
        })
    }

    const [moduleProductId, setModuleProductId] = useState<string>(initialModuleItem?.product_id ?? "")
    const [microProductId, setMicroProductId] = useState<string>(initialMicroItem?.product_id ?? "")
    const [stringInverterRows, setStringInverterRows] = useState<StringInverterRow[]>(buildInitialStringInverterRows)
    const [structureSoloProductId, setStructureSoloProductId] = useState<string>("")
    const [structureTelhadoProductId, setStructureTelhadoProductId] = useState<string>("")

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
            "",
        last_name:
            initialProposal?.contact?.last_name ??
            initialProposal?.client_name?.split(" ").slice(1).join(" ") ??
            "",
        whatsapp:
            initialProposal?.contact?.whatsapp ??
            initialProposal?.contact?.phone ??
            initialProposal?.contact?.mobile ??
            "",
    }))

    const [proposalStatus, setProposalStatus] = useState<"draft" | "sent">(
        normalizeStatusForForm(initialProposal?.status)
    )
    const isStatusLocked =
        isEditMode &&
        Boolean(initialProposal?.status) &&
        initialProposal?.status !== "draft" &&
        initialProposal?.status !== "sent"
    const [input, setInput] = useState<ProposalCalcInput>(() => {
        const baseInput: ProposalCalcInput = {
            dimensioning: {
                qtd_modulos: 0,
                potencia_modulo_w: defaultModulePower,
                indice_producao: rules.indice_producao ?? 112,
                tipo_inversor: "STRING",
                fator_oversizing: rules.default_oversizing_factor ?? params.default_oversizing_factor,
            },
            kit: {
                module_cost_per_watt: defaultModuleCostPerWatt,
                cabling_unit_cost: rules.cabling_unit_cost ?? 0,
                micro_unit_cost: rules.micro_unit_cost ?? 0,
                string_inverter_total_cost: rules.string_inverter_total_cost ?? 0,
            },
            structure: {
                qtd_placas_solo: 0,
                qtd_placas_telhado: 0,
                valor_unit_solo: rules.valor_unit_solo ?? 0,
                valor_unit_telhado: rules.valor_unit_telhado ?? 0,
            },
            margin: {
                margem_percentual: normalizePercent(
                    rules.margem_percentual ?? rules.default_margin ?? 0.1,
                    0.1
                ),
            },
            extras: {
                valor_baterias: 0,
                valor_adequacao_padrao: 0,
                outros_extras: [],
            },
            finance: {
                enabled: false,
                entrada_valor: 0,
                carencia_meses: 0,
                juros_mensal: normalizePercent(rules.juros_mensal ?? 0.019, 0.019),
                num_parcelas: 0,
                baloes: [],
            },
            params,
        }

        if (!initialCalculationInput) return baseInput

        return {
            ...baseInput,
            ...initialCalculationInput,
            dimensioning: {
                ...baseInput.dimensioning,
                ...(initialCalculationInput.dimensioning ?? {}),
            },
            kit: {
                ...baseInput.kit,
                ...(initialCalculationInput.kit ?? {}),
            },
            structure: {
                ...baseInput.structure,
                ...(initialCalculationInput.structure ?? {}),
            },
            margin: {
                ...baseInput.margin,
                ...(initialCalculationInput.margin ?? {}),
            },
            extras: {
                ...baseInput.extras,
                ...(initialCalculationInput.extras ?? {}),
                outros_extras: Array.isArray(initialCalculationInput.extras?.outros_extras)
                    ? initialCalculationInput.extras?.outros_extras.map((extra, index) => ({
                        id: extra?.id || `${index}`,
                        name: extra?.name || "",
                        value: Number(extra?.value || 0),
                    }))
                    : [],
            },
            finance: {
                ...baseInput.finance,
                ...(initialCalculationInput.finance ?? {}),
                baloes: Array.isArray(initialCalculationInput.finance?.baloes)
                    ? initialCalculationInput.finance?.baloes.map((balao) => ({
                        balao_mes: Number(balao?.balao_mes || 0),
                        balao_valor: Number(balao?.balao_valor || 0),
                    }))
                    : [],
            },
            params: {
                ...params,
                ...(initialCalculationInput.params ?? {}),
            },
        }
    })

    const { showToast } = useToast()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [installmentInputDraft, setInstallmentInputDraft] = useState<string | null>(null)

    const normalizedStringInverters = useMemo<ProposalStringInverterInput[]>(
        () =>
            stringInverterRows
                .map((row) => ({
                    product_id: row.product_id,
                    quantity: normalizeQuantity(Number(row.quantity || 0)),
                    unit_cost: normalizePositive(Number(row.unit_cost || 0)),
                    power_kw: normalizePositive(Number(row.power_kw || 0)),
                    power_source: row.power_source,
                    purchase_required: row.purchase_required || row.power_source === "manual",
                }))
                .filter((row) => Boolean(row.product_id)),
        [stringInverterRows]
    )
    const validStringInverters = useMemo(
        () => normalizedStringInverters.filter((row) => row.quantity > 0 && row.power_kw > 0),
        [normalizedStringInverters]
    )
    const stringInverterTotalCost = useMemo(
        () => normalizedStringInverters.reduce((acc, row) => acc + (row.unit_cost * row.quantity), 0),
        [normalizedStringInverters]
    )
    const stringInverterTotalQty = useMemo(
        () => normalizedStringInverters.reduce((acc, row) => acc + row.quantity, 0),
        [normalizedStringInverters]
    )

    const calculationInput = useMemo<ProposalCalcInput>(
        () => ({
            ...input,
            dimensioning: {
                ...input.dimensioning,
                qtd_inversor_string: stringInverterTotalQty,
                string_inverters: normalizedStringInverters.length > 0 ? normalizedStringInverters : undefined,
            },
            kit: {
                ...input.kit,
                string_inverter_total_cost: stringInverterTotalCost,
            },
        }),
        [input, normalizedStringInverters, stringInverterTotalCost, stringInverterTotalQty]
    )

    const calculated = useMemo(() => calculateProposal(calculationInput), [calculationInput])
    const moduleUnitCost = calculated.output.kit.custo_modulo_unitario
    const selectedContactPhone = selectedContact?.whatsapp || selectedContact?.phone || selectedContact?.mobile || ""
    const isContactPhoneLocked = Boolean(selectedContact && selectedContactPhone)

    const updateDimensioning = (patch: Partial<ProposalCalcInput["dimensioning"]>) => {
        setInput((prev) => ({ ...prev, dimensioning: { ...prev.dimensioning, ...patch } }))
    }

    const updateKit = (patch: Partial<ProposalCalcInput["kit"]>) => {
        setInput((prev) => ({ ...prev, kit: { ...prev.kit, ...patch } }))
    }

    const updateStructure = (patch: Partial<ProposalCalcInput["structure"]>) => {
        setInput((prev) => ({ ...prev, structure: { ...prev.structure, ...patch } }))
    }

    const updateMargin = (patch: Partial<ProposalCalcInput["margin"]>) => {
        setInput((prev) => ({ ...prev, margin: { ...prev.margin, ...patch } }))
    }

    const updateExtras = (patch: Partial<ProposalCalcInput["extras"]>) => {
        setInput((prev) => ({ ...prev, extras: { ...prev.extras, ...patch } }))
    }

    const updateFinance = (patch: Partial<ProposalCalcInput["finance"]>) => {
        setInput((prev) => ({ ...prev, finance: { ...prev.finance, ...patch } }))
    }

    const handleTotalUsinaChange = (value: string) => {
        const targetTotal = toNumber(value)
        const baseValue = calculated.output.totals.soma_com_estrutura
        const extrasValue = calculated.output.extras.extras_total

        if (!Number.isFinite(baseValue) || baseValue <= 0) {
            updateMargin({ margem_percentual: 0 })
            return
        }

        const marginPercent = (targetTotal - extrasValue - baseValue) / baseValue
        updateMargin({
            margem_percentual: Number.isFinite(marginPercent) ? marginPercent : 0,
        })
    }

    const handleInstallmentChange = (value: string) => {
        const targetInstallment = toNumber(value)
        const monthlyRate = solveMonthlyRateFromInstallment({
            desired_installment: targetInstallment,
            financed_value: calculated.output.finance.valor_financiado,
            grace_months: input.finance.carencia_meses,
            grace_interest_mode: params.grace_interest_mode,
            installments: input.finance.num_parcelas,
        })

        updateFinance({ juros_mensal: monthlyRate })
    }

    const handleInstallmentInputChange = (value: string) => {
        setInstallmentInputDraft(value)
        if (!value.trim()) return
        handleInstallmentChange(value)
    }

    const handleInstallmentInputBlur = () => {
        if (installmentInputDraft === null) return
        if (installmentInputDraft.trim()) {
            handleInstallmentChange(installmentInputDraft)
        }
        setInstallmentInputDraft(null)
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

    const handleModuleSelect = (value: string) => {
        setModuleProductId(value)
        const product = panelProducts.find((p) => p.id === value)
        if (!product) return
        updateDimensioning({ potencia_modulo_w: product.power ?? input.dimensioning.potencia_modulo_w })
    }

    const handleMicroSelect = (value: string) => {
        setMicroProductId(value)
        const product = inverterProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateKit({ micro_unit_cost: unitCost })
    }

    const handleAddStringInverterRow = () => {
        setStringInverterRows((prev) => [
            ...prev,
            {
                row_id: createRowId(),
                product_id: "",
                quantity: 1,
                unit_cost: 0,
                power_kw: 0,
                power_source: "manual",
                purchase_required: true,
            },
        ])
    }

    const handleRemoveStringInverterRow = (rowId: string) => {
        setStringInverterRows((prev) => prev.filter((row) => row.row_id !== rowId))
    }

    const handleStringRowChange = (rowId: string, patch: Partial<StringInverterRow>) => {
        setStringInverterRows((prev) =>
            prev.map((row) => {
                if (row.row_id !== rowId) return row
                const next = { ...row, ...patch }
                if (next.power_source === "manual") {
                    next.purchase_required = true
                }
                return next
            })
        )
    }

    const handleStringRowProductSelect = (rowId: string, productId: string) => {
        const product = inverterProducts.find((entry) => entry.id === productId)
        if (!product) {
            handleStringRowChange(rowId, { product_id: productId })
            return
        }

        const unitCost = Number(product.cost ?? product.price ?? 0)
        const productPowerKw = toPowerKwFromProduct(product)

        if (productPowerKw > 0) {
            handleStringRowChange(rowId, {
                product_id: productId,
                unit_cost: unitCost,
                power_kw: productPowerKw,
                power_source: "product",
                purchase_required: false,
            })
            return
        }

        handleStringRowChange(rowId, {
            product_id: productId,
            unit_cost: unitCost,
            power_kw: 0,
            power_source: "manual",
            purchase_required: true,
        })
    }

    const handleStructureSoloSelect = (value: string) => {
        setStructureSoloProductId(value)
        const product = structureProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateStructure({ valor_unit_solo: unitCost })
    }

    const handleStructureTelhadoSelect = (value: string) => {
        setStructureTelhadoProductId(value)
        const product = structureProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateStructure({ valor_unit_telhado: unitCost })
    }

    const handleAddExtra = () => {
        const newExtra: ExtraItem = { id: Math.random().toString(36).slice(2), name: "", value: 0 }
        updateExtras({ outros_extras: [...input.extras.outros_extras, newExtra] })
    }

    const handleUpdateExtra = (id: string, patch: Partial<ExtraItem>) => {
        updateExtras({
            outros_extras: input.extras.outros_extras.map((extra) =>
                extra.id === id ? { ...extra, ...patch } : extra
            ),
        })
    }

    const handleRemoveExtra = (id: string) => {
        updateExtras({ outros_extras: input.extras.outros_extras.filter((extra) => extra.id !== id) })
    }

    const handleAddBalao = () => {
        updateFinance({
            baloes: [...input.finance.baloes, { balao_valor: 0, balao_mes: 0 }],
        })
    }

    const handleUpdateBalao = (index: number, patch: Partial<ProposalCalcInput["finance"]["baloes"][number]>) => {
        const updated = input.finance.baloes.map((balao, i) =>
            i === index ? { ...balao, ...patch } : balao
        )
        updateFinance({ baloes: updated })
    }

    const handleRemoveBalao = (index: number) => {
        const updated = input.finance.baloes.filter((_, i) => i !== index)
        updateFinance({ baloes: updated })
    }

    const handleSave = async () => {
        if (loading) return
        if (input.dimensioning.qtd_modulos <= 0) {
            showToast({
                variant: "error",
                title: "Dados incompletos",
                description: "Informe a quantidade de módulos para gerar o orçamento.",
            })
            return
        }
        if (!moduleProductId) {
            showToast({
                variant: "error",
                title: "Módulo obrigatório",
                description: "Selecione a placa/módulo do estoque para salvar o orçamento completo.",
            })
            return
        }
        if (input.dimensioning.tipo_inversor === "MICRO" && !microProductId) {
            showToast({
                variant: "error",
                title: "Inversor obrigatório",
                description: "Selecione o micro inversor para salvar o orçamento completo.",
            })
            return
        }
        if (input.dimensioning.tipo_inversor === "STRING") {
            const hasSelectedStringInverter = normalizedStringInverters.length > 0
            if (!hasSelectedStringInverter) {
                showToast({
                    variant: "error",
                    title: "Inversor obrigatório",
                    description: "Adicione pelo menos um inversor string para salvar o orçamento completo.",
                })
                return
            }

            const hasInvalidStringInverter = normalizedStringInverters.some((line) => line.quantity <= 0 || line.power_kw <= 0)
            if (hasInvalidStringInverter) {
                showToast({
                    variant: "error",
                    title: "Potência de inversor inválida",
                    description: "Preencha potência maior que zero para todos os inversores string selecionados.",
                })
                return
            }
        }

        const manualFirstName = manualContact.first_name.trim()
        const manualLastName = manualContact.last_name.trim()
        const manualWhatsapp = manualContact.whatsapp.trim()
        const selectedPhone = selectedContact?.whatsapp || selectedContact?.phone || selectedContact?.mobile || ""
        const hasIndicacao = Boolean(selectedIndicacaoId)

        if (!isEditMode) {
            if (!hasIndicacao && !selectedContact && !manualFirstName && !manualWhatsapp) {
                showToast({
                    variant: "error",
                    title: "Cliente obrigatório",
                    description: "Selecione um contato ou informe nome e WhatsApp para criar um cliente.",
                })
                return
            }

            if (!hasIndicacao && !selectedContact && (!manualFirstName || !manualWhatsapp)) {
                showToast({
                    variant: "error",
                    title: "Dados do cliente incompletos",
                    description: "Informe pelo menos nome e WhatsApp para criar o cliente.",
                })
                return
            }

            if (!hasIndicacao && selectedContact && !selectedPhone && !manualWhatsapp) {
                showToast({
                    variant: "error",
                    title: "Contato sem WhatsApp",
                    description: "O contato selecionado não possui WhatsApp/telefone. Preencha manualmente.",
                })
                return
            }
        }

        setLoading(true)
        try {
            const items: ProposalItemInsert[] = []

            if (moduleProductId) {
                items.push({
                    product_id: moduleProductId,
                    quantity: input.dimensioning.qtd_modulos,
                    unit_price: moduleUnitCost,
                    total_price: moduleUnitCost * input.dimensioning.qtd_modulos,
                })
            }

            if (input.dimensioning.tipo_inversor === "MICRO" && microProductId) {
                const qtdMicro = calculated.output.dimensioning.inversor.qtd_micro
                items.push({
                    product_id: microProductId,
                    quantity: qtdMicro,
                    unit_price: input.kit.micro_unit_cost,
                    total_price: input.kit.micro_unit_cost * qtdMicro,
                })
            }

            if (input.dimensioning.tipo_inversor === "STRING") {
                for (const row of validStringInverters) {
                    items.push({
                        product_id: row.product_id,
                        quantity: row.quantity,
                        unit_price: row.unit_cost,
                        total_price: row.unit_cost * row.quantity,
                    })
                }
            }

            if (structureSoloProductId && input.structure.qtd_placas_solo > 0) {
                items.push({
                    product_id: structureSoloProductId,
                    quantity: input.structure.qtd_placas_solo,
                    unit_price: input.structure.valor_unit_solo,
                    total_price: input.structure.valor_unit_solo * input.structure.qtd_placas_solo,
                })
            }

            if (structureTelhadoProductId && input.structure.qtd_placas_telhado > 0) {
                items.push({
                    product_id: structureTelhadoProductId,
                    quantity: input.structure.qtd_placas_telhado,
                    unit_price: input.structure.valor_unit_telhado,
                    total_price: input.structure.valor_unit_telhado * input.structure.qtd_placas_telhado,
                })
            }

            const proposalData: ProposalInsert & { source_mode: "complete" } = {
                status: isStatusLocked ? (initialProposal?.status ?? proposalStatus) : proposalStatus,
                total_value: calculated.output.totals.total_a_vista,
                equipment_cost: calculated.output.kit.custo_kit,
                additional_cost: calculated.output.extras.extras_total,
                profit_margin: calculated.output.margin.margem_valor,
                total_power: calculated.output.dimensioning.kWp,
                calculation: calculated,
                source_mode: "complete",
            }

            const itemsForSave = items.length > 0
                ? items
                : (
                    isEditMode
                        ? (initialProposal?.items ?? []).map((item) => ({
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                        }))
                        : items
                )

            const result = isEditMode
                ? await updateProposal(initialProposal!.id, proposalData, itemsForSave)
                : await createProposal(proposalData, items, {
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
                    : "O orçamento foi salvo com sucesso.",
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{isEditMode ? "Cliente Vinculado" : "Cliente"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isEditMode ? (
                            <div className="space-y-2 rounded-md border p-3 text-sm">
                                <p>
                                    <span className="font-medium">Cliente:</span>{" "}
                                    {initialProposal?.client_name || initialProposal?.contact_name || "Não informado"}
                                </p>
                                <p>
                                    <span className="font-medium">Status atual:</span>{" "}
                                    {toStatusLabel(initialProposal?.status)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Para alterar vínculo de cliente/contato, crie um novo orçamento.
                                </p>
                            </div>
                        ) : (
                            <>
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
                                            if (source === 'indicacao') {
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
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearClientSelection}
                                >
                                    Limpar
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Selecione um contato/indicação existente ou preencha abaixo para criar um novo.
                            </p>
                        </div>

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
                        {(selectedContact || selectedIndicacaoId) && (
                            <p className="text-xs text-muted-foreground">
                                {selectedContact
                                    ? "Contato selecionado dos importados."
                                    : "Indicação selecionada no CRM Dorata."}
                            </p>
                        )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Dimensionamento</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Quantidade de módulos</Label>
                            <Input
                                type="number"
                                min="0"
                                value={input.dimensioning.qtd_modulos}
                                onChange={(e) => updateDimensioning({ qtd_modulos: toNumber(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Potência do módulo (W)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={input.dimensioning.potencia_modulo_w}
                                onChange={(e) => updateDimensioning({ potencia_modulo_w: toNumber(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Índice de produção</Label>
                            <Input
                                type="number"
                                min="0"
                                value={input.dimensioning.indice_producao}
                                onChange={(e) => updateDimensioning({ indice_producao: toNumber(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fator de oversizing</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={input.dimensioning.fator_oversizing}
                                onChange={(e) => updateDimensioning({ fator_oversizing: toNumber(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo de inversor</Label>
                            <Select
                                value={input.dimensioning.tipo_inversor}
                                onValueChange={(value) =>
                                    updateDimensioning({ tipo_inversor: value as ProposalCalcInput["dimensioning"]["tipo_inversor"] })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STRING">String</SelectItem>
                                    <SelectItem value="MICRO">Micro inversor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Potência inversor string (kW)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={input.dimensioning.potencia_inversor_string_kw ?? 0}
                                disabled={
                                    input.dimensioning.tipo_inversor === "STRING" &&
                                    stringInverterRows.some((row) => Boolean(row.product_id))
                                }
                                onChange={(e) => updateDimensioning({ potencia_inversor_string_kw: toNumber(e.target.value) })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Sem linhas de inversor string, o cálculo usa este valor (ou oversizing quando 0).
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Status do orcamento</Label>
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
                            <p className="text-xs text-muted-foreground">
                                {isStatusLocked
                                    ? `Status atual (${toStatusLabel(initialProposal?.status)}) é mantido automaticamente.`
                                    : "Apenas orcamentos enviados entram na previsao de comissao."}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>kWp calculado</Label>
                            <Input value={calculated.output.dimensioning.kWp.toFixed(2)} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>kWh estimado</Label>
                            <Input value={calculated.output.dimensioning.kWh_estimado.toFixed(2)} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>Potência inversor calculada (kW)</Label>
                            <Input value={calculated.output.dimensioning.inversor.pot_string_kw.toFixed(2)} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label>Quantidade micro inversor</Label>
                            <Input value={calculated.output.dimensioning.inversor.qtd_micro} disabled />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Kit e equipamentos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Módulo (estoque ou manual)</Label>
                                <Select value={moduleProductId} onValueChange={handleModuleSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o módulo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {panelProducts.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                                {product.name} ({product.power || 0}W)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Custo base módulo (R$/W)</Label>
                                <Input
                                    type="number"
                                    step="0.0001"
                                    value={input.kit.module_cost_per_watt}
                                    onChange={(e) => updateKit({ module_cost_per_watt: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Custo unitário módulo (calculado)</Label>
                            <Input value={formatCurrency(moduleUnitCost)} disabled />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Custo cabeamento por módulo</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.kit.cabling_unit_cost}
                                    onChange={(e) => updateKit({ cabling_unit_cost: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Custo total inversores string (calculado)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={stringInverterTotalCost}
                                    disabled
                                />
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-3">
                            <div className="flex items-center justify-between">
                                <Label>Inversores string</Label>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddStringInverterRow}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar inversor
                                </Button>
                            </div>
                            {stringInverterRows.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Adicione um ou mais inversores string. A potência de cada item entra no cálculo final.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {stringInverterRows.map((row) => {
                                        const isManualPower = row.power_source === "manual"
                                        return (
                                            <div key={row.row_id} className="rounded-md border p-3">
                                                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_90px_140px_140px_auto]">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Produto</Label>
                                                        <Select
                                                            value={row.product_id}
                                                            onValueChange={(value) => handleStringRowProductSelect(row.row_id, value)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Selecionar" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {effectiveStringInverters.map((product) => (
                                                                    <SelectItem key={product.id} value={product.id}>
                                                                        {product.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Qtd.</Label>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={row.quantity}
                                                            onChange={(e) =>
                                                                handleStringRowChange(row.row_id, {
                                                                    quantity: normalizeQuantity(toNumber(e.target.value)),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Custo unitário</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={row.unit_cost}
                                                            onChange={(e) =>
                                                                handleStringRowChange(row.row_id, {
                                                                    unit_cost: normalizePositive(toNumber(e.target.value)),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Potência (kW)</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={row.power_kw}
                                                            disabled={!isManualPower}
                                                            onChange={(e) =>
                                                                handleStringRowChange(row.row_id, {
                                                                    power_kw: normalizePositive(toNumber(e.target.value)),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="flex items-end justify-end">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveStringInverterRow(row.row_id)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {isManualPower
                                                            ? "Potência manual: item marcado para compra necessária."
                                                            : "Potência carregada automaticamente do estoque (W -> kW)."}
                                                    </span>
                                                    {row.purchase_required ? (
                                                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                                                            Compra necessária
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Custo unitário micro</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.kit.micro_unit_cost}
                                    onChange={(e) => updateKit({ micro_unit_cost: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Custo kit calculado</Label>
                                <Input value={formatCurrency(calculated.output.kit.custo_kit)} disabled />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-1">
                            <div className="space-y-2">
                                <Label>Micro inversor (opcional)</Label>
                                <Select value={microProductId} onValueChange={handleMicroSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecionar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {effectiveMicroInverters.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                                {product.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Estrutura</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Estrutura solo (produto)</Label>
                                <Select value={structureSoloProductId} onValueChange={handleStructureSoloSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecionar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {structureProducts.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                                {product.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor unitário solo</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.structure.valor_unit_solo}
                                    onChange={(e) => updateStructure({ valor_unit_solo: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Placas solo</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={input.structure.qtd_placas_solo}
                                    onChange={(e) => updateStructure({ qtd_placas_solo: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Total estrutura solo</Label>
                                <Input value={formatCurrency(calculated.output.structure.valor_estrutura_solo)} disabled />
                            </div>
                        </div>

                        <Separator />

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Estrutura telhado (produto)</Label>
                                <Select value={structureTelhadoProductId} onValueChange={handleStructureTelhadoSelect}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecionar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {structureProducts.map((product) => (
                                            <SelectItem key={product.id} value={product.id}>
                                                {product.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor unitário telhado</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.structure.valor_unit_telhado}
                                    onChange={(e) => updateStructure({ valor_unit_telhado: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Placas telhado</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={input.structure.qtd_placas_telhado}
                                    onChange={(e) => updateStructure({ qtd_placas_telhado: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Total estrutura telhado</Label>
                                <Input value={formatCurrency(calculated.output.structure.valor_estrutura_telhado)} disabled />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Margem e extras</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Total da usina (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={calculated.output.totals.total_a_vista.toFixed(2)}
                                    onChange={(e) => handleTotalUsinaChange(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Margem calculada</Label>
                                <Input value={formatCurrency(calculated.output.margin.margem_valor)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Margem (%) calculada</Label>
                                <Input value={(input.margin.margem_percentual * 100).toFixed(4)} disabled />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Baterias</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.extras.valor_baterias}
                                    onChange={(e) => updateExtras({ valor_baterias: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Adequação padrão</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.extras.valor_adequacao_padrao}
                                    onChange={(e) => updateExtras({ valor_adequacao_padrao: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Outros extras</Label>
                                <Button variant="outline" size="sm" onClick={handleAddExtra}>
                                    <Plus className="mr-2 h-4 w-4" /> Adicionar
                                </Button>
                            </div>
                            {input.extras.outros_extras.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhum extra adicional.</p>
                            ) : (
                                <div className="space-y-3">
                                    {input.extras.outros_extras.map((extra) => (
                                        <div key={extra.id} className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
                                            <Input
                                                placeholder="Descrição"
                                                value={extra.name}
                                                onChange={(e) => handleUpdateExtra(extra.id, { name: e.target.value })}
                                            />
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={extra.value}
                                                onChange={(e) => handleUpdateExtra(extra.id, { value: toNumber(e.target.value) })}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleRemoveExtra(extra.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                                checked={input.finance.enabled}
                                onChange={(e) => updateFinance({ enabled: e.target.checked })}
                            />
                            <Label>Ativar parcelamento</Label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Entrada (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.finance.entrada_valor}
                                    onChange={(e) => updateFinance({ entrada_valor: toNumber(e.target.value) })}
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
                                    value={input.finance.carencia_meses}
                                    onChange={(e) => updateFinance({ carencia_meses: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Parcela mensal (R$)</Label>
                                <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={
                                        installmentInputDraft ??
                                        formatDecimalForInput(calculated.output.finance.parcela_mensal)
                                    }
                                    onChange={(e) => handleInstallmentInputChange(e.target.value)}
                                    onBlur={handleInstallmentInputBlur}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Número de parcelas</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={input.finance.num_parcelas}
                                    onChange={(e) => updateFinance({ num_parcelas: toNumber(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Juros mensal (%) calculado</Label>
                                <Input value={(input.finance.juros_mensal * 100).toFixed(4)} disabled />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Balões</Label>
                                <Button variant="outline" size="sm" onClick={handleAddBalao}>
                                    <Plus className="mr-2 h-4 w-4" /> Adicionar
                                </Button>
                            </div>
                            {input.finance.baloes.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhum balão configurado.</p>
                            ) : (
                                <div className="space-y-3">
                                    {input.finance.baloes.map((balao, index) => (
                                        <div key={`${balao.balao_mes}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="Valor"
                                                value={balao.balao_valor}
                                                onChange={(e) => handleUpdateBalao(index, { balao_valor: toNumber(e.target.value) })}
                                            />
                                            <Input
                                                type="number"
                                                placeholder="Mês"
                                                value={balao.balao_mes}
                                                onChange={(e) => handleUpdateBalao(index, { balao_mes: toNumber(e.target.value) })}
                                            />
                                            <Button variant="ghost" size="icon" onClick={() => handleRemoveBalao(index)}>
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
                            <span className="text-muted-foreground">Potência Total</span>
                            <span className="font-medium">{calculated.output.dimensioning.kWp.toFixed(2)} kWp</span>
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Kit gerador</span>
                                <span>{formatCurrency(calculated.output.kit.custo_kit)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Estrutura (solo)</span>
                                <span>{formatCurrency(calculated.output.structure.valor_estrutura_solo)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Estrutura (telhado)</span>
                                <span>{formatCurrency(calculated.output.structure.valor_estrutura_telhado)}</span>
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
                                <span className="text-muted-foreground">Extras</span>
                                <span>{formatCurrency(calculated.output.extras.extras_total)}</span>
                            </div>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-lg">Total à vista</span>
                            <span className="font-bold text-xl text-primary">
                                {formatCurrency(calculated.output.totals.total_a_vista)}
                            </span>
                        </div>
                        {input.finance.enabled && (
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Valor financiado</span>
                                    <span>{formatCurrency(calculated.output.finance.valor_financiado)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Parcela mensal</span>
                                    <span>{formatCurrency(calculated.output.finance.parcela_mensal)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total com juros</span>
                                    <span>{formatCurrency(calculated.output.finance.total_pago)}</span>
                                </div>
                            </div>
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
