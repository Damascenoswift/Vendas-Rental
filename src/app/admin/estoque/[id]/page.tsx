
import { getProduct, getStockMovements, getWorkSalesForProduct } from "@/services/product-service"
import { ProductForm } from "@/components/admin/inventory/product-form"
import { StockMovements } from "@/components/admin/inventory/stock-movements"
import { notFound } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface EditProductPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function EditProductPage({ params }: EditProductPageProps) {
    // Next 15 requires awaiting params
    const { id } = await params

    const [product, movements, workSales] = await Promise.all([
        getProduct(id),
        getStockMovements(id),
        getWorkSalesForProduct(id),
    ])

    if (!product) {
        notFound()
    }

    const manualTotals = movements.reduce(
        (acc, movement) => {
            const quantity = Number(movement.quantity || 0)
            if (!Number.isFinite(quantity) || quantity <= 0) return acc
            if (movement.type === "IN") acc.in += quantity
            if (movement.type === "OUT") acc.out += quantity
            if (movement.type === "RESERVE") acc.reserve += quantity
            if (movement.type === "RELEASE") acc.release += quantity
            return acc
        },
        { in: 0, out: 0, reserve: 0, release: 0 },
    )

    const soldFromWorks = workSales.reduce((acc, sale) => acc + sale.quantity, 0)
    const stockTotal = Number(product.stock_total || 0)
    const stockReserved = Number(product.stock_reserved || 0)
    const stockAvailable = stockTotal - stockReserved
    const projectedAvailable = stockAvailable - soldFromWorks

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Gerenciar Produto</h2>
            </div>

            <Tabs defaultValue="details" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="stock">Movimentações de Estoque</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                    <div className="flex-col space-y-8 md:flex">
                        <ProductForm initialData={product} />
                    </div>
                </TabsContent>

                <TabsContent value="stock">
                    <div className="bg-white p-6 rounded-md border shadow-sm">
                        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Estoque Total</div>
                                <div className="text-2xl font-bold">{stockTotal.toLocaleString("pt-BR")}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Reservado</div>
                                <div className="text-2xl font-bold text-orange-600">{stockReserved.toLocaleString("pt-BR")}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Disponível</div>
                                <div className="text-2xl font-bold text-green-600">
                                    {stockAvailable.toLocaleString("pt-BR")}
                                </div>
                                <div className="text-xs text-blue-700 mt-1">
                                    Após obras: {projectedAvailable.toLocaleString("pt-BR")}
                                </div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Entradas (manual)</div>
                                <div className="text-2xl font-bold text-emerald-700">
                                    {manualTotals.in.toLocaleString("pt-BR")}
                                </div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Saídas (manual)</div>
                                <div className="text-2xl font-bold text-rose-700">
                                    {manualTotals.out.toLocaleString("pt-BR")}
                                </div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Vendido em obras</div>
                                <div className="text-2xl font-bold text-blue-700">
                                    {soldFromWorks.toLocaleString("pt-BR")}
                                </div>
                            </div>
                        </div>

                        <StockMovements productId={id} movements={movements} workSales={workSales} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
