import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { CrmBoard } from "@/components/admin/crm/crm-board"
import { CrmToolbar } from "@/components/admin/crm/crm-toolbar"

export const dynamic = "force-dynamic"

export default async function AdminCrmPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    const allowedRoles = [
        "adm_mestre",
        "adm_dorata",
        "supervisor",
        "suporte",
        "suporte_tecnico",
        "suporte_limitado",
        "funcionario_n1",
        "funcionario_n2",
    ]

    if (!role || !allowedRoles.includes(role)) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Voce nao tem permissao para acessar esta pagina.</p>
                </div>
            </div>
        )
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: pipeline, error: pipelineError } = await supabaseAdmin
        .from("crm_pipelines")
        .select("id, name, description, brand")
        .eq("brand", "dorata")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()

    if (pipelineError) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar pipeline</h3>
                    <p className="text-sm">{pipelineError.message}</p>
                </div>
            </div>
        )
    }

    if (!pipeline) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-yellow-50 p-4 text-yellow-900">
                    <h3 className="font-bold">Pipeline nao encontrado</h3>
                    <p className="text-sm">Crie o funil Dorata no Supabase e tente novamente.</p>
                </div>
            </div>
        )
    }

    const { data: stages, error: stagesError } = await supabaseAdmin
        .from("crm_stages")
        .select("id, name, sort_order, is_closed")
        .eq("pipeline_id", pipeline.id)
        .order("sort_order", { ascending: true })

    if (stagesError) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar etapas</h3>
                    <p className="text-sm">{stagesError.message}</p>
                </div>
            </div>
        )
    }

    let cards: any[] = []
    const { data: cardsData, error: cardsError } = await supabaseAdmin
        .from("crm_cards")
        .select(`
            id,
            stage_id,
            indicacao_id,
            title,
            created_at,
            indicacoes (
                id,
                tipo,
                nome,
                email,
                telefone,
                status,
                documento,
                unidade_consumidora,
                codigo_cliente,
                codigo_instalacao,
                valor,
                marca,
                user_id
            )
        `)
        .eq("pipeline_id", pipeline.id)
        .order("created_at", { ascending: false })

    if (cardsError) {
        const { data: fallbackCards, error: fallbackError } = await supabaseAdmin
            .from("crm_cards")
            .select("id, stage_id, indicacao_id, title, created_at")
            .eq("pipeline_id", pipeline.id)
            .order("created_at", { ascending: false })

        if (fallbackError) {
            return (
                <div className="container mx-auto py-10">
                    <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                        <h3 className="font-bold">Erro ao carregar cards</h3>
                        <p className="text-sm">{fallbackError.message}</p>
                    </div>
                </div>
            )
        }
        cards = fallbackCards ?? []
    } else {
        cards = cardsData ?? []
    }

    return (
        <div className="container mx-auto py-6">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">CRM Dorata</h1>
                    <p className="text-muted-foreground">
                        {pipeline.name} {pipeline.description ? `- ${pipeline.description}` : ""}
                    </p>
                </div>
                <CrmToolbar brand="dorata" />
            </div>

            <CrmBoard stages={stages ?? []} cards={cards} />
        </div>
    )
}
