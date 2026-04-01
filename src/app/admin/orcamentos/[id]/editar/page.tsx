import { notFound } from "next/navigation"
import { getProducts } from "@/services/product-service"
import { getPricingRules, getProposalEditorData, getProposalSellerAssignmentContext } from "@/services/proposal-service"
import { ProposalCalculator } from "@/components/admin/proposals/proposal-calculator"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getSalesAnalystConversation, getNegotiationRecord } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { getProposalPriceApproval } from "@/app/actions/price-approval"
import { ProposalAnalystPanel } from "@/components/admin/proposals/proposal-analyst-panel"

export const dynamic = "force-dynamic"

interface EditProposalPageProps {
    params: Promise<{
        id: string
    }>
    searchParams: Promise<{
        upgrade?: string
    }>
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null
    return { column: match[1], table: match[2] }
}

function normalizeSourceMode(value: unknown): "simple" | "complete" | "legacy" {
    if (value === "simple" || value === "complete" || value === "legacy") return value
    return "legacy"
}

function asRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function toFiniteNumber(value: unknown) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function extractModuleCount(calculation: unknown) {
    const calc = asRecord(calculation)
    const input = asRecord(calc?.input)
    const dimensioning = asRecord(input?.dimensioning)
    return Math.max(toFiniteNumber(dimensioning?.qtd_modulos), 0)
}

function extractMaterialTotal(calculation: unknown) {
    const calc = asRecord(calculation)
    const output = asRecord(calc?.output)
    const totals = asRecord(output?.totals)
    const views = asRecord(totals?.views)
    return Math.max(toFiniteNumber(views?.view_material), 0)
}

export default async function EditProposalPage({ params, searchParams }: EditProposalPageProps) {
    const { id } = await params
    const { upgrade } = await searchParams

    const [products, pricingRules, proposal, sellerAssignment] = await Promise.all([
        getProducts(),
        getPricingRules(),
        getProposalEditorData(id),
        getProposalSellerAssignmentContext({ brand: "dorata" }),
    ])

    if (!proposal) {
        notFound()
    }

    const shouldUpgradeToComplete =
        upgrade === "complete" &&
        proposal.source_mode === "simple"

    const initialMode = shouldUpgradeToComplete
        ? "complete"
        : proposal.source_mode === "complete"
            ? "complete"
            : "simple"

    let mergeCandidates: Array<{
        id: string
        status: string | null
        source_mode: "simple" | "complete" | "legacy"
        total_value: number
        total_power: number
        module_count: number
        material_total: number
        updated_at: string | null
    }> = []

    if (proposal.client_id) {
        const supabaseAdmin = createSupabaseServiceClient()
        let includeSourceMode = true
        let orderByColumn: "updated_at" | "created_at" = "updated_at"

        while (true) {
            const columns = ["id", "status", "total_value", "total_power", "calculation", "updated_at", "created_at"]
            if (includeSourceMode) {
                columns.splice(2, 0, "source_mode")
            }

            const { data, error } = await supabaseAdmin
                .from("proposals")
                .select(columns.join(", "))
                .eq("client_id", proposal.client_id)
                .neq("id", id)
                .order(orderByColumn, { ascending: false })
                .order("created_at", { ascending: false })

            if (!error) {
                const rows = Array.isArray(data) ? (data as unknown[]) : []
                mergeCandidates = rows.map((item) => {
                    const row = item as Record<string, unknown>
                    return {
                        id: String(row.id),
                        status: typeof row.status === "string" ? row.status : null,
                        source_mode: normalizeSourceMode(row.source_mode),
                        total_value: Number(row.total_value ?? 0) || 0,
                        total_power: Number(row.total_power ?? 0) || 0,
                        module_count: extractModuleCount(row.calculation),
                        material_total: extractMaterialTotal(row.calculation),
                        updated_at:
                            (typeof row.updated_at === "string" && row.updated_at) ||
                            (typeof row.created_at === "string" && row.created_at) ||
                            null,
                    }
                })
                break
            }

            const missingColumn = parseMissingColumnError(error.message)
            if (missingColumn?.table === "proposals" && missingColumn.column === "source_mode" && includeSourceMode) {
                includeSourceMode = false
                continue
            }
            if (missingColumn?.table === "proposals" && missingColumn.column === "updated_at" && orderByColumn === "updated_at") {
                orderByColumn = "created_at"
                continue
            }

            console.error("Erro ao carregar candidatos para união de orçamento:", error)
            break
        }
    }

    // Load analyst conversation and negotiation status
    let analystMessages: Awaited<ReturnType<typeof getSalesAnalystConversation>> = []
    let negotiationStatus: NegotiationStatus = "sem_contato"

    let initialApproval: Awaited<ReturnType<typeof getProposalPriceApproval>> = null

    try {
        const [msgs, neg, approval] = await Promise.all([
            getSalesAnalystConversation(id),
            getNegotiationRecord(id),
            getProposalPriceApproval(id),
        ])
        analystMessages = msgs
        negotiationStatus = (neg?.negotiation_status ?? "sem_contato") as NegotiationStatus
        initialApproval = approval
    } catch {
        // Non-blocking — chat is additive, page still works without it
    }

    const initialAnalystMessages = analystMessages.map((m) => ({
        role: m.role as "analyst" | "user",
        content: m.content,
        status_suggestion: m.status_suggestion as NegotiationStatus | null,
        created_at: m.created_at,
    }))

    return (
        <div className="flex gap-4 h-[calc(100vh-4rem)] overflow-hidden">
            {/* Left: existing proposal calculator */}
            <div className="flex-1 overflow-y-auto">
                <div className="flex-1 space-y-4 p-8 pt-6">
                    <div className="flex items-center justify-between space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight">Editar Orçamento</h2>
                    </div>

                    <ProposalCalculator
                        products={products}
                        pricingRules={pricingRules}
                        initialProposal={proposal}
                        initialMode={initialMode}
                        intent="edit"
                        upgradeFromSimple={shouldUpgradeToComplete}
                        sellerOptions={sellerAssignment?.sellers ?? []}
                        canAssignSeller={sellerAssignment?.canAssignToOthers ?? false}
                        currentUserId={sellerAssignment?.currentUserId ?? null}
                        mergeCandidates={mergeCandidates}
                    />
                </div>
            </div>

            <ProposalAnalystPanel
                proposalId={id}
                initialMessages={initialAnalystMessages}
                initialStatus={negotiationStatus}
                initialApproval={initialApproval}
                currentMargin={proposal.profit_margin ?? null}
                currentValue={proposal.total_value ?? null}
            />
        </div>
    )
}
