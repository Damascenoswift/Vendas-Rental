'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureCrmCardForIndication } from '@/services/crm-card-service'
import { createRentalTasksForIndication } from '@/services/task-service'
import { assertSupervisorCanAssignInternalVendor } from '@/lib/supervisor-scope'
import { hasFullAccess, type UserProfile, type UserRole } from '@/lib/auth'
import { hasSalesAccess } from '@/lib/sales-access'

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
    const targetUserId = typeof payload?.user_id === 'string' ? payload.user_id : ''
    if (!targetUserId) {
        return { success: false, message: 'Vendedor da indicação é obrigatório.' }
    }

    let { data: targetUserProfile, error: targetUserError } = await supabaseAdmin
        .from('users')
        .select('id, role, status, sales_access')
        .eq('id', targetUserId)
        .maybeSingle()

    const targetMissingColumn = parseMissingColumnError(targetUserError?.message)
    if (targetUserError && targetMissingColumn?.table === 'users' && targetMissingColumn.column === 'sales_access') {
        const fallback = await supabaseAdmin
            .from('users')
            .select('id, role, status')
            .eq('id', targetUserId)
            .maybeSingle()
        targetUserProfile = fallback.data as any
        targetUserError = fallback.error
    }

    if (targetUserError) {
        return { success: false, message: 'Não foi possível validar o vendedor da indicação.' }
    }

    if (!targetUserProfile?.id) {
        return { success: false, message: 'Vendedor selecionado não encontrado.' }
    }

    if (!hasSalesAccess(targetUserProfile as { role?: string | null; sales_access?: boolean | null })) {
        return { success: false, message: 'Usuário sem acesso a vendas (indicações/comissão).' }
    }

    const canManageOthers =
        hasFullAccess(role ?? null, department) ||
        ['funcionario_n1', 'funcionario_n2'].includes(role ?? '')

    // Regular sellers can only create on their own user id.
    if (profile?.role !== 'supervisor' && !canManageOthers && targetUserId !== user.id) {
        return { success: false, message: 'Você só pode criar indicações no seu próprio usuário.' }
    }

    // Supervisor can assign only to internal subordinates.
    if (profile?.role === 'supervisor' && targetUserId !== user.id) {
        const permission = await assertSupervisorCanAssignInternalVendor(user.id, targetUserId)
        if (!permission.allowed) {
            return { success: false, message: permission.message }
        }

        finalPayload.created_by_supervisor_id = user.id
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
