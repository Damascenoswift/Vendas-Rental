import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { AdminIndicacoesClient } from "@/components/admin/admin-indicacoes-client"

export const dynamic = "force-dynamic"

export default async function AdminIndicacoesPage() {
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

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: indicacoes, error } = await supabaseAdmin
        .from("indicacoes")
        .select("*, users(email, name)")
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar indicações:", error)
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar indicações</h3>
                    <p className="text-sm">{error.message}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Gerenciar Indicações</h1>
                <p className="text-muted-foreground">
                    Visualize e atualize o status de todas as indicações.
                </p>
            </div>

            <AdminIndicacoesClient initialIndicacoes={indicacoes || []} />
        </div>
    )
}
