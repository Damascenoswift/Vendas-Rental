
import { getProducts } from "@/services/product-service"
import { ProposalCalculator } from "@/components/admin/proposals/proposal-calculator"

export default async function NewProposalPage() {
    const products = await getProducts({ active: true })

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Novo Orçamento</h2>
            </div>

            <ProposalCalculator products={products} />
        </div>
    )
}
