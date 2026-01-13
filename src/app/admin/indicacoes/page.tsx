import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { AdminIndicacoesClient } from "@/components/admin/admin-indicacoes-client"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"

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

    const allowedRoles = ['adm_mestre', 'adm_dorata', 'supervisor', 'funcionario_n1']
    if (!role || !allowedRoles.includes(role)) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Você não tem permissão para acessar esta página.</p>
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
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Gerenciar Indicações</h1>
                    <p className="text-muted-foreground">
                        Visualize e atualize o status de todas as indicações.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/admin/indicacoes/novo">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Indicação
                    </Link>
                </Button>
            </div>

            <AdminIndicacoesClient initialIndicacoes={indicacoes || []} role={role} />
        </div>
    )
}
