"use client"

import { useState, useEffect } from "react"
import { useActionState } from "react" // React 19 hook
import { calculateContractValues, createContract, CreateContractState } from "@/app/actions/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, Calculator } from "lucide-react"

// Initial state for form action
const initialState: CreateContractState = {
    success: false,
    message: '',
}

interface UnitInput {
    id: number
    name: string
    consumptions: string // comma separated or space separated for easier input
}

export function NewContractForm() {
    const [state, formAction, isPending] = useActionState(createContract, initialState)
    const [units, setUnits] = useState<UnitInput[]>([{ id: 1, name: "Unidade 1", consumptions: "" }])
    const [priceKwh, setPriceKwh] = useState(0.85) // Default example
    const [discount, setDiscount] = useState(20) // Default 20%

    // Live Preview State
    const [preview, setPreview] = useState<any>(null)

    const addUnit = () => {
        setUnits([...units, { id: Date.now(), name: `Unidade ${units.length + 1}`, consumptions: "" }])
    }

    const removeUnit = (id: number) => {
        if (units.length > 1) {
            setUnits(units.filter(u => u.id !== id))
        }
    }

    const updateUnit = (id: number, field: keyof UnitInput, value: string) => {
        setUnits(units.map(u => u.id === id ? { ...u, [field]: value } : u))
    }

    // Parse consumptions from string to number array
    const parseConsumptions = (str: string): number[] => {
        return str.split(/[\s,]+/)
            .map(s => parseFloat(s.replace(',', '.')))
            .filter(n => !isNaN(n) && n > 0)
    }

    // Effect for Real-time Calculation Preview
    useEffect(() => {
        // Debounce or just run? React 19 is fast. Let's try running.
        const runCalc = async () => {
            const parsedUnits = units.map(u => ({
                name: u.name,
                consumptions: parseConsumptions(u.consumptions)
            }))

            // Client-side approximation or call server action for precision?
            // Calling the same logic would be ideal. For now i'll implement the simple logic here to avoid server roundtrip on every keystroke
            // Or I can expose the calculate function via API.
            // Im implementing a simple local version for speed.

            let totalAvg = 0
            parsedUnits.forEach(u => {
                const sum = u.consumptions.reduce((a, b) => a + b, 0)
                const count = u.consumptions.length || 1
                totalAvg += (sum / count)
            })

            const priceFinal = priceKwh * (1 - (discount / 100))
            const valLoc = Math.floor(totalAvg * priceFinal)
            const plates = Math.floor(totalAvg / 66)

            setPreview({ totalAvg, valLoc, plates })
        }
        runCalc()
    }, [units, priceKwh, discount])


    return (
        <form action={formAction} className="space-y-6">
            <input type="hidden" name="units_json" value={JSON.stringify(units.map(u => ({ ...u, consumptions: parseConsumptions(u.consumptions) })))} />

            {/* Status Message */}
            {state.message && (
                <div className={`p-4 rounded ${state.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {state.message}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Form */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader><CardTitle>Dados do Cliente</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <Label>Tipo de Contrato</Label>
                                <select name="type" className="w-full border rounded p-2">
                                    <option value="RENTAL_PF">Rental PF (Locação)</option>
                                    <option value="RENTAL_PJ">Rental PJ (Locação)</option>
                                    <option value="DORATA_PF">Dorata PF (Venda)</option>
                                    <option value="DORATA_PJ">Dorata PJ (Venda)</option>
                                </select>
                            </div>
                            <input type="hidden" name="brand" value="RENTAL" /> {/* Logic to switch brand based on type can be added */}

                            <div><Label>Nome Completo / Razão Social</Label><Input name="clientName" required /></div>
                            <div><Label>CPF / CNPJ</Label><Input name="clientDoc" required /></div>
                            <div><Label>Telefone / Contato</Label><Input name="clientContact" /></div>
                            <div><Label>Endereço Completo</Label><Input name="clientAddress" /></div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Unidades Consumidoras</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            {units.map((unit, index) => (
                                <div key={unit.id} className="flex gap-2 items-start border-b pb-4">
                                    <div className="flex-1 space-y-2">
                                        <Input
                                            placeholder="Nome da UC (ex: Casa)"
                                            value={unit.name}
                                            onChange={e => updateUnit(unit.id, "name", e.target.value)}
                                        />
                                        <textarea
                                            className="w-full text-xs border rounded p-2 h-20"
                                            placeholder="Cole os consumos kWh aqui (separados por espaço ou vírgula)... ex: 350 420 380"
                                            value={unit.consumptions}
                                            onChange={e => updateUnit(unit.id, "consumptions", e.target.value)}
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {parseConsumptions(unit.consumptions).length} meses identificados.
                                        </p>
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeUnit(unit.id)} disabled={units.length === 1}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={addUnit}>
                                <Plus className="h-4 w-4 mr-2" /> Adicionar Unidade
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Parâmetros Comerciais</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Preço kWh (Energisa)</Label>
                                    <Input
                                        type="number" step="0.01"
                                        value={priceKwh}
                                        name="priceKwh"
                                        onChange={e => setPriceKwh(parseFloat(e.target.value))}
                                    />
                                </div>
                                <div>
                                    <Label>Desconto (%)</Label>
                                    <Input
                                        type="number" step="1"
                                        value={discount}
                                        name="discountPercent"
                                        onChange={e => setDiscount(parseFloat(e.target.value))}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Preview */}
                <div className="space-y-4">
                    <Card className="bg-slate-50 border-slate-200">
                        <CardHeader><CardTitle className="text-blue-700 flex items-center gap-2"><Calculator className="h-5 w-5" /> Simulação</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground uppercase tracking-wide">Valor Locação</p>
                                <div className="text-4xl font-bold text-slate-900">
                                    R$ {preview?.valLoc?.toLocaleString('pt-BR')}
                                </div>
                                <p className="text-xs text-muted-foreground">Mensal (Trucado)</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div className="p-4 bg-white rounded shadow-sm">
                                    <p className="text-xs text-muted-foreground uppercase">Placas</p>
                                    <div className="text-2xl font-semibold text-slate-800">{preview?.plates}</div>
                                    <p className="text-[10px] text-muted-foreground">Qtd. Estimada</p>
                                </div>
                                <div className="p-4 bg-white rounded shadow-sm">
                                    <p className="text-xs text-muted-foreground uppercase">Média Consumo</p>
                                    <div className="text-2xl font-semibold text-slate-800">{preview?.totalAvg?.toFixed(0)}</div>
                                    <p className="text-[10px] text-muted-foreground">kWh/mês</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <Button type="submit" className="w-full size-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={isPending}>
                                    {isPending ? "Gerando..." : "Gerar Contrato (Rascunho)"}
                                </Button>
                                <p className="text-xs text-center mt-2 text-muted-foreground">
                                    Ao gerar, você poderá editar o texto antes de aprovar.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    )
}
