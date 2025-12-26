import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AlocacaoForm } from "@/components/forms/alocacao-form"

export const dynamic = "force-dynamic"

export default async function NovaAlocacaoPage() {
    const supabase = await createClient()

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Fetch Usinas (Only Active)
    const { data: usinas } = await supabase
        .from("usinas")
        .select("id, nome")
        .eq("status", "ATIVA")
        .order("nome")

    // Fetch Clients (Concluded or Approved)
    const { data: clientes } = await supabase
        .from("indicacoes")
        .select("id, nome")
        .in("status", ["APROVADA", "CONCLUIDA"])
        .order("nome")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Nova Alocação</h1>
                <p className="text-muted-foreground">Vincule um cliente a uma usina de geração.</p>
            </div>

            <AlocacaoForm
                usinas={usinas || []}
                clientes={clientes || []}
            />
        </div>
    )
}
