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
    if (error.code === "23503") {
        return "Não foi possível excluir: existem registros vinculados a esta indicação."
    }

    return "Erro ao excluir indicação"
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

    const canDelete =
        hasFullAccess(role ?? null, department) ||
        role === 'funcionario_n1' ||
        role === 'funcionario_n2' ||
        department === 'financeiro'

    if (!canDelete) {
        return { error: "Acesso negado" }
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

    // 2) Desvincula transações financeiras (preserva histórico financeiro).
    // Usa service client para não depender de policy financeira do usuário logado.
    const { error: unlinkFinanceError } = await supabaseAdmin
        .from("financeiro_transacoes")
        .update({ origin_lead_id: null })
        .eq("origin_lead_id", id)

    if (unlinkFinanceError && unlinkFinanceError.code !== "42P01") {
        console.error("Erro ao desvincular transações financeiras:", unlinkFinanceError)
        return { error: "Erro ao desvincular transações financeiras da indicação." }
    }

    const { error } = await supabaseAdmin
        .from("indicacoes")
        .delete()
        .eq("id", id)

    if (error) {
        console.error("Erro ao excluir indicação:", error)
        return { error: mapDeleteIndicationError(error) }
    }

    revalidatePath("/admin/indicacoes")
    revalidatePath("/admin/orcamentos")
    revalidatePath("/dashboard")
    return { success: true }
}
