import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { UsinaForm } from "@/components/forms/usina-form"

export const dynamic = "force-dynamic"

export default async function NovaUsinaPage() {
    const supabase = await createClient()

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Fetch Investors
    const { data: investors } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "investidor")
        .order("name")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Nova Usina</h1>
                <p className="text-muted-foreground">Cadastre uma nova usina solar no sistema.</p>
            </div>

            <UsinaForm investors={investors || []} />
        </div>
    )
}
