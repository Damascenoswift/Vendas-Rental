"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"
import { getProfile } from "@/lib/auth"
import { getRentalDefaultStageName } from "@/services/crm-card-service"
import { createIndicationNotificationEvent } from "@/services/notification-service"
import { createRentalTasksForIndication, createTask } from "@/services/task-service"
import { upsertWorkCardFromProposal } from "@/services/work-cards-service"

export async function activateWorkCardFromProposal(
    proposalId: string,
    options?: { executionBusinessDays?: number | null },
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Sem permissão para enviar orçamento para Obras." }
    }

    const rawBusinessDays = options?.executionBusinessDays
    const hasBusinessDaysInput = rawBusinessDays !== null && rawBusinessDays !== undefined
    const executionBusinessDays =
        typeof rawBusinessDays === "number" &&
            Number.isInteger(rawBusinessDays) &&
            rawBusinessDays > 0
            ? rawBusinessDays
            : null

    if (hasBusinessDaysInput && executionBusinessDays === null) {
        return { error: "Informe o prazo de execução em dias úteis (inteiro maior que zero)." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const result = await upsertWorkCardFromProposal({
        proposalId,
        actorId: user.id,
        allowNonAccepted: true,
        executionBusinessDays,
    })

    if (result?.error) {
        return { error: result.error }
    }

    if (result?.skipped) {
        return { error: "Orçamento não elegível para Obras (fora da marca Dorata)." }
    }

    let activationWarning: string | null =
        "warning" in result && typeof result.warning === "string" ? result.warning : null
    const appendActivationWarning = (message: string) => {
        activationWarning = activationWarning ? `${activationWarning} ${message}` : message
    }

    const { data: proposalContext, error: proposalContextError } = await supabaseAdmin
        .from("proposals")
        .select("id, client_id")
        .eq("id", proposalId)
        .maybeSingle()

    if (proposalContextError) {
        console.error("Erro ao buscar proposta para marcar fonte de contrato:", proposalContextError)
        appendActivationWarning("Obra criada, mas falhou ao marcar este orçamento para contrato.")
    } else if (proposalContext?.client_id) {
        const { error: contractSourceError } = await supabaseAdmin
            .from("indicacoes")
            .update({ contract_proposal_id: proposalId })
            .eq("id", proposalContext.client_id)

        if (contractSourceError) {
            console.error("Erro ao salvar orçamento do contrato ao enviar para Obras:", contractSourceError)
            appendActivationWarning("Obra criada, mas falhou ao marcar este orçamento para contrato.")
        }
    }

    revalidatePath("/admin/crm")
    revalidatePath("/admin/indicacoes")
    revalidatePath("/admin/obras")

    return {
        success: true,
        workId: result?.workId ?? null,
        warning: activationWarning ?? undefined,
    }
}

export async function setContractProposalForIndication(
    indicacaoId: string,
    proposalId: string | null,
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Sem permissão para selecionar orçamento de contrato." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: indicacao, error: indicacaoError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, marca")
        .eq("id", indicacaoId)
        .maybeSingle()

    if (indicacaoError || !indicacao) {
        return { error: indicacaoError?.message ?? "Indicação não encontrada." }
    }

    if (indicacao.marca !== "dorata") {
        return { error: "Ação disponível apenas para indicações Dorata." }
    }

    const normalizedProposalId = proposalId?.trim() || null
    if (!normalizedProposalId) {
        const { error: clearError } = await supabaseAdmin
            .from("indicacoes")
            .update({ contract_proposal_id: null })
            .eq("id", indicacaoId)

        if (clearError) {
            return { error: clearError.message }
        }

        revalidatePath("/admin/crm")
        revalidatePath("/admin/indicacoes")
        revalidatePath("/admin/obras")
        revalidatePath("/dashboard")

        return {
            success: true,
            contractProposalId: null as string | null,
        }
    }

    const { data: proposal, error: proposalError } = await supabaseAdmin
        .from("proposals")
        .select("id, client_id")
        .eq("id", normalizedProposalId)
        .maybeSingle()

    if (proposalError) {
        return { error: proposalError.message }
    }

    if (!proposal || proposal.client_id !== indicacaoId) {
        return { error: "Orçamento não pertence a esta indicação." }
    }

    const { error: updateError } = await supabaseAdmin
        .from("indicacoes")
        .update({ contract_proposal_id: normalizedProposalId })
        .eq("id", indicacaoId)

    if (updateError) {
        return { error: updateError.message }
    }

    revalidatePath("/admin/crm")
    revalidatePath("/admin/indicacoes")
    revalidatePath("/admin/obras")
    revalidatePath("/dashboard")

    return {
        success: true,
        contractProposalId: normalizedProposalId,
    }
}

