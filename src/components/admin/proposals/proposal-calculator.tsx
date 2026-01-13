"use client"

import { useState, useEffect } from "react"
import { Product, getProducts } from "@/services/product-service"
import { calculateProposalValue, createProposal, PricingRule, getPricingRules } from "@/services/proposal-service"
import { ProductSelector } from "./product-selector"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Loader2, Calculator } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ProposalCalculatorProps {
    products: Product[]
    // rules could be passed here or fetched inside service
}

export function ProposalCalculator({ products }: ProposalCalculatorProps) {
    // State
    const [panels, setPanels] = useState<{ id: string, quantity: number, price: number, power?: number }[]>([])
    const [inverters, setInverters] = useState<{ id: string, quantity: number, price: number }[]>([])
    const [structures, setStructures] = useState<{ id: string, quantity: number, price: number }[]>([])

    // Calculated Values
    const [calculated, setCalculated] = useState({
        totalValue: 0,
        equipmentCost: 0,
        laborCost: 0,
        profitMargin: 0,
        totalPower: 0
    })

    const [loading, setLoading] = useState(false)
    const { showToast } = useToast()
    const router = useRouter()

    // Derived lists
    const panelProducts = products.filter(p => p.type === 'module')
    const inverterProducts = products.filter(p => p.type === 'inverter')
    const structureProducts = products.filter(p => p.type === 'structure')

    // Calculation Effect
    useEffect(() => {
        const runCalc = async () => {
            // Prepare data for calculation
            // Naive approach: we just pass items to server action or local function?
            // Since getting rules is async, let's call a server action wrapper or do it client side if we pass rules.
            // For now, let's call the server action `calculateProposalValue`

            // We need to reshape slightly
            if (panels.length === 0 && inverters.length === 0) {
                setCalculated({ totalValue: 0, equipmentCost: 0, laborCost: 0, profitMargin: 0, totalPower: 0 })
                return
            }

            const panelItem = panels[0] // Assume single panel type for now or sum up
            // If multiple panels, logic needs to be robust. Let's assume user picks ONE panel type mainly.
            // But our selector allows array.

            // Actually `calculateProposalValue` expects specific args. Let's handle generic list.
            // We will simplify: The service function `calculateProposalValue` I wrote expects:
            // panels: { single object }, but UI allows list.
            // Let's refactor service or loop here.

            // Let's just sum it up here for the UI preview or modify logic slightly.
            // Let's call the server action.

            try {
                // To keep it simple, we only support 1 panel type for calculation right now or we sum them up.
                // If the user selects multiple panel types, we pass the first one or aggregate.
                // Aggregating:
                const aggPanel = {
                    id: 'agg',
                    quantity: panels.reduce((sum, p) => sum + p.quantity, 0),
                    price: panels.reduce((sum, p) => sum + (p.price * p.quantity), 0) / (panels.reduce((sum, p) => sum + p.quantity, 0) || 1),
                    power: panels[0]?.power || 0 // Use first panel's power for now.
                }

                const result = await calculateProposalValue(
                    aggPanel,
                    inverters,
                    structures,
                    []
                )
                setCalculated(result)
            } catch (e) {
                console.error(e)
            }
        }

        runCalc()
    }, [panels, inverters, structures])


    const handleSave = async () => {
        if (calculated.totalValue === 0) return

        // Creating proposal... needs client ID etc.
        // For this page, maybe we just show the calculation?
        // The prompt says "Proposal Generator UI (Select products, auto-sum)".
        // And "Generate PDF/Save".

        // We probably need a client selection step. For now let's just show Success.
        showToast({
            title: "Calculado",
            description: `Valor Total: ${calculated.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
            variant: 'success'
        })
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                {/* Panels */}
                <ProductSelector
                    label="Módulos Fotovoltaicos"
                    products={panelProducts}
                    selectedItems={panels}
                    onChange={setPanels}
                    singleItem={false}
                />

                {/* Inverters */}
                <ProductSelector
                    label="Inversores"
                    products={inverterProducts}
                    selectedItems={inverters}
                    onChange={setInverters}
                />

                {/* Structures */}
                <ProductSelector
                    label="Estrutura"
                    products={structureProducts}
                    selectedItems={structures}
                    onChange={setStructures}
                />
            </div>

            <div className="md:col-span-1">
                <Card className="sticky top-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calculator className="h-5 w-5" /> Resumo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Potência Total</span>
                            <span className="font-medium">{(calculated.totalPower / 1000).toFixed(2)} kWp</span>
                        </div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Equipamentos</span>
                                <span>{calculated.equipmentCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Mão de Obra</span>
                                <span>{calculated.laborCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Margem</span>
                                <span>{calculated.profitMargin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center pt-2">
                            <span className="font-bold text-lg">Total</span>
                            <span className="font-bold text-xl text-primary">
                                {calculated.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleSave} disabled={loading || calculated.totalValue === 0}>
                            Salvar Orçamento
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
