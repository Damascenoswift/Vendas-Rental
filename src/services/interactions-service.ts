"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"
import { ensureCrmCardForIndication } from "@/services/crm-card-service"

export type InteractionType = 'COMMENT' | 'STATUS_CHANGE' | 'DOC_REQUEST' | 'DOC_APPROVAL'

export interface Interaction {
    id: string
    indicacao_id: string
    user_id: string
    type: InteractionType
    content: string
    metadata: any
    created_at: string
    user: {
        name: string
        email: string
    }
}

export async function getInteractions(indicacaoId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('indicacao_interactions')
        .select(`
            *,
            user:users(name, email)
        `)
        .eq('indicacao_id', indicacaoId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching interactions:", error)
        return []
    }

    // Cast the user join result manually
    return (data as any[]).map(item => ({
        ...item,
        user: item.user
    })) as Interaction[]
}

export async function addInteraction(
    indicacaoId: string,
    content: string,
    type: InteractionType = 'COMMENT',
    metadata: any = {}
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "User not authenticated" }
    }

    const { error } = await supabase
        .from('indicacao_interactions')
        .insert({
            indicacao_id: indicacaoId,
            user_id: user.id,
            type,
            content,
            metadata
        })

    if (error) {
        console.error("Error adding interaction:", error)
        return { error: error.message }
    }

    revalidatePath(`/admin/leads`) // Revalidate main lists
    return { success: true }
}

export async function updateDocValidationStatus(
    indicacaoId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INCOMPLETE',
    notes?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    // 1. Update the status column
    const { error: updateError } = await supabase
        .from('indicacoes')
        .update({ doc_validation_status: status })
        .eq('id', indicacaoId)

    if (updateError) {
        return { error: updateError.message }
    }

    // 2. Log this as an interaction
    await addInteraction(
        indicacaoId,
        `Document status updated to: ${status}. ${notes ? `Notes: ${notes}` : ''}`,
        'DOC_APPROVAL',
        { new_status: status }
    )

    revalidatePath(`/admin/leads`)
    return { success: true }
}

export async function updateStatusWithComment(
    indicacaoId: string,
    newStatus: string,
    comment?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    // 1. Build status update payload (including key contract milestones)
    const { data: currentIndicacaoData } = await supabase
        .from('indicacoes')
        .select('contrato_enviado_em, assinada_em')
        .eq('id', indicacaoId)
        .maybeSingle()

    const currentIndicacao = currentIndicacaoData as {
        contrato_enviado_em: string | null
        assinada_em: string | null
    } | null

    const now = new Date().toISOString()
    const updates: Record<string, string> = {
        status: newStatus,
    }

    if (newStatus === 'AGUARDANDO_ASSINATURA' && !currentIndicacao?.contrato_enviado_em) {
        updates.contrato_enviado_em = now
    }

    if (newStatus === 'CONCLUIDA') {
        if (!currentIndicacao?.contrato_enviado_em) {
            updates.contrato_enviado_em = now
        }
        if (!currentIndicacao?.assinada_em) {
            updates.assinada_em = now
        }
    }

    // 2. Update status
    const { error: updateError } = await supabase
        .from('indicacoes')
        .update(updates)
        .eq('id', indicacaoId)

    if (updateError) {
        return { error: updateError.message }
    }

    // 3. Add interaction (System log for status change)
    await addInteraction(
        indicacaoId,
        `Status alterado para: ${newStatus}`,
        'STATUS_CHANGE',
        { new_status: newStatus }
    )

    // 4. Add optional user comment
    if (comment && comment.trim()) {
        await addInteraction(
            indicacaoId,
            comment,
            'COMMENT'
        )
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: indicacao, error: indicacaoError } = await supabaseAdmin
        .from('indicacoes')
        .select('id, nome, user_id, marca, status')
        .eq('id', indicacaoId)
        .maybeSingle()

    if (indicacaoError) {
        console.error('Erro ao buscar indicacao para CRM:', indicacaoError)
    }

    if (indicacao?.marca === 'rental' || indicacao?.marca === 'dorata') {
        const crmResult = await ensureCrmCardForIndication({
            brand: indicacao.marca,
            indicacaoId: indicacao.id,
            title: indicacao.nome ?? null,
            assigneeId: indicacao.user_id ?? null,
            createdBy: user.id,
            status: indicacao.status ?? newStatus,
        })

        if (crmResult?.error) {
            console.error('Erro ao criar/atualizar card CRM:', crmResult.error)
        }
    }

    revalidatePath(`/admin/leads`)
    return { success: true }
}

export interface EnergisaLog {
    id: string
    action_type: string
    notes: string
    created_at: string
    user: { name: string }
}

export async function getEnergisaLogs(indicacaoId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('energisa_logs')
        .select('*, user:users(name)')
        .eq('indicacao_id', indicacaoId)
        .order('created_at', { ascending: false })

    return data as any as EnergisaLog[] || []
}

export async function addEnergisaLog(indicacaoId: string, actionType: string, notes: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from('energisa_logs')
        .insert({
            indicacao_id: indicacaoId,
            user_id: user.id,
            action_type: actionType,
            notes: notes
        })

    if (error) return { error: error.message }
    return { success: true }
}
