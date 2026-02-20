"use client"

import { useState } from "react"
import type { Product } from "@/services/product-service"
import type { PricingRule } from "@/services/proposal-service"
import type { ProposalEditorData } from "@/services/proposal-service"
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
    initialMode?: ProposalMode
    initialProposal?: ProposalEditorData | null
    intent?: "create" | "edit"
}

type ProposalMode = "simple" | "complete"

export function ProposalCalculator({
    products,
    pricingRules = [],
    initialMode = "simple",
    initialProposal = null,
    intent = "create",
}: ProposalCalculatorProps) {
    const [mode, setMode] = useState<ProposalMode>(initialMode)
    const modeLocked = intent === "edit"

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Modo do orçamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Label>Escolha o tipo de preenchimento</Label>
                    <Select value={mode} onValueChange={(value) => setMode(value as ProposalMode)} disabled={modeLocked}>
                        <SelectTrigger className="max-w-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="simple">Simples (padrão)</SelectItem>
                            <SelectItem value="complete">Completo</SelectItem>
                        </SelectContent>
                    </Select>
                    {modeLocked ? (
                        <p className="text-xs text-muted-foreground">
                            O modo segue o tipo original deste orçamento durante a edição.
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            {mode === "simple" ? (
                <ProposalCalculatorSimple
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={initialMode === "simple" ? initialProposal : null}
                    intent={intent}
                />
            ) : (
                <ProposalCalculatorComplete
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={initialMode === "complete" ? initialProposal : null}
                    intent={intent}
                />
            )}
        </div>
    )
}
