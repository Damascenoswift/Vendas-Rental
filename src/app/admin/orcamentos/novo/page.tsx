
import { getProducts } from "@/services/product-service"
import { getPricingRules, getProposalEditorData } from "@/services/proposal-service"
import { ProposalCalculator } from "@/components/admin/proposals/proposal-calculator"

export const dynamic = "force-dynamic"

interface NewProposalPageProps {
    searchParams: Promise<{
        duplicar?: string
    }>
}

export default async function NewProposalPage({ searchParams }: NewProposalPageProps) {
    const { duplicar } = await searchParams
    const duplicateId = duplicar?.trim() || null

    let products: Awaited<ReturnType<typeof getProducts>> = []
    let pricingRules: Awaited<ReturnType<typeof getPricingRules>> = []
    let duplicateProposal: Awaited<ReturnType<typeof getProposalEditorData>> = null
    let loadError: string | null = null

    try {
        products = await getProducts({ active: true })
    } catch (error) {
        console.error("Erro ao carregar produtos:", error)
        loadError = "Não foi possível carregar os produtos do estoque."
    }

    try {
        pricingRules = await getPricingRules()
    } catch (error) {
        console.error("Erro ao carregar regras de preço:", error)
    }

    if (duplicateId) {
        try {
            duplicateProposal = await getProposalEditorData(duplicateId)
        } catch (error) {
            console.error("Erro ao carregar orçamento para duplicação:", error)
        }
    }

    if (loadError) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Novo Orçamento</h2>
                </div>
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    <p className="font-semibold">{loadError}</p>
                    <p className="mt-2 text-xs text-destructive/80">
                        Verifique se as migrações do estoque foram aplicadas no Supabase
                        (ex.: <code>030_create_inventory_and_proposals.sql</code> e{" "}
                        <code>033_add_inventory_stock.sql</code>).
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {duplicateProposal ? "Duplicar Orçamento" : "Novo Orçamento"}
                </h2>
            </div>

            <ProposalCalculator
                products={products}
                pricingRules={pricingRules}
                initialProposal={duplicateProposal}
                initialMode={duplicateProposal?.source_mode === "complete" ? "complete" : "simple"}
                intent="create"
            />
        </div>
    )
}