export async function updateCrmCardStage(cardId: string, newStageId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Sem permissão para mover cards no CRM." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: card, error: fetchError } = await supabaseAdmin
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

    const { error: updateError } = await supabaseAdmin
        .from("crm_cards")
        .update({
            stage_id: newStageId,
            stage_entered_at: new Date().toISOString(),
        })
        .eq("id", cardId)

    if (updateError) {
        return { error: updateError.message }
    }

    const { error: historyError } = await supabaseAdmin
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

export async function deleteCrmCard(cardId: string, brand: "dorata" | "rental") {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Sem permissão para excluir cards no CRM." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: card, error: fetchError } = await supabaseAdmin
        .from("crm_cards")
        .select("id, pipeline:crm_pipelines(brand)")
        .eq("id", cardId)
        .maybeSingle()

    if (fetchError || !card) {
        return { error: fetchError?.message ?? "Card não encontrado" }
    }

    const pipelineBrand = (card as any)?.pipeline?.brand ?? null
    if (pipelineBrand && pipelineBrand !== brand) {
        return { error: "Card não pertence a este CRM." }
    }

    const { error: deleteError } = await supabaseAdmin
        .from("crm_cards")
        .delete()
        .eq("id", cardId)

    if (deleteError) {
        return { error: deleteError.message }
    }

    const crmPath = brand === "rental" ? "/admin/crm/rental" : "/admin/crm"
    revalidatePath(crmPath)
    return { success: true }
}

export async function markDorataContractSigned(
    indicacaoId: string,
    options?: { allowToggle?: boolean; proposalId?: string | null }
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autorizado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !crmAllowedRoles.includes(role)) {
        return { error: "Sem permissão para atualizar contrato no CRM." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: indicacao, error: indicacaoError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, nome, marca, status, valor, assinada_em, contrato_enviado_em, contract_proposal_id")
        .eq("id", indicacaoId)
        .maybeSingle()

    if (indicacaoError || !indicacao) {
        return { error: indicacaoError?.message ?? "Indicação não encontrada" }
    }

    if (indicacao.marca !== "dorata") {
        return { error: "Ação disponível apenas para indicações Dorata." }
    }

    const shouldUnsetSignature = Boolean(options?.allowToggle) && Boolean(indicacao.assinada_em)

    if (shouldUnsetSignature) {
        const toggleToken = indicacao.assinada_em ?? new Date().toISOString()
        const updates: Record<string, string | null> = {
            assinada_em: null,
        }

        if (indicacao.status === "CONCLUIDA") {
            updates.status = "AGUARDANDO_ASSINATURA"
        }

        const { error: updateError } = await supabaseAdmin
            .from("indicacoes")
            .update(updates)
            .eq("id", indicacaoId)

        if (updateError) {
            return { error: updateError.message }
        }

        if (updates.status === "AGUARDANDO_ASSINATURA") {
            const { error: statusInteractionError } = await supabaseAdmin
                .from("indicacao_interactions" as any)
                .insert({
                    indicacao_id: indicacaoId,
                    user_id: user.id,
                    type: "STATUS_CHANGE",
                    content: "Status alterado para: AGUARDANDO_ASSINATURA",
                    metadata: { new_status: "AGUARDANDO_ASSINATURA", source: "crm_dorata_contract_toggle" },
                } as any)

            if (statusInteractionError) {
                console.error("Erro ao registrar histórico de status (Dorata toggle):", statusInteractionError)
            }
        }

        const notificationMarker = `[dorata_commission_release:${indicacaoId}]`
        const { data: openCommissionTasks, error: openCommissionTasksError } = await supabaseAdmin
            .from("tasks")
            .select("id")
            .eq("indicacao_id", indicacaoId)
            .like("description", `%${notificationMarker}%`)
            .neq("status", "DONE")

        if (openCommissionTasksError) {
            console.error("Erro ao buscar tarefas financeiras para bloquear (Dorata toggle):", openCommissionTasksError)
        } else if (openCommissionTasks && openCommissionTasks.length > 0) {
            const taskIds = openCommissionTasks.map((task) => task.id)
            const { error: blockTasksError } = await supabaseAdmin
                .from("tasks")
                .update({ status: "BLOCKED" })
                .in("id", taskIds)

            if (blockTasksError) {
                console.error("Erro ao bloquear tarefas financeiras (Dorata toggle):", blockTasksError)
            }
        }

        const { error: commissionInteractionError } = await supabaseAdmin
            .from("indicacao_interactions" as any)
            .insert({
                indicacao_id: indicacaoId,
                user_id: user.id,
                type: "COMMENT",
                content: "Contrato desmarcado como assinado no CRM Dorata. Comissão voltou para aguardando assinatura.",
                metadata: {
                    source: "crm_dorata_contract_toggle",
                    commission_released: false,
                    manager_notified: false,
                    reverted: true,
                },
            } as any)

        if (commissionInteractionError) {
            console.error("Erro ao registrar interação de reversão de comissão Dorata:", commissionInteractionError)
        }

        try {
            await createIndicationNotificationEvent({
                eventKey: "INDICATION_CONTRACT_MILESTONE",
                indicacaoId,
                actorUserId: user.id,
                title: "Marco de contrato/comissão atualizado",
                message: "Contrato desmarcado como assinado no CRM Dorata.",
                dedupeToken: `crm-contract-toggle-off:${toggleToken}`,
                metadata: {
                    source: "crm_dorata_contract_toggle",
                    signed: false,
                    reverted: true,
                },
            })

            if (updates.status === "AGUARDANDO_ASSINATURA") {
                await createIndicationNotificationEvent({
                    eventKey: "INDICATION_STATUS_CHANGED",
                    indicacaoId,
                    actorUserId: user.id,
                    title: "Status da indicação alterado",
                    message: "Status atualizado para AGUARDANDO_ASSINATURA.",
                    dedupeToken: `crm-contract-toggle-status:${toggleToken}`,
                    metadata: {
                        source: "crm_dorata_contract_toggle",
                        new_status: "AGUARDANDO_ASSINATURA",
                    },
                })
            }
        } catch (notificationError) {
            console.error("Erro ao criar notificação de marco/status no toggle de contrato Dorata:", notificationError)
        }

        revalidatePath("/admin/crm")
        revalidatePath("/admin/indicacoes")
        revalidatePath("/admin/obras")
        revalidatePath("/admin/financeiro")
        revalidatePath("/admin/tarefas")
        revalidatePath("/dashboard")

        return {
            success: true,
            signed: false,
            signedAt: null,
            reverted: true,
        }
    }

    const nowIso = new Date().toISOString()
    const signedAt = indicacao.assinada_em ?? nowIso

    const updates: Record<string, string> = {}
    if (!indicacao.contrato_enviado_em) {
        updates.contrato_enviado_em = signedAt
    }
    if (!indicacao.assinada_em) {
        updates.assinada_em = signedAt
    }
    if (indicacao.status !== "CONCLUIDA") {
        updates.status = "CONCLUIDA"
    }

    if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin
            .from("indicacoes")
            .update(updates)
            .eq("id", indicacaoId)

        if (updateError) {
            return { error: updateError.message }
        }
    }

    if (updates.status === "CONCLUIDA") {
        const { error: statusInteractionError } = await supabaseAdmin
            .from("indicacao_interactions" as any)
            .insert({
                indicacao_id: indicacaoId,
                user_id: user.id,
                type: "STATUS_CHANGE",
                content: "Status alterado para: CONCLUIDA",
                metadata: { new_status: "CONCLUIDA", source: "crm_dorata_contract_signed" },
            } as any)

        if (statusInteractionError) {
            console.error("Erro ao registrar histórico de status (Dorata):", statusInteractionError)
        }
    }

    const notificationMarker = `[dorata_commission_release:${indicacaoId}]`
    let notificationCreated = false
    let notificationWarning: string | null = null

    const { data: existingNotificationTask, error: existingTaskError } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("indicacao_id", indicacaoId)
        .like("description", `%${notificationMarker}%`)
        .limit(1)

    if (existingTaskError) {
        console.error("Erro ao verificar notificação financeira existente:", existingTaskError)
        notificationWarning = "Não foi possível validar notificação anterior do gestor."
    }

    if (!existingNotificationTask || existingNotificationTask.length === 0) {
        const { data: financeUsers, error: financeUsersError } = await supabaseAdmin
            .from("users")
            .select("id, name")
            .eq("department", "financeiro")
            .order("name", { ascending: true })

        if (financeUsersError) {
            console.error("Erro ao buscar usuários financeiros para notificação:", financeUsersError)
            notificationWarning = "Falha ao buscar gestor de comissões para notificação."
        }

        const assigneeId = financeUsers?.[0]?.id ?? undefined
        const observerIds = (financeUsers ?? [])
            .map((financeUser) => financeUser.id)
            .filter((id) => id && id !== assigneeId)

        const notificationTaskResult = await createTask({
            title: `Comissao Dorata liberada - ${indicacao.nome ?? indicacaoId.slice(0, 8)}`,
            description: [
                "Contrato marcado como assinado no CRM Dorata.",
                `Indicacao: ${indicacao.nome ?? "Sem nome"} (${indicacaoId})`,
                `Valor informado: ${typeof indicacao.valor === "number" ? indicacao.valor : "nao informado"}`,
                "Acao: validar e processar a comissao Dorata no financeiro.",
                notificationMarker,
            ].join("\n"),
            priority: "HIGH",
            status: "TODO",
            department: "financeiro",
            brand: "dorata",
            visibility_scope: assigneeId ? "RESTRICTED" : "TEAM",
            assignee_id: assigneeId,
            indicacao_id: indicacaoId,
            client_name: indicacao.nome ?? undefined,
            observer_ids: observerIds,
        })

        if (notificationTaskResult?.error) {
            console.error("Erro ao criar notificação de comissão Dorata:", notificationTaskResult.error)
            notificationWarning = "Contrato assinado, mas falhou ao criar tarefa para o gestor de comissões."
        } else {
            notificationCreated = true
        }
    }

    const { error: commissionInteractionError } = await supabaseAdmin
        .from("indicacao_interactions" as any)
        .insert({
            indicacao_id: indicacaoId,
            user_id: user.id,
            type: "COMMENT",
            content: notificationCreated
                ? "Contrato assinado no CRM Dorata. Comissão liberada e gestor financeiro notificado."
                : "Contrato assinado no CRM Dorata. Comissão liberada para conferência financeira.",
            metadata: {
                source: "crm_dorata_contract_signed",
                commission_released: true,
                manager_notified: notificationCreated,
            },
        } as any)

    if (commissionInteractionError) {
        console.error("Erro ao registrar interação de comissão Dorata:", commissionInteractionError)
    }

    try {
        await createIndicationNotificationEvent({
            eventKey: "INDICATION_CONTRACT_MILESTONE",
            indicacaoId,
            actorUserId: user.id,
            title: "Marco de contrato/comissão atualizado",
            message: notificationCreated
                ? "Contrato assinado no CRM Dorata. Comissão liberada e gestor financeiro notificado."
                : "Contrato assinado no CRM Dorata. Comissão liberada para conferência financeira.",
            dedupeToken: `crm-contract-signed:${signedAt}`,
            metadata: {
                source: "crm_dorata_contract_signed",
                signed: true,
                signed_at: signedAt,
                manager_notified: notificationCreated,
            },
        })

        if (updates.status === "CONCLUIDA") {
            await createIndicationNotificationEvent({
                eventKey: "INDICATION_STATUS_CHANGED",
                indicacaoId,
                actorUserId: user.id,
                title: "Status da indicação alterado",
                message: "Status atualizado para CONCLUIDA.",
                dedupeToken: `crm-contract-status:${signedAt}`,
                metadata: {
                    source: "crm_dorata_contract_signed",
                    new_status: "CONCLUIDA",
                },
            })
        }
    } catch (notificationError) {
        console.error("Erro ao criar notificação de marco/status ao assinar contrato Dorata:", notificationError)
    }

    const appendWarning = (message: string) => {
        notificationWarning = notificationWarning
            ? `${notificationWarning} ${message}`
            : message
    }

    let preferredProposalId: string | null =
        options?.proposalId?.trim() || indicacao.contract_proposal_id || null

    if (preferredProposalId) {
        const { data: preferredProposal, error: preferredProposalError } = await supabaseAdmin
            .from("proposals")
            .select("id, client_id")
            .eq("id", preferredProposalId)
            .maybeSingle()

        if (preferredProposalError) {
            console.error("Erro ao validar proposta preferencial para obra:", preferredProposalError)
            preferredProposalId = null
        } else if (!preferredProposal || preferredProposal.client_id !== indicacaoId) {
            preferredProposalId = null
        }
    }

    let proposalLookupFailed = false

    if (!preferredProposalId) {
        const { data: proposals, error: proposalsError } = await supabaseAdmin
            .from("proposals")
            .select("id, status, created_at")
            .eq("client_id", indicacaoId)
            .order("created_at", { ascending: false })
            .limit(50)

        if (proposalsError) {
            proposalLookupFailed = true
            console.error("Erro ao buscar propostas para criar obra no contrato assinado:", proposalsError)
            appendWarning("Contrato assinado, mas não foi possível localizar o orçamento para criar a obra.")
        } else {
            const statusPriority: Record<string, number> = {
                accepted: 0,
                sent: 1,
                draft: 2,
            }

            const sorted = (proposals ?? []).slice().sort((a, b) => {
                const rankA = statusPriority[a.status ?? ""] ?? 99
                const rankB = statusPriority[b.status ?? ""] ?? 99
                if (rankA !== rankB) return rankA - rankB
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            })

            preferredProposalId = sorted[0]?.id ?? null
        }
    }

    if (!preferredProposalId) {
        if (!proposalLookupFailed) {
            appendWarning("Contrato assinado, mas nenhuma proposta foi encontrada para vincular em Obras.")
        }
    } else {
        const workResult = await upsertWorkCardFromProposal({
            proposalId: preferredProposalId,
            actorId: user.id,
            allowNonAccepted: true,
        })

        if (workResult?.error) {
            console.error("Erro ao criar/atualizar obra ao assinar contrato no CRM Dorata:", workResult.error)
            appendWarning(`Contrato assinado, mas falhou ao criar/atualizar a obra. (${workResult.error})`)
        }
    }

    revalidatePath("/admin/crm")
    revalidatePath("/admin/indicacoes")
    revalidatePath("/admin/obras")
    revalidatePath("/admin/financeiro")
    revalidatePath("/admin/tarefas")
    revalidatePath("/dashboard")

    return {
        success: true,
        signed: true,
        signedAt,
        notificationCreated,
        warning: notificationWarning,
        reverted: false,
    }
}

const crmAllowedRoles = [
    "adm_mestre",
    "adm_dorata",
    "suporte",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
]

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
        .select("id, nome, user_id, codigo_instalacao")
        .eq("marca", brand)

    if (indicacoesError) {
        return { error: indicacoesError.message }
    }

    const newIndicacoes = (indicacoes ?? [])
        .filter((indicacao) => !existingIds.has(indicacao.id))

    const newCards = newIndicacoes
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

    let createdTasks = 0
    if (brand === "rental") {
        for (const indicacao of newIndicacoes) {
            const taskResult = await createRentalTasksForIndication({
                indicacaoId: indicacao.id,
                nome: indicacao.nome ?? null,
                codigoInstalacao: indicacao.codigo_instalacao ?? null,
                creatorId: user.id,
            })

            createdTasks += taskResult?.created ?? 0
        }
    }

    revalidatePath(crmPath)
    return {
        success: true,
        created: newCards.length,
        skipped: (indicacoes?.length ?? 0) - newCards.length,
        createdTasks,
    }
}
