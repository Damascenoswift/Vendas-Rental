'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureCrmCardForIndication } from '@/services/crm-card-service'
import { createRentalTasksForIndication } from '@/services/task-service'
import { hasFullAccess, type UserProfile, type UserRole } from '@/lib/auth'

function parseMissingColumnError(message?: string | null) {
    if (!message) return null

    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null

    return { column: match[1], table: match[2] }
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
        .select('role, department')
        .eq('id', user.id)
        .single()
    const role = profile?.role as UserRole | undefined
    const department = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null

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
            if (!hasFullAccess(role ?? null, department) && !['funcionario_n1', 'funcionario_n2'].includes(role ?? '')) {
                return { success: false, message: 'Você só pode atribuir indicações para seus subordinados.' }
            }
        }
    }

    const insertPayload = { ...finalPayload }
    if (typeof insertPayload.codigo_instalacao === 'string') {
        const trimmedInstallationCode = insertPayload.codigo_instalacao.trim()
        if (trimmedInstallationCode.length === 0) {
            delete insertPayload.codigo_instalacao
        } else {
            insertPayload.codigo_instalacao = trimmedInstallationCode
        }
    }

    const insertIndication = async (candidatePayload: any) =>
        supabaseAdmin
            .from('indicacoes')
            .insert(candidatePayload)
            .select('id')
            .single()

    let { data, error } = await insertIndication(insertPayload)
    const droppedColumns: string[] = []

    while (error) {
        const missingColumn = parseMissingColumnError(error.message)
        if (!missingColumn || missingColumn.table !== 'indicacoes') break
        if (!(missingColumn.column in insertPayload)) break

        droppedColumns.push(missingColumn.column)
        delete insertPayload[missingColumn.column]

        const retry = await insertIndication(insertPayload)
        data = retry.data
        error = retry.error
    }

    if (droppedColumns.length > 0) {
        console.warn(
            `[createIndicationAction] Insert fallback for missing indicacoes columns: ${droppedColumns.join(', ')}`
        )
    }

    if (error) {
        console.error('Erro ao criar indicação:', error)
        return { success: false, message: error.message }
    }

    const indicationId = data?.id
    if (!indicationId) {
        return { success: false, message: 'Não foi possível criar indicação.' }
    }

    const brand = String(finalPayload.marca ?? '').toLowerCase()
    if (brand === 'dorata' || brand === 'rental') {
        const crmResult = await ensureCrmCardForIndication({
            indicacaoId: indicationId,
            title: finalPayload.nome ?? null,
            assigneeId: finalPayload.user_id ?? null,
            createdBy: user.id,
            brand,
            status: finalPayload.status ?? null,
        })
        if (crmResult?.error) {
            console.error('CRM Auto Create Error:', crmResult.error)
        }
    }

    if (brand === 'rental') {
        const taskResult = await createRentalTasksForIndication({
            indicacaoId: indicationId,
            nome: finalPayload.nome ?? null,
            codigoInstalacao: finalPayload.codigo_instalacao ?? null,
            creatorId: user.id,
        })
        if (taskResult && 'error' in taskResult && taskResult.error) {
            console.error('Rental task auto-create error:', taskResult.error)
        }
    }

    revalidatePath('/indicacoes')
    revalidatePath('/admin/indicacoes')

    return { success: true, id: indicationId }
}
