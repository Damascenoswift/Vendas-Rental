"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, hasFullAccess } from "@/lib/auth"
import { ensureCrmCardForIndication } from "@/services/crm-card-service"

const indicationUpdateRoles = ['adm_mestre', 'adm_dorata', 'supervisor', 'funcionario_n1', 'funcionario_n2'] as const

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

    if (!hasFullAccess(role)) {
        return { error: "Acesso negado" }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    // Delete associated storage files first (optional but good practice)
    // For now, we'll just delete the record. Supabase might cascade or leave files.
    // Given the complexity of storage deletion (listing files etc), we focus on the record.

    const { error } = await supabaseAdmin
        .from("indicacoes")
        .delete()
        .eq("id", id)

    if (error) {
        console.error("Erro ao excluir indicação:", error)
        return { error: "Erro ao excluir indicação" }
    }

    revalidatePath("/admin/indicacoes")
    return { success: true }
}
