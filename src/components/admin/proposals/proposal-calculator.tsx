"use client"

import { useEffect, useMemo, useState } from "react"
import type { Product } from "@/services/product-service"
import type { PricingRule } from "@/services/proposal-service"
import type { ProposalEditorData } from "@/services/proposal-service"
import type { ProposalSellerOption } from "@/services/proposal-service"
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

export type ProposalMergeCandidate = {
    id: string
    status: string | null
    source_mode: "simple" | "complete" | "legacy"
    total_value: number
    total_power: number
    module_count: number
    material_total: number
    updated_at: string | null
}

export type ProposalClientPrefill = {
    name?: string | null
    whatsapp?: string | null
}

interface ProposalCalculatorProps {
    products: Product[]
    pricingRules?: PricingRule[]
    initialMode?: ProposalMode
    initialProposal?: ProposalEditorData | null
    intent?: "create" | "edit"
    upgradeFromSimple?: boolean
    sellerOptions?: ProposalSellerOption[]
    canAssignSeller?: boolean
    currentUserId?: string | null
    mergeCandidates?: ProposalMergeCandidate[]
    initialClientPrefill?: ProposalClientPrefill | null
}

type ProposalMode = "simple" | "complete"

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function parseMergedProposalId(calculation: ProposalEditorData["calculation"] | null | undefined) {
    if (!calculation || typeof calculation !== "object" || Array.isArray(calculation)) return null

    const asRecord = calculation as Record<string, unknown>
    const bundle = asRecord.bundle
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) return null

    const secondaryIds = (bundle as Record<string, unknown>).secondary_proposal_ids
    if (!Array.isArray(secondaryIds)) return null

    const firstId = secondaryIds.find((value) => typeof value === "string" && value.trim().length > 0)
    return typeof firstId === "string" ? firstId.trim() : null
}

function getSourceModeLabel(mode: "simple" | "complete" | "legacy") {
    if (mode === "simple") return "Simples"
    if (mode === "complete") return "Completo"
    return "Legado"
}

export function ProposalCalculator({
    products,
    pricingRules = [],
    initialMode = "simple",
    initialProposal = null,
    intent = "create",
    upgradeFromSimple = false,
    sellerOptions = [],
    canAssignSeller = false,
    currentUserId = null,
    mergeCandidates = [],
    initialClientPrefill = null,
}: ProposalCalculatorProps) {
    const [mode, setMode] = useState<ProposalMode>(initialMode)
    const initialMergedProposalId = useMemo(
        () => parseMergedProposalId(initialProposal?.calculation),
        [initialProposal?.calculation]
    )
    const initialMergedProposalIdSafe = useMemo(() => {
        if (!initialMergedProposalId) return ""
        return mergeCandidates.some((candidate) => candidate.id === initialMergedProposalId)
            ? initialMergedProposalId
            : ""
    }, [initialMergedProposalId, mergeCandidates])
    const [mergedProposalId, setMergedProposalId] = useState(initialMergedProposalIdSafe)
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
    const selectedMergedProposal = useMemo(
        () => mergeCandidates.find((candidate) => candidate.id === mergedProposalId) ?? null,
        [mergeCandidates, mergedProposalId]
    )

    useEffect(() => {
        setMergedProposalId(initialMergedProposalIdSafe)
    }, [initialMergedProposalIdSafe])

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

            {intent === "edit" && Boolean(initialProposal?.client_id) ? (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Unificar pagamento (mesmo cliente)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Label>Orçamento 02 (adicional)</Label>
                        <Select
                            value={mergedProposalId || "none"}
                            onValueChange={(value) => setMergedProposalId(value === "none" ? "" : value)}
                        >
                            <SelectTrigger className="max-w-xl">
                                <SelectValue placeholder="Selecione um orçamento para unificar" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Não unificar</SelectItem>
                                {mergeCandidates.map((candidate) => (
                                    <SelectItem key={candidate.id} value={candidate.id}>
                                        {`#${candidate.id.slice(0, 8)} • ${getSourceModeLabel(candidate.source_mode)} • ${formatCurrency(candidate.total_value)}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {mergeCandidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Este cliente não possui outro orçamento disponível para união.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Somente orçamentos do mesmo cliente aparecem aqui. O Orçamento 01 é o que você está editando agora.
                            </p>
                        )}
                        {selectedMergedProposal ? (
                            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                                <p className="font-medium">
                                    Orçamento 02 selecionado: #{selectedMergedProposal.id.slice(0, 8)}
                                </p>
                                <p className="text-muted-foreground">
                                    Módulos: {selectedMergedProposal.module_count.toLocaleString("pt-BR")} •
                                    Potência: {selectedMergedProposal.total_power.toFixed(2)} kWp •
                                    Material: {formatCurrency(selectedMergedProposal.material_total)} •
                                    Total: {formatCurrency(selectedMergedProposal.total_value)}
                                </p>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {mode === "simple" ? (
                <ProposalCalculatorSimple
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={simpleInitialProposal}
                    intent={intent}
                    sellerOptions={sellerOptions}
                    canAssignSeller={canAssignSeller}
                    currentUserId={currentUserId}
                    mergedProposal={selectedMergedProposal}
                    initialClientPrefill={initialClientPrefill}
                />
            ) : (
                <ProposalCalculatorComplete
                    products={products}
                    pricingRules={pricingRules}
                    initialProposal={completeInitialProposal}
                    intent={intent}
                    sellerOptions={sellerOptions}
                    canAssignSeller={canAssignSeller}
                    currentUserId={currentUserId}
                    mergedProposal={selectedMergedProposal}
                    initialClientPrefill={initialClientPrefill}
                />
            )}
        </div>
    )
}
