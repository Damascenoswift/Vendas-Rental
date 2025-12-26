import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ProducaoForm } from "@/components/forms/producao-form"

export const dynamic = "force-dynamic"

export default async function NovaProducaoPage() {
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

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Registrar Produção</h1>
                <p className="text-muted-foreground">Informe a geração mensal da usina.</p>
            </div>

            <ProducaoForm
                usinas={usinas || []}
            />
        </div>
    )
}
