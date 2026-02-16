"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, hasFullAccess, type UserProfile } from "@/lib/auth"
import { ensureCrmCardForIndication } from "@/services/crm-card-service"

const indicationUpdateRoles = ['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2']

function mapDeleteIndicationError(error: { message?: string | null; details?: string | null; code?: string | null }) {
    const raw = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()

    if (raw.includes("proposals_client_id_fkey")) {
        return "Não foi possível excluir: existem orçamentos vinculados a esta indicação."
    }
    if (raw.includes("alocacoes_clientes_cliente_id_fkey")) {
        return "Não foi possível excluir: esta indicação possui alocações de energia vinculadas."
    }
    if (raw.includes("faturas_conciliacao_cliente_id_fkey")) {
        return "Não foi possível excluir: esta indicação possui faturas de conciliação vinculadas."
    }
    if (raw.includes("financeiro_transacoes_origin_lead_id_fkey")) {
        return "Não foi possível excluir: esta indicação está vinculada a transações financeiras."
    }
    if (raw.includes("financeiro_fechamento_itens_origin_lead_id_fkey")) {
        return "Não foi possível excluir: esta indicação está vinculada a itens de fechamento financeiro."
    }
    if (raw.includes("financeiro_relatorios_manuais_itens_origin_lead_id_fkey")) {
        return "Não foi possível excluir: esta indicação está vinculada a relatórios financeiros manuais."
    }
    if (raw.includes("crm_cards_indicacao_id_fkey")) {
        return "Não foi possível excluir: esta indicação está vinculada ao CRM."
    }
    if (raw.includes("tasks_indicacao_id_fkey")) {
        return "Não foi possível excluir: esta indicação possui tarefas vinculadas."
    }
    if (raw.includes("indicacao_interactions_indicacao_id_fkey")) {
        return "Não foi possível excluir: esta indicação possui histórico vinculado."
    }
    if (error.code === "23503") {
        return "Não foi possível excluir: existem registros vinculados a esta indicação."
    }

    return "Erro ao excluir indicação"
}

function isMissingSchemaError(error: { message?: string | null; details?: string | null; code?: string | null }) {
    const raw = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
    return (
        error.code === "42P01" ||
        error.code === "42703" ||
        error.code === "PGRST204" ||
        raw.includes("does not exist") ||
        raw.includes("could not find the") ||
        raw.includes("schema cache")
    )
}

export async function updateIndicationStatus(id: string, newStatus: string) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !indicationUpdateRoles.includes(role)) {
        return { error: "Acesso negado" }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: currentIndicacaoData } = await supabaseAdmin
        .from("indicacoes")
        .select("contrato_enviado_em, assinada_em")
        .eq("id", id)
        .maybeSingle()

    const currentIndicacao = currentIndicacaoData as {
        contrato_enviado_em: string | null
        assinada_em: string | null
    } | null

    const now = new Date().toISOString()
    const updates: Record<string, string> = {
        status: newStatus,
    }

    if (newStatus === "AGUARDANDO_ASSINATURA" && !currentIndicacao?.contrato_enviado_em) {
        updates.contrato_enviado_em = now
    }

    if (newStatus === "CONCLUIDA") {
        if (!currentIndicacao?.contrato_enviado_em) {
            updates.contrato_enviado_em = now
        }
        if (!currentIndicacao?.assinada_em) {
            updates.assinada_em = now
        }
    }

    const { error } = await supabaseAdmin
        .from("indicacoes")
        .update(updates)
        .eq("id", id)

    if (error) {
        console.error("Erro ao atualizar status:", error)
        return { error: "Erro ao atualizar status" }
    }

    const { error: interactionError } = await supabaseAdmin
        .from("indicacao_interactions" as any)
        .insert({
            indicacao_id: id,
            user_id: user.id,
            type: "STATUS_CHANGE",
            content: `Status alterado para: ${newStatus}`,
            metadata: { new_status: newStatus },
        } as any)

    if (interactionError) {
        console.error("Erro ao registrar histórico de status:", interactionError)
    }

    const { data: indicacao, error: indicacaoError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, nome, user_id, marca, status")
        .eq("id", id)
        .maybeSingle()

    if (indicacaoError) {
        console.error("Erro ao buscar indicacao para CRM:", indicacaoError)
    }

    if (indicacao?.marca === "rental" || indicacao?.marca === "dorata") {
        const crmResult = await ensureCrmCardForIndication({
            brand: indicacao.marca,
            indicacaoId: indicacao.id,
            title: indicacao.nome ?? null,
            assigneeId: indicacao.user_id ?? null,
            createdBy: user.id,
            status: indicacao.status ?? newStatus,
        })

        if (crmResult?.error) {
            console.error("Erro ao criar/atualizar card CRM:", crmResult.error)
        }
    }

    revalidatePath("/admin/indicacoes")
    return { success: true }
}

type IndicationFlagsInput = {
    assinada?: boolean
    compensada?: boolean
}

