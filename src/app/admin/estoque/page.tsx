import { Suspense } from "react"
import { getProducts } from "@/services/product-service"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { ProductList } from "@/components/admin/inventory/product-list"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Package, AlertTriangle, DollarSign } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function InventoryPage() {
    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Estoque Dorata</h2>
                    <p className="text-muted-foreground">
                        Gerencie os produtos, módulos e inversores disponíveis para venda.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Link href="/admin/estoque/novo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo Produto
                        </Button>
                    </Link>
                </div>
            </div>

            <Suspense fallback={<InventorySkeleton />}>
                <InventoryContent />
            </Suspense>
        </div>
    )
}

async function InventoryContent() {
    let products: Awaited<ReturnType<typeof getProducts>> = []
    let loadError: string | null = null

    try {
        products = await getProducts()
    } catch (error) {
        console.error("Erro ao carregar produtos:", error)
        loadError = "Não foi possível carregar os produtos do estoque."
    }

    if (loadError) {
        return (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-semibold">{loadError}</p>
                <p className="mt-2 text-xs text-destructive/80">
                    Verifique se as migrações do estoque foram aplicadas no Supabase
                    (ex.: <code>030_create_inventory_and_proposals.sql</code> e{" "}
                    <code>033_add_inventory_stock.sql</code>).
                </p>
            </div>
        )
    }

    // Key Metrics Calculation
    const totalItems = products.length
    const lowStockCount = products.filter(p => ((p.stock_total || 0) - (p.stock_reserved || 0)) < (p.min_stock ?? 5) && p.active).length
    const totalValue = products.reduce((acc, p) => acc + (p.price * (p.stock_total || 0)), 0)

    function formatVal(val: number) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    }

    return (
        <div className="space-y-6">
            {/* Dashboard Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Valor Total
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatVal(totalValue)}</div>
                        <p className="text-xs text-muted-foreground">
                            Em estoque físico
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Produtos
                        </CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalItems}</div>
                        <p className="text-xs text-muted-foreground">
                            Cadastrados
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Baixo Estoque
                        </CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{lowStockCount}</div>
                        <p className="text-xs text-muted-foreground">
                            Abaixo do mínimo
                        </p>
                    </CardContent>
                </Card>
            </div>

            <ProductList initialProducts={products} />
        </div>
    )
}

function InventorySkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-[250px]" />
                <Skeleton className="h-10 w-[100px]" />
            </div>
            <div className="rounded-md border">
                <div className="h-[400px] p-4">
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}
