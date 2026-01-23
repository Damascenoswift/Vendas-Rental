"use client"

import { useMemo, useState } from "react"
import type { Product } from "@/services/product-service"
import { createProposal } from "@/services/proposal-service"
import type { ProposalItemInsert, ProposalInsert, PricingRule } from "@/services/proposal-service"
import { calculateProposal, type ProposalCalcInput, type ProposalCalcParams } from "@/lib/proposal-calculation"
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

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
}

type ExtraItem = { id: string; name: string; value: number }

type RuleMap = Record<string, number>

function toNumber(value: string) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
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

function getSpecValue(product: Product, key: string) {
    const specs = product.specs
    if (!specs || typeof specs !== "object" || Array.isArray(specs)) {
        return undefined
    }
    return (specs as Record<string, any>)[key]
}

export function ProposalCalculator({ products, pricingRules = [] }: ProposalCalculatorProps) {
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

    const [moduleProductId, setModuleProductId] = useState<string>("")
    const [microProductId, setMicroProductId] = useState<string>("")
    const [stringProductId, setStringProductId] = useState<string>("")
    const [stringQuantity, setStringQuantity] = useState<number>(1)
    const [structureSoloProductId, setStructureSoloProductId] = useState<string>("")
    const [structureTelhadoProductId, setStructureTelhadoProductId] = useState<string>("")

    const [proposalStatus, setProposalStatus] = useState<"draft" | "sent">("sent")
    const [input, setInput] = useState<ProposalCalcInput>(() => ({
        dimensioning: {
            qtd_modulos: 0,
            potencia_modulo_w: rules.potencia_modulo_w ?? 700,
            indice_producao: rules.indice_producao ?? 112,
            tipo_inversor: "STRING",
            fator_oversizing: rules.default_oversizing_factor ?? params.default_oversizing_factor,
        },
        kit: {
            module_unit_cost: rules.module_unit_cost ?? 0,
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
    }))

    const { showToast } = useToast()
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const calculated = useMemo(() => calculateProposal(input), [input])

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

    const handleModuleSelect = (value: string) => {
        setModuleProductId(value)
        const product = panelProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateDimensioning({ potencia_modulo_w: product.power ?? input.dimensioning.potencia_modulo_w })
        updateKit({ module_unit_cost: unitCost })
    }

    const handleMicroSelect = (value: string) => {
        setMicroProductId(value)
        const product = inverterProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateKit({ micro_unit_cost: unitCost })
    }

    const handleStringSelect = (value: string) => {
        setStringProductId(value)
        const product = inverterProducts.find((p) => p.id === value)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateKit({ string_inverter_total_cost: unitCost * stringQuantity })
    }

    const handleStringQuantityChange = (value: number) => {
        setStringQuantity(value)
        const product = inverterProducts.find((p) => p.id === stringProductId)
        if (!product) return
        const unitCost = product.cost ?? product.price ?? 0
        updateKit({ string_inverter_total_cost: unitCost * value })
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

        setLoading(true)
        try {
            const items: ProposalItemInsert[] = []

            if (moduleProductId) {
                items.push({
                    product_id: moduleProductId,
                    quantity: input.dimensioning.qtd_modulos,
                    unit_price: input.kit.module_unit_cost,
                    total_price: input.kit.module_unit_cost * input.dimensioning.qtd_modulos,
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

            if (input.dimensioning.tipo_inversor === "STRING" && stringProductId && stringQuantity > 0) {
                const unitPrice = stringQuantity > 0 ? input.kit.string_inverter_total_cost / stringQuantity : 0
                items.push({
                    product_id: stringProductId,
                    quantity: stringQuantity,
                    unit_price: unitPrice,
                    total_price: input.kit.string_inverter_total_cost,
                })
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

            const proposalData: ProposalInsert = {
                status: proposalStatus,
                total_value: calculated.output.totals.total_a_vista,
                equipment_cost: calculated.output.kit.custo_kit,
                additional_cost: calculated.output.extras.extras_total,
                profit_margin: calculated.output.margin.margem_valor,
                total_power: calculated.output.dimensioning.kWp,
                calculation: calculated,
            }

            await createProposal(proposalData, items)

            showToast({
                title: "Orçamento criado",
                description: "O orçamento foi salvo com sucesso.",
                variant: "success",
            })
            router.push("/admin/orcamentos")
        } catch (error) {
            console.error(error)
            showToast({
                variant: "error",
                title: "Erro",
                description: "Falha ao salvar o orçamento.",
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
                            <Label>Status do orcamento</Label>
                            <Select value={proposalStatus} onValueChange={(value) => setProposalStatus(value as "draft" | "sent")}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Rascunho</SelectItem>
                                    <SelectItem value="sent">Enviado</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Apenas orcamentos enviados entram na previsao de comissao.
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
                            <Label>Potência inversor (kW)</Label>
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
                                <Label>Custo unitário módulo</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.kit.module_unit_cost}
                                    onChange={(e) => updateKit({ module_unit_cost: toNumber(e.target.value) })}
                                />
                            </div>
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
                                <Label>Custo total inversor (string)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.kit.string_inverter_total_cost}
                                    onChange={(e) => updateKit({ string_inverter_total_cost: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Inversor string (opcional)</Label>
                                <Select value={stringProductId} onValueChange={handleStringSelect}>
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
                                <Label>Qtd. string</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={stringQuantity}
                                    onChange={(e) => handleStringQuantityChange(toNumber(e.target.value))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Custo unitário micro</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={input.kit.micro_unit_cost}
                                    onChange={(e) => updateKit({ micro_unit_cost: toNumber(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
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
                            <div className="space-y-2">
                                <Label>Custo kit calculado</Label>
                                <Input value={formatCurrency(calculated.output.kit.custo_kit)} disabled />
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
                                <Label>Margem (%)</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={(input.margin.margem_percentual * 100).toFixed(2)}
                                    onChange={(e) => updateMargin({ margem_percentual: toNumber(e.target.value) / 100 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Margem calculada</Label>
                                <Input value={formatCurrency(calculated.output.margin.margem_valor)} disabled />
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
                                <Label>Juros mensal</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={(input.finance.juros_mensal * 100).toFixed(2)}
                                    onChange={(e) => updateFinance({ juros_mensal: toNumber(e.target.value) / 100 })}
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
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Orçamento"}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
