"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"

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

    const { error } = await supabaseAdmin
        .from("indicacoes")
        .update({ status: newStatus as any })
        .eq("id", id)

    if (error) {
        console.error("Erro ao atualizar status:", error)
        return { error: "Erro ao atualizar status" }
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

    if (role !== "adm_mestre") {
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
