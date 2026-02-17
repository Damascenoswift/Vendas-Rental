"use client"

import { useState } from "react"
import type { Product } from "@/services/product-service"
import type { PricingRule } from "@/services/proposal-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ProposalCalculatorSimple } from "@/components/admin/proposals/proposal-calculator-simple"
import { ProposalCalculatorComplete } from "@/components/admin/proposals/proposal-calculator-complete"

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
}

type ProposalMode = "simple" | "complete"

export function ProposalCalculator({ products, pricingRules = [] }: ProposalCalculatorProps) {
    const [mode, setMode] = useState<ProposalMode>("simple")

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Modo do orçamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Label>Escolha o tipo de preenchimento</Label>
                    <Select value={mode} onValueChange={(value) => setMode(value as ProposalMode)}>
                        <SelectTrigger className="max-w-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="simple">Simples (padrão)</SelectItem>
                            <SelectItem value="complete">Completo</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {mode === "simple" ? (
                <ProposalCalculatorSimple products={products} pricingRules={pricingRules} />
            ) : (
                <ProposalCalculatorComplete products={products} pricingRules={pricingRules} />
            )}
        </div>
    )
}
