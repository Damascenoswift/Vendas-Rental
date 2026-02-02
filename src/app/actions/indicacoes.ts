'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function createCrmCardForBrand(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    indicacaoId: string
    title: string | null
    assigneeId: string | null
    createdBy: string
    brand: "dorata" | "rental"
}) {
    const { supabaseAdmin, indicacaoId, title, assigneeId, createdBy, brand } = params

    const { data: pipeline, error: pipelineError } = await supabaseAdmin
        .from('crm_pipelines')
        .select('id')
        .eq('brand', brand)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (pipelineError || !pipeline) {
        console.error('CRM Pipeline Error:', pipelineError)
        return { error: pipelineError?.message ?? `Pipeline ${brand} nao encontrado` }
    }

    const { data: stage, error: stageError } = await supabaseAdmin
        .from('crm_stages')
        .select('id')
        .eq('pipeline_id', pipeline.id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (stageError || !stage) {
        console.error('CRM Stage Error:', stageError)
        return { error: stageError?.message ?? 'Etapa inicial nao encontrada' }
    }

    const { data: existingCard, error: existingError } = await supabaseAdmin
        .from('crm_cards')
        .select('id')
        .eq('pipeline_id', pipeline.id)
        .eq('indicacao_id', indicacaoId)
        .limit(1)
        .maybeSingle()

    if (existingError) {
        console.error('CRM Card Lookup Error:', existingError)
        return { error: existingError.message }
    }

    if (existingCard) {
        return { success: true, skipped: true }
    }

    const { data: card, error: insertError } = await supabaseAdmin
        .from('crm_cards')
        .insert({
            pipeline_id: pipeline.id,
            stage_id: stage.id,
            indicacao_id: indicacaoId,
            title,
            created_by: createdBy,
            assignee_id: assigneeId,
        })
        .select('id')
        .single()

    if (insertError) {
        console.error('CRM Card Insert Error:', insertError)
        return { error: insertError.message }
    }

    const { error: historyError } = await supabaseAdmin
        .from('crm_stage_history')
        .insert({
            card_id: card.id,
            from_stage_id: null,
            to_stage_id: stage.id,
            changed_by: createdBy,
        })

    if (historyError) {
        console.error('CRM Stage History Error:', historyError)
    }

    return { success: true }
}

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
            if (!['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile.role)) {
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

    const brand = String(finalPayload.marca ?? '').toLowerCase()
    if (brand === 'dorata' || brand === 'rental') {
        const crmResult = await createCrmCardForBrand({
            supabaseAdmin,
            indicacaoId: data.id,
            title: finalPayload.nome ?? null,
            assigneeId: finalPayload.user_id ?? null,
            createdBy: user.id,
            brand,
        })
        if (crmResult?.error) {
            console.error('CRM Auto Create Error:', crmResult.error)
        } else {
            const crmPath = brand === 'rental' ? '/admin/crm/rental' : '/admin/crm'
            revalidatePath(crmPath)
        }
    }

    revalidatePath('/indicacoes')
    revalidatePath('/admin/indicacoes')

    return { success: true, id: data.id }
}