export async function setIndicationFlags(id: string, flags: IndicationFlagsInput) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !indicationUpdateRoles.includes(role)) {
        return { error: "Acesso negado" }
    }

    const updates: Record<string, string | null> = {}

    if (flags.assinada !== undefined) {
        updates.assinada_em = flags.assinada ? new Date().toISOString() : null
    }

    if (flags.compensada !== undefined) {
        updates.compensada_em = flags.compensada ? new Date().toISOString() : null
    }

    if (Object.keys(updates).length === 0) {
        return { error: "Nenhuma atualização enviada" }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { error } = await supabaseAdmin
        .from("indicacoes")
        .update(updates)
        .eq("id", id)

    if (error) {
        console.error("Erro ao atualizar indicadores de assinatura/compensação:", error)
        return { error: "Erro ao atualizar campos" }
    }

    revalidatePath("/admin/indicacoes")
    return { success: true }
}

export async function deleteIndication(id: string) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    const department = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null

    const canDelete = hasFullAccess(role ?? null, department)

    if (!canDelete) {
        return { error: "Acesso negado. Apenas administradores podem excluir indicações." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    // 1) Remove orçamentos vinculados (principal causa de bloqueio por FK).
    const { error: deleteProposalsError } = await supabaseAdmin
        .from("proposals")
        .delete()
        .eq("client_id", id)

    if (deleteProposalsError) {
        console.error("Erro ao excluir orçamentos vinculados:", deleteProposalsError)
        return { error: "Erro ao excluir orçamentos vinculados à indicação." }
    }

    // 2) Limpeza best-effort de vínculos para priorizar exclusão no painel admin.
    // Financeiro legado (fallback para schemas antigos onde FK pode não ser ON DELETE SET NULL).
    const { error: unlinkFinanceError } = await supabaseAdmin
        .from("financeiro_transacoes")
        .update({ origin_lead_id: null })
        .eq("origin_lead_id", id)

    if (unlinkFinanceError && !isMissingSchemaError(unlinkFinanceError)) {
        const { error: deleteFinanceRowsError } = await supabaseAdmin
            .from("financeiro_transacoes")
            .delete()
            .eq("origin_lead_id", id)

        if (deleteFinanceRowsError && !isMissingSchemaError(deleteFinanceRowsError)) {
            console.error("Erro ao limpar vínculo financeiro (update/delete):", {
                unlinkFinanceError,
                deleteFinanceRowsError,
            })
        }
    }

    // Tabelas financeiras novas (080): apenas desvincula referência.
    const { error: unlinkClosureItemsError } = await supabaseAdmin
        .from("financeiro_fechamento_itens")
        .update({ origin_lead_id: null })
        .eq("origin_lead_id", id)
    if (unlinkClosureItemsError && !isMissingSchemaError(unlinkClosureItemsError)) {
        console.error("Erro ao desvincular fechamento financeiro da indicação:", unlinkClosureItemsError)
    }

    const { error: unlinkManualReportsError } = await supabaseAdmin
        .from("financeiro_relatorios_manuais_itens")
        .update({ origin_lead_id: null })
        .eq("origin_lead_id", id)
    if (unlinkManualReportsError && !isMissingSchemaError(unlinkManualReportsError)) {
        console.error("Erro ao desvincular relatório manual da indicação:", unlinkManualReportsError)
    }

    // CRM e histórico de interação (para ambientes com FK sem cascade).
    const { error: deleteCrmCardsError } = await supabaseAdmin
        .from("crm_cards")
        .delete()
        .eq("indicacao_id", id)
    if (deleteCrmCardsError && !isMissingSchemaError(deleteCrmCardsError)) {
        console.error("Erro ao excluir cards CRM vinculados:", deleteCrmCardsError)
    }

    const { error: deleteInteractionsError } = await supabaseAdmin
        .from("indicacao_interactions")
        .delete()
        .eq("indicacao_id", id)
    if (deleteInteractionsError && !isMissingSchemaError(deleteInteractionsError)) {
        console.error("Erro ao excluir interações vinculadas:", deleteInteractionsError)
    }

    // Tasks geralmente usam ON DELETE SET NULL, mas forçamos em ambientes legados.
    const { error: unlinkTasksError } = await supabaseAdmin
        .from("tasks")
        .update({ indicacao_id: null })
        .eq("indicacao_id", id)
    if (unlinkTasksError && !isMissingSchemaError(unlinkTasksError)) {
        console.error("Erro ao desvincular tarefas da indicação:", unlinkTasksError)
    }

    let { error } = await supabaseAdmin
        .from("indicacoes")
        .delete()
        .eq("id", id)

    // Retry específico para FK financeira legada.
    const deleteRaw = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase()
    if (error && deleteRaw.includes("financeiro_transacoes_origin_lead_id_fkey")) {
        const { error: forceDeleteFinanceError } = await supabaseAdmin
            .from("financeiro_transacoes")
            .delete()
            .eq("origin_lead_id", id)

        if (!forceDeleteFinanceError || isMissingSchemaError(forceDeleteFinanceError)) {
            const retry = await supabaseAdmin
                .from("indicacoes")
                .delete()
                .eq("id", id)
            error = retry.error
        }
    }

    if (error) {
        console.error("Erro ao excluir indicação:", error)
        return { error: mapDeleteIndicationError(error) }
    }

    revalidatePath("/admin/indicacoes")
    revalidatePath("/admin/orcamentos")
    revalidatePath("/dashboard")
    return { success: true }
}
