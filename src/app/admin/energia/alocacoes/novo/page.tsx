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

    // Fetch UCs
    const { data: ucs } = await supabase
        .from("energia_ucs")
        .select(`
            id,
            codigo_uc_fatura,
            tipo_uc,
            cliente:indicacoes(nome)
        `)
        .eq("ativo", true)
        .order("codigo_uc_fatura")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Nova Alocação</h1>
                <p className="text-muted-foreground">Vincule um cliente a uma usina de geração.</p>
            </div>

            <AlocacaoForm
                usinas={usinas || []}
                ucs={(ucs as any[]) || []}
            />
        </div>
    )
}
