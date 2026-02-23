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
    upgradeFromSimple?: boolean
}

type ProposalMode = "simple" | "complete"

export function ProposalCalculator({
    products,
    pricingRules = [],
    initialMode = "simple",
    initialProposal = null,
    intent = "create",
    upgradeFromSimple = false,
}: ProposalCalculatorProps) {
    const [mode, setMode] = useState<ProposalMode>(initialMode)
    const modeLocked = intent === "edit"
    const simpleInitialProposal =
        intent === "edit"
            ? mode === "simple"
                ? initialProposal
                : null
            : initialMode === "simple"
                ? initialProposal
                : null
    const completeInitialProposal =
        intent === "edit"
            ? mode === "complete"
                ? initialProposal
                : null
            : initialMode === "complete"
                ? initialProposal
                : null

    return (
        <div className="space-y-6">
            {upgradeFromSimple ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Você está evoluindo este orçamento de simples para completo.
                </div>
            ) : null}

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
                            O modo fica bloqueado durante a edição para evitar alterações acidentais.
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            {mode === "simple" ? (
                <ProposalCalculatorSimple
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={simpleInitialProposal}
                    intent={intent}
                />
            ) : (
                <ProposalCalculatorComplete
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={completeInitialProposal}
                    intent={intent}
                />
            )}
        </div>
    )
}
