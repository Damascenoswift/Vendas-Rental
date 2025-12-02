"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function RentalCalculator() {
    // 1. Estados (Inputs do usuário)
    const [fatura, setFatura] = useState<number>(0)
    const [deducao, setDeducao] = useState<number>(180) // Valor padrão comum
    const [desconto, setDesconto] = useState<number>(0)
    const [porcentagemComissao, setPorcentagemComissao] = useState<number>(20) // Padrão 20%
    const [splitPorcentagem, setSplitPorcentagem] = useState<number>(0) // 0 se não houver sócio

    // 2. Estados Calculados (Saídas)
    const [valorEnergia, setValorEnergia] = useState<number>(0)
    const [comissaoTotal, setComissaoTotal] = useState<number>(0)
    const [minhaComissao, setMinhaComissao] = useState<number>(0)

    // 3. Efeito para calcular o Valor Energia
    useEffect(() => {
        if (fatura > 0) {
            const fatorDesconto = 1 - desconto / 100
            // Fórmula: (Fatura - Dedução) * (1 - Desconto%)
            const energiaCalculada = Math.max(0, (fatura - deducao) * fatorDesconto)
            setValorEnergia(energiaCalculada)
        } else {
            setValorEnergia(0)
        }
    }, [fatura, deducao, desconto])

    // 4. Efeito para calcular Comissões
    useEffect(() => {
        // Regra de negócio: % definida pelo usuário sobre o valor energia
        const total = valorEnergia * (porcentagemComissao / 100)
        setComissaoTotal(total)

        // Aplica o split se houver
        if (splitPorcentagem > 0) {
            const parteDoSocio = total * (splitPorcentagem / 100)
            setMinhaComissao(total - parteDoSocio)
        } else {
            setMinhaComissao(total)
        }
    }, [valorEnergia, splitPorcentagem, porcentagemComissao])

    // 5. Exibição dos 30% e 70% (Removido)
    // const adiantamento30 = minhaComissao * 0.3
    // const restante70 = minhaComissao - adiantamento30

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value)
    }

    return (
        <Card className="border-dashed bg-muted/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Calculadora de Comissão (Estimativa)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="fatura" className="text-xs">Valor Fatura (R$)</Label>
                        <Input
                            id="fatura"
                            type="number"
                            placeholder="0,00"
                            className="h-8 text-sm"
                            value={fatura || ""}
                            onChange={(e) => setFatura(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="deducao" className="text-xs">Dedução (R$)</Label>
                        <Input
                            id="deducao"
                            type="number"
                            className="h-8 text-sm"
                            value={deducao || ""}
                            onChange={(e) => setDeducao(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="desconto" className="text-xs">Desconto (%)</Label>
                        <Input
                            id="desconto"
                            type="number"
                            placeholder="0"
                            className="h-8 text-sm"
                            value={desconto || ""}
                            onChange={(e) => setDesconto(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="comissao" className="text-xs">Sua Comissão (%)</Label>
                        <Input
                            id="comissao"
                            type="number"
                            placeholder="20"
                            className="h-8 text-sm"
                            value={porcentagemComissao || ""}
                            onChange={(e) => setPorcentagemComissao(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2 col-span-2">
                        <Label htmlFor="split" className="text-xs">Split com Sócio (%)</Label>
                        <Input
                            id="split"
                            type="number"
                            placeholder="0"
                            className="h-8 text-sm"
                            value={splitPorcentagem || ""}
                            onChange={(e) => setSplitPorcentagem(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div className="rounded-md bg-background p-3 text-sm space-y-1 border">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor Energia:</span>
                        <span className="font-medium">{formatCurrency(valorEnergia)}</span>
                    </div>
                    <div className="flex justify-between text-primary font-bold pt-1 border-t mt-1">
                        <span>Comissão Total:</span>
                        <span>{formatCurrency(minhaComissao)}</span>
                    </div>
                </div>

                <div className="rounded bg-emerald-500/10 p-3 text-center text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    <p className="font-semibold mb-0.5">Comissão a Receber</p>
                    <p className="text-2xl font-bold">{formatCurrency(minhaComissao)}</p>
                </div>
            </CardContent>
        </Card>
    )
}
