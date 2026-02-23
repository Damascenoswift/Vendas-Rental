import { notFound } from "next/navigation"
import { getProducts } from "@/services/product-service"
import { getPricingRules, getProposalEditorData } from "@/services/proposal-service"
import { ProposalCalculator } from "@/components/admin/proposals/proposal-calculator"

export const dynamic = "force-dynamic"

interface EditProposalPageProps {
    params: Promise<{
        id: string
    }>
    searchParams: Promise<{
        upgrade?: string
    }>
}

export default async function EditProposalPage({ params, searchParams }: EditProposalPageProps) {
    const { id } = await params
    const { upgrade } = await searchParams

    const [products, pricingRules, proposal] = await Promise.all([
        getProducts({ active: true }),
        getPricingRules(),
        getProposalEditorData(id),
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

    return (
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
            />
        </div>
    )
}
