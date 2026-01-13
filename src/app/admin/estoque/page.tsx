import { Suspense } from "react"
import { getProducts } from "@/services/product-service"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { ProductList } from "@/components/admin/inventory/product-list"
import { Skeleton } from "@/components/ui/skeleton"

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
    const products = await getProducts()
    return <ProductList initialProducts={products} />
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
