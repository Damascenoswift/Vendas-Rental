import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { FaturaForm } from "@/components/forms/fatura-form"

export const dynamic = "force-dynamic"

export default async function NovaFaturaPage() {
    const supabase = await createClient()

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    // Fetch Usinas
    const { data: usinas } = await supabase
        .from("usinas")
        .select("id, nome")
        .eq("status", "ATIVA")
        .order("nome")

    // Fetch Approved Clients
    const { data: clientes } = await supabase
        .from("indicacoes")
        .select("id, nome")
        .in("status", ["APROVADA", "CONCLUIDA"])
        .order("nome")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Nova Fatura</h1>
                <p className="text-muted-foreground">Registre faturamento e compensação de energia para um cliente.</p>
            </div>

            <FaturaForm
                usinas={usinas || []}
                clientes={clientes || []}
            />
        </div>
    )
}
