"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

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
