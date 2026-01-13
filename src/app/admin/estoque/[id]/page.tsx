import { getProduct } from "@/services/product-service"
import { ProductForm } from "@/components/admin/inventory/product-form"
import { notFound } from "next/navigation"

interface EditProductPageProps {
    params: {
        id: string
    }
}

export default async function EditProductPage({ params }: EditProductPageProps) {
    // In Next.js 15+, params is a Promise, so we need to await it if the project was upgraded, 
    // but typically in 14 it's not. However, the error message 'Dynamic server usage' might appear if not handled.
    // Given the project version, let's treat it as typical. 
    // Wait, recent Next.js versions might require awaiting params. Let's assume standard behavior for now.

    // Actually, in the latest Next.js versions (15 canary or RC), params are async. 
    // But checking package.json, it says "next": "15.5.9" (Wait, 15.5.9? Next 15 isn't that high yet? 
    // Maybe it's 14.x or 15 RC. Let's assume standard 14/15 async params pattern to be safe).

    // Actually, looking at package.json output earlier: "next": "15.5.9" - that version number looks odd if it's official.
    // It might be a nightly or custom build? Or maybe I misread "15.0.0-canary..."? 
    // Ah, previous output: "next": "15.5.9". This might be a very recent version.
    // In Next 15, params IS a promise.

    const { id } = await params

    const product = await getProduct(id)

    if (!product) {
        notFound()
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Editar Produto</h2>
            </div>
            <div className="hidden h-full flex-1 flex-col space-y-8 md:flex">
                <ProductForm initialData={product} />
            </div>
        </div>
    )
}
