
import { PricingRulesTable } from "@/components/admin/settings/pricing-rules-table"
import { getPricingRules } from "@/services/proposal-service"

export default async function PricingRulesPage() {
    const rules = await getPricingRules()

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Base de Cálculo</h2>
                <p className="text-muted-foreground">
                    Defina os valores padrão para cálculo de orçamentos.
                </p>
            </div>

            <div className="space-y-4">
                <PricingRulesTable rules={rules} />
            </div>
        </div>
    )
}
