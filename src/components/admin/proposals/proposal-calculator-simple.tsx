"use client"

import { useMemo, useState } from "react"
import type { Product } from "@/services/product-service"
import { createProposal, updateProposal } from "@/services/proposal-service"
import type { PricingRule, ProposalInsert, ProposalEditorData, ProposalStatus } from "@/services/proposal-service"
import {
    calculateProposal,
    solveMonthlyRateFromInstallment,
    type ProposalCalcInput,
    type ProposalCalcParams
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
import { Loader2, Calculator } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { LeadSelect } from "@/components/admin/tasks/lead-select"

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
    initialProposal?: ProposalEditorData | null
    intent?: "create" | "edit"
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

export function ProposalCalculatorSimple({
    products,
    pricingRules = [],
    initialProposal = null,
    intent = "create",
}: ProposalCalculatorProps) {
    const rules = useMemo(() => buildRuleMap(pricingRules), [pricingRules])
    const defaultModulePower = rules.potencia_modulo_w ?? 700
    const defaultSoloUnitValue = rules.valor_unit_solo ?? 0
    const defaultInterest = normalizePercent(rules.juros_mensal ?? 0.019, 0.019)
    const defaultProductionIndex = rules.indice_producao ?? 112
    const defaultMargin = normalizePercent(rules.margem_percentual ?? rules.default_margin ?? 0.1, 0.1)

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
    const isEditMode = intent === "edit" && Boolean(initialProposal?.id)

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

    const [qtdModulos, setQtdModulos] = useState(
        initialInput?.dimensioning?.qtd_modulos ?? 0
    )
    const [potenciaModuloW, setPotenciaModuloW] = useState(
        initialInput?.dimensioning?.potencia_modulo_w ?? defaultModulePower
    )
    const [indiceProducao, setIndiceProducao] = useState(
        initialInput?.dimensioning?.indice_producao ?? defaultProductionIndex
    )
    const [tipoInversor, setTipoInversor] = useState<ProposalCalcInput["dimensioning"]["tipo_inversor"]>(
        initialInput?.dimensioning?.tipo_inversor ?? "STRING"
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
        initialProposal?.calculation?.output?.kit?.custo_kit ?? 0
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
        Math.max(
            normalizePercent(Number(initialInput?.finance?.juros_mensal ?? defaultInterest), defaultInterest),
            defaultInterest
        )
    )
    const [numParcelas, setNumParcelas] = useState(
        initialInput?.finance?.num_parcelas ?? 0
    )
    const [installmentInputDraft, setInstallmentInputDraft] = useState<string | null>(null)

    const { showToast } = useToast()
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const calculationInput = useMemo<ProposalCalcInput>(() => {
        const denominator = qtdModulos * potenciaModuloW
        const moduleCostPerWatt = denominator > 0 ? kitGeradorValor / denominator : 0

        return {
            dimensioning: {
                qtd_modulos: qtdModulos,
                potencia_modulo_w: potenciaModuloW,
                indice_producao: indiceProducao,
                tipo_inversor: tipoInversor,
                fator_oversizing: 1,
                potencia_inversor_string_kw: potenciaInversorStringKw,
                qtd_inversor_string: qtdInversorString,
                qtd_inversor_micro: qtdInversorMicro,
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
            params,
        }
    }, [
        qtdModulos,
        potenciaModuloW,
        kitGeradorValor,
        margemPercentual,
        valorAdicional,
        indiceProducao,
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
        params,
    ])

    const calculated = useMemo(() => calculateProposal(calculationInput), [calculationInput])
    const selectedContactPhone = selectedContact?.whatsapp || selectedContact?.phone || selectedContact?.mobile || ""
    const isContactPhoneLocked = Boolean(selectedContact && selectedContactPhone)
    const usesInventory = products.length > 0
    const kitDuplicado = calculated.output.kit.custo_kit * 2
    const estruturaDuplicada = calculated.output.structure.valor_estrutura_solo * 2

    const handleTotalUsinaChange = (value: string) => {
        const targetTotal = toNumber(value)
        const baseValue = calculated.output.totals.soma_com_estrutura
        const extrasValue = calculated.output.extras.extras_total

        if (!Number.isFinite(baseValue) || baseValue <= 0) {
            setMargemPercentual(0)
            return
        }

        const nextMarginPercent = (targetTotal - extrasValue - baseValue) / baseValue
        setMargemPercentual(Number.isFinite(nextMarginPercent) ? nextMarginPercent : 0)
    }

    const handleInstallmentChange = (value: string) => {
        const targetInstallment = toNumber(value)
        const monthlyRate = solveMonthlyRateFromInstallment({
            desired_installment: targetInstallment,
            financed_value: calculated.output.finance.valor_financiado,
            grace_months: carenciaMeses,
            grace_interest_mode: params.grace_interest_mode,
            installments: numParcelas,
        })

        setJurosMensal(Math.max(monthlyRate, defaultInterest))
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
            const proposalData: ProposalInsert & { source_mode: "simple" } = {
                status: isStatusLocked ? (initialProposal?.status ?? proposalStatus) : proposalStatus,
                total_value: calculated.output.totals.total_a_vista,
                equipment_cost: calculated.output.kit.custo_kit,
                additional_cost: calculated.output.extras.extras_total,
                profit_margin: calculated.output.margin.margem_valor,
                total_power: calculated.output.dimensioning.kWp,
                calculation: calculated,
                source_mode: "simple",
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
                    : "Orçamento salvo e vinculado ao cliente para histórico.",
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
                                O orçamento fica salvo neste contato e cada novo orçamento gera histórico.
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
                            </>
                        )}
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
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. inversor string</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={qtdInversorString}
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
                                    onChange={(e) => setPotenciaInversorStringKw(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Qtd. micro inversor</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={qtdInversorMicro}
                                    onChange={(e) => setQtdInversorMicro(toNumber(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Sugestão automática atual: {calculated.output.dimensioning.inversor.qtd_micro_sugerida}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor do kit gerador (R$)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={kitGeradorValor}
                                    onChange={(e) => setKitGeradorValor(toNumber(e.target.value))}
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
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Potência total calculada</Label>
                                <Input value={`${calculated.output.dimensioning.kWp.toFixed(2)} kWp`} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Geração estimada</Label>
                                <Input value={`${calculated.output.dimensioning.kWh_estimado.toFixed(2)} kWh`} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de inversor</Label>
                                <Input value={calculated.output.dimensioning.inversor.tipo} disabled />
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
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={soloUnitValue}
                                        onChange={(e) => setSoloUnitValue(toNumber(e.target.value))}
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
                                <Input value={(margemPercentual * 100).toFixed(4)} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>Valor adicional (R$)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={valorAdicional}
                                    onChange={(e) => setValorAdicional(toNumber(e.target.value))}
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
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={entradaValor}
                                            onChange={(e) => setEntradaValor(toNumber(e.target.value))}
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
                                            value={numParcelas}
                                            onChange={(e) => setNumParcelas(toNumber(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Juros mensal (%) calculado</Label>
                                        <Input value={(jurosMensal * 100).toFixed(4)} disabled />
                                    </div>
                                </div>
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
