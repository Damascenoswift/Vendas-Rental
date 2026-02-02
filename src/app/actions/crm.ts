"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"
import { getProfile } from "@/lib/auth"
import { getRentalDefaultStageName } from "@/services/crm-card-service"

export async function updateCrmCardStage(cardId: string, newStageId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const { data: card, error: fetchError } = await supabase
        .from("crm_cards")
        .select("id, stage_id")
        .eq("id", cardId)
        .single()

    if (fetchError || !card) {
        return { error: fetchError?.message ?? "Card não encontrado" }
    }

    if (card.stage_id === newStageId) {
        return { success: true }
    }

    const { error: updateError } = await supabase
        .from("crm_cards")
        .update({
            stage_id: newStageId,
            stage_entered_at: new Date().toISOString(),
        })
        .eq("id", cardId)

    if (updateError) {
        return { error: updateError.message }
    }

    const { error: historyError } = await supabase
        .from("crm_stage_history")
        .insert({
            card_id: cardId,
            from_stage_id: card.stage_id,
            to_stage_id: newStageId,
            changed_by: user.id,
        })

    if (historyError) {
        return { error: historyError.message }
    }

    revalidatePath("/admin/crm")
    revalidatePath("/admin/crm/rental")
    return { success: true }
}

const crmAllowedRoles = [
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
] as const

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}

export async function syncCrmCardsFromIndicacoes(params: { brand: "dorata" | "rental" }) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Acesso negado" }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const brand = params?.brand === "rental" ? "rental" : "dorata"
    const crmPath = brand === "rental" ? "/admin/crm/rental" : "/admin/crm"

    const { data: pipeline, error: pipelineError } = await supabaseAdmin
        .from("crm_pipelines")
        .select("id")
        .eq("brand", brand)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()

    if (pipelineError || !pipeline) {
        return { error: pipelineError?.message ?? `Pipeline ${brand} nao encontrado` }
    }

    const { data: stages, error: stagesError } = await supabaseAdmin
        .from("crm_stages")
        .select("id, name, sort_order")
        .eq("pipeline_id", pipeline.id)
        .order("sort_order", { ascending: true })

    if (stagesError || !stages || stages.length === 0) {
        return { error: stagesError?.message ?? "Etapas do pipeline não encontradas" }
    }

    const initialStageId = stages[0].id
    const stageByName = new Map(stages.map((stage) => [stage.name, stage.id]))
    const rentalStageName = brand === "rental" ? getRentalDefaultStageName() : null
    const rentalStageId = rentalStageName ? stageByName.get(rentalStageName) ?? null : null

    if (brand === "rental" && !rentalStageId) {
        return { error: `Etapa nao encontrada: ${rentalStageName}` }
    }

    const { data: existingCards, error: existingError } = await supabaseAdmin
        .from("crm_cards")
        .select("indicacao_id")
        .eq("pipeline_id", pipeline.id)

    if (existingError) {
        return { error: existingError.message }
    }

    const existingIds = new Set((existingCards ?? []).map((card) => card.indicacao_id))

    const { data: indicacoes, error: indicacoesError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, nome, user_id")
        .eq("marca", brand)

    if (indicacoesError) {
        return { error: indicacoesError.message }
    }

    const newCards = (indicacoes ?? [])
        .filter((indicacao) => !existingIds.has(indicacao.id))
        .map((indicacao) => {
            if (brand === "rental") {
                return {
                    pipeline_id: pipeline.id,
                    stage_id: rentalStageId as string,
                    indicacao_id: indicacao.id,
                    title: indicacao.nome ?? null,
                    created_by: user.id,
                    assignee_id: indicacao.user_id ?? null,
                }
            }

            return {
                pipeline_id: pipeline.id,
                stage_id: initialStageId,
                indicacao_id: indicacao.id,
                title: indicacao.nome ?? null,
                created_by: user.id,
                assignee_id: indicacao.user_id ?? null,
            }
        })
        .filter((card): card is NonNullable<typeof card> => Boolean(card))

    if (newCards.length === 0) {
        return { success: true, created: 0, skipped: indicacoes?.length ?? 0 }
    }

    const chunks = chunkArray(newCards, 500)
    for (const chunk of chunks) {
        const { error: insertError } = await supabaseAdmin.from("crm_cards").insert(chunk)
        if (insertError) {
            return { error: insertError.message }
        }
    }

    revalidatePath(crmPath)
    return {
        success: true,
        created: newCards.length,
        skipped: (indicacoes?.length ?? 0) - newCards.length,
    }
}
