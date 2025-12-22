import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { AdminOrcamentosClient } from "@/components/admin/admin-orcamentos-client"

export const dynamic = "force-dynamic"

export default async function AdminOrcamentosPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (role !== "adm_mestre") {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Apenas Administradores Mestre podem acessar esta página.</p>
                </div>
            </div>
        )
    }

    // Use Service Role to bypass potential RLS issues or just Ensure Admins can see
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: orcamentos, error } = await supabaseAdmin
        .from("orcamentos")
        .select("*, users(email, name)")
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar orçamentos:", error)
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar orçamentos</h3>
                    <p className="text-sm">{error.message}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Orçamentos Solicitados</h1>
                <p className="text-muted-foreground">
                    Visualize os orçamentos solicitados pelos vendedores.
                </p>
            </div>

            <AdminOrcamentosClient initialOrcamentos={orcamentos || []} />
        </div>
    )
}
