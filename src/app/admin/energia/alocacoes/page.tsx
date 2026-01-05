import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AlocacoesListClient } from "@/components/energy/alocacoes-list-client"

export const dynamic = "force-dynamic"

export default async function AlocacoesPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const { data: alocacoes, error } = await supabase
        .from("alocacoes_clientes")
        .select(`
            id,
            percentual_alocado,
            quantidade_kwh_alocado,
            data_inicio,
            status,
            created_at,
            usina:usinas(nome),
            cliente:indicacoes(nome),

        `)
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar alocações:", error)
        return (
            <div className="p-8 text-destructive">
                <h3 className="font-bold">Erro ao carregar alocações</h3>
                <p>{error.message}</p>
            </div>
        )
    }

    // Cast response to expected type manually if needed, or rely on inference if types are perfect.
    // The query returns { usina: { nome: ... } | null, ... } which matches the props.
    // However, supabase-js types can be tricky with joins.
    const typedAlocacoes = alocacoes as any[]

    return (
        <div className="max-w-5xl mx-auto py-6">
            <AlocacoesListClient initialAlocacoes={typedAlocacoes || []} />
        </div>
    )
}
