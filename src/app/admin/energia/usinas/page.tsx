import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { UsinasListClient } from "@/components/energy/usinas-list-client"

export const dynamic = "force-dynamic"

export default async function UsinasPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Role check is handled by middleware usually, or RLS policies will return empty if not allowed.
    // However, explicit check is good UX.
    // Assuming DashboardLayout checks (or user is redirected here from valid link).

    // RLS policies "Admins/Support Full manage usinas" etc will ensure proper data access.
    const { data: usinas, error } = await supabase
        .from("usinas")
        .select("*")
        .order("nome")

    if (error) {
        console.error("Erro ao buscar usinas:", error)
        return (
            <div className="p-8 text-destructive">
                <h3 className="font-bold">Erro ao carregar usinas</h3>
                <p>{error.message}</p>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto py-6">
            <UsinasListClient initialUsinas={usinas || []} />
        </div>
    )
}
