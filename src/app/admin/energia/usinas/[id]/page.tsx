import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { UsinaForm } from "@/components/forms/usina-form"

export const dynamic = "force-dynamic"

export default async function EditarUsinaPage({ params }: { params: { id: string } }) {
    const supabase = await createClient()

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Fetch Usina
    const { data: usina, error } = await supabase
        .from("usinas")
        .select("*")
        .eq("id", params.id)
        .single()

    if (error || !usina) {
        notFound()
    }

    // Fetch Investors
    const { data: investors } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "investidor")
        .order("name")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Editar Usina</h1>
                <p className="text-muted-foreground">Gerencie as informações da usina.</p>
            </div>

            <UsinaForm
                investors={investors || []}
                initialData={usina}
            />
        </div>
    )
}
