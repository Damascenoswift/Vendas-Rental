import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { UcsListClient } from "@/components/energy/ucs-list-client"

export const dynamic = "force-dynamic"

export default async function UcsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: ucs, error } = await supabase
        .from("energia_ucs")
        .select(`
            id,
            codigo_uc_fatura,
            codigo_instalacao,
            tipo_uc,
            atendido_via_consorcio,
            transferida_para_consorcio,
            ativo,
            created_at,
            cliente:indicacoes(nome, email)
        `)
        .order("created_at", { ascending: false })

    if (error) {
        return (
            <div className="p-8 text-destructive">
                <h3 className="font-bold">Erro ao carregar UCs</h3>
                <p>{error.message}</p>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            <UcsListClient initialUcs={(ucs as any[]) || []} />
        </div>
    )
}
