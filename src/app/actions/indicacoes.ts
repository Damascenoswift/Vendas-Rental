'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createIndicationAction(payload: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Não autorizado' }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    // Get current user profile to check if they are a supervisor
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const finalPayload = { ...payload }

    // If the actor is a supervisor and they are attributing to someone else
    if (profile?.role === 'supervisor' && payload.user_id !== user.id) {
        // Double check if the target user is actually their subordinate
        const { data: targetUser } = await supabaseAdmin
            .from('users')
            .select('supervisor_id')
            .eq('id', payload.user_id)
            .single()

        if (targetUser?.supervisor_id === user.id) {
            finalPayload.created_by_supervisor_id = user.id
        } else {
            // If they are trying to attribute to someone NOT their subordinate,
            // we might want to block this or just ignore the attribution.
            // For now, let's allow if they are admin, but the prompt says
            // supervisors manage THEIR salespeople.
            if (!['adm_mestre', 'adm_dorata'].includes(profile.role)) {
                return { success: false, message: 'Você só pode atribuir indicações para seus subordinados.' }
            }
        }
    }

    // Insert the indication
    const { data, error } = await supabaseAdmin
        .from('indicacoes')
        .insert(finalPayload)
        .select('id')
        .single()

    if (error) {
        console.error('Erro ao criar indicação:', error)
        return { success: false, message: error.message }
    }

    revalidatePath('/indicacoes')
    revalidatePath('/admin/indicacoes')

    return { success: true, id: data.id }
}
