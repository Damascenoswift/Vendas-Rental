
import { getProduct, getStockMovements } from "@/services/product-service"
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

    const [product, movements] = await Promise.all([
        getProduct(id),
        getStockMovements(id)
    ])

    if (!product) {
        notFound()
    }

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
                        <div className="mb-6 grid grid-cols-3 gap-4">
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Estoque Total</div>
                                <div className="text-2xl font-bold">{product.stock_total || 0}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Reservado</div>
                                <div className="text-2xl font-bold text-orange-600">{product.stock_reserved || 0}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-sm font-medium text-muted-foreground">Disponível</div>
                                <div className="text-2xl font-bold text-green-600">
                                    {(product.stock_total || 0) - (product.stock_reserved || 0)}
                                </div>
                            </div>
                        </div>

                        <StockMovements productId={id} movements={movements} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
