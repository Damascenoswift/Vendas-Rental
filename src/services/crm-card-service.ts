import { revalidatePath } from "next/cache"
import { createSupabaseServiceClient } from "@/lib/supabase-server"

export type CrmBrand = "dorata" | "rental"

type EnsureCrmCardParams = {
    brand: CrmBrand
    indicacaoId: string
    title: string | null
    assigneeId: string | null
    createdBy: string
    status?: string | null
}

export function getRentalDefaultStageName() {
    return "Formulario Enviado"
}

export async function ensureCrmCardForIndication(params: EnsureCrmCardParams) {
    const { brand, indicacaoId, title, assigneeId, createdBy } = params
    const supabaseAdmin = createSupabaseServiceClient()
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
        return { error: stagesError?.message ?? "Etapas do pipeline nao encontradas" }
    }

    const stageByName = new Map(stages.map((stage) => [stage.name, stage.id]))
    const initialStageId = stages[0].id

    let targetStageId = initialStageId

    if (brand === "rental") {
        const stageName = getRentalDefaultStageName()
        targetStageId = stageByName.get(stageName) ?? ""
        if (!targetStageId) {
            return { error: `Etapa nao encontrada: ${stageName}` }
        }
    }

    const { data: existingCard, error: existingError } = await supabaseAdmin
        .from("crm_cards")
        .select("id, stage_id")
        .eq("pipeline_id", pipeline.id)
        .eq("indicacao_id", indicacaoId)
        .limit(1)
        .maybeSingle()

    if (existingError) {
        return { error: existingError.message }
    }

    if (existingCard) {
        return { success: true, skipped: true }
    }

    const { data: card, error: insertError } = await supabaseAdmin
        .from("crm_cards")
        .insert({
            pipeline_id: pipeline.id,
            stage_id: targetStageId,
            indicacao_id: indicacaoId,
            title,
            created_by: createdBy,
            assignee_id: assigneeId,
        })
        .select("id")
        .single()

    if (insertError) {
        return { error: insertError.message }
    }

    const { error: historyError } = await supabaseAdmin
        .from("crm_stage_history")
        .insert({
            card_id: card.id,
            from_stage_id: null,
            to_stage_id: targetStageId,
            changed_by: createdBy,
        })

    if (historyError) {
        return { error: historyError.message }
    }

    revalidatePath(crmPath)
    return { success: true, created: true }
}
