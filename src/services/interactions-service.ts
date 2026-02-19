"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"
import { ensureCrmCardForIndication } from "@/services/crm-card-service"
import { createTask } from "@/services/task-service"
import { markDorataContractSigned } from "@/app/actions/crm"
import { getProfile } from "@/lib/auth"

export type InteractionType = 'COMMENT' | 'STATUS_CHANGE' | 'DOC_REQUEST' | 'DOC_APPROVAL'
type DocValidationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'INCOMPLETE'

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
    const profile = await getProfile(supabase, user.id)
    if (profile?.role === 'supervisor') {
        const supabaseAdmin = createSupabaseServiceClient()
        const { data: targetIndicacao, error: targetIndicacaoError } = await supabaseAdmin
            .from('indicacoes')
            .select('id, user_id')
            .eq('id', indicacaoId)
            .maybeSingle()

        if (targetIndicacaoError || !targetIndicacao) {
            return { error: targetIndicacaoError?.message ?? "Indicação não encontrada" }
        }

        if (targetIndicacao.user_id !== user.id) {
            return { error: "Supervisor possui acesso apenas de visualização das indicações da equipe." }
        }
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
    status: DocValidationStatus,
    notes?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const supabaseAdmin = createSupabaseServiceClient()
    const profile = await getProfile(supabase, user.id)

    const { data: indicacao, error: indicacaoError } = await supabaseAdmin
        .from('indicacoes')
        .select('id, nome, marca, user_id')
        .eq('id', indicacaoId)
        .maybeSingle()

    if (indicacaoError || !indicacao) {
        return { error: indicacaoError?.message ?? "Indicação não encontrada" }
    }
    if (profile?.role === 'supervisor' && indicacao.user_id !== user.id) {
        return { error: "Supervisor possui acesso apenas de visualização das indicações da equipe." }
    }

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

    const isDorata = indicacao.marca === 'dorata'
    const statusLabelByCode: Record<Exclude<DocValidationStatus, 'PENDING'>, string> = {
        APPROVED: 'Aprovada',
        INCOMPLETE: 'Incompleta',
        REJECTED: 'Rejeitada',
    }
    const shortStatus = status === 'PENDING' ? 'Pendente' : statusLabelByCode[status]

    let warning: string | null = null

    if (isDorata && status !== 'PENDING') {
        const { data: financeUsers, error: financeUsersError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('department', 'financeiro')
            .order('name', { ascending: true })

        if (financeUsersError) {
            console.error('Erro ao buscar usuários do financeiro:', financeUsersError)
            warning = 'Falha ao buscar equipe financeira para notificação.'
        }

        const financeIds = (financeUsers ?? []).map((item) => item.id).filter(Boolean)
        const financeAssigneeId = financeIds[0] ?? undefined
        const sellerId = indicacao.user_id ?? undefined

        const ensureTaskNotification = async (params: {
            marker: string
            title: string
            description: string
            department: 'vendas' | 'financeiro'
            priority: 'MEDIUM' | 'HIGH'
            assigneeId?: string
            observerIds?: string[]
        }) => {
            const { data: existingTask, error: existingTaskError } = await supabaseAdmin
                .from('tasks')
                .select('id')
                .eq('indicacao_id', indicacaoId)
                .like('description', `%${params.marker}%`)
                .limit(1)

            if (existingTaskError) {
                console.error('Erro ao verificar tarefa de notificação existente:', existingTaskError)
            }

            if (existingTask && existingTask.length > 0) return

            const taskResult = await createTask({
                title: params.title,
                description: `${params.description}\n${params.marker}`,
                priority: params.priority,
                status: 'TODO',
                department: params.department,
                brand: 'dorata',
                visibility_scope: params.assigneeId ? 'RESTRICTED' : 'TEAM',
                assignee_id: params.assigneeId,
                indicacao_id: indicacaoId,
                client_name: indicacao.nome ?? undefined,
                observer_ids: params.observerIds,
            })

            if (taskResult?.error) {
                console.error('Erro ao criar tarefa de notificação Dorata:', taskResult.error)
                warning = warning
                    ? `${warning} Falha ao criar uma tarefa de notificação.`
                    : 'Falha ao criar uma tarefa de notificação.'
            }
        }

        const sellerMarker = `[dorata_doc_notify:${indicacaoId}:${status}:seller]`
        await ensureTaskNotification({
            marker: sellerMarker,
            title: `Dorata: documentação ${shortStatus.toLowerCase()} - ${indicacao.nome ?? indicacaoId.slice(0, 8)}`,
            description: [
                `Status da documentação atualizado para ${shortStatus}.`,
                'Acompanhar a etapa da venda no CRM Dorata.',
            ].join('\n'),
            department: 'vendas',
            priority: status === 'REJECTED' ? 'HIGH' : 'MEDIUM',
            assigneeId: sellerId,
            observerIds: financeIds,
        })

        if (status === 'APPROVED') {
            const approvalResult = await markDorataContractSigned(indicacaoId)
            if (approvalResult?.error) {
                warning = warning
                    ? `${warning} ${approvalResult.error}`
                    : approvalResult.error
            } else if (approvalResult?.warning) {
                warning = warning
                    ? `${warning} ${approvalResult.warning}`
                    : approvalResult.warning
            }
        } else {
            const financeObserverIds = [sellerId, ...financeIds.filter((id) => id !== financeAssigneeId)]
                .filter(Boolean) as string[]
            const financeMarker = `[dorata_doc_notify:${indicacaoId}:${status}:finance]`
            await ensureTaskNotification({
                marker: financeMarker,
                title: `Dorata: documentação ${shortStatus.toLowerCase()} - revisão financeira`,
                description: [
                    `Status da documentação atualizado para ${shortStatus}.`,
                    `Cliente: ${indicacao.nome ?? 'Sem nome'} (${indicacaoId})`,
                    'Validar impacto financeiro/comissão desta venda no fluxo Dorata.',
                ].join('\n'),
                department: 'financeiro',
                priority: status === 'REJECTED' ? 'HIGH' : 'MEDIUM',
                assigneeId: financeAssigneeId,
                observerIds: financeObserverIds,
            })
        }
    }

    revalidatePath(`/admin/leads`)
    revalidatePath(`/admin/crm`)
    revalidatePath(`/admin/financeiro`)
    revalidatePath(`/admin/tarefas`)
    return { success: true, warning }
}

export async function updateStatusWithComment(
    indicacaoId: string,
    newStatus: string,
    comment?: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }
    const profile = await getProfile(supabase, user.id)
    const supabaseAdmin = createSupabaseServiceClient()

    if (profile?.role === 'supervisor') {
        const { data: targetIndicacao, error: targetIndicacaoError } = await supabaseAdmin
            .from('indicacoes')
            .select('id, user_id')
            .eq('id', indicacaoId)
            .maybeSingle()

        if (targetIndicacaoError || !targetIndicacao) {
            return { error: targetIndicacaoError?.message ?? "Indicação não encontrada" }
        }

        if (targetIndicacao.user_id !== user.id) {
            return { error: "Supervisor possui acesso apenas de visualização das indicações da equipe." }
        }
    }

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

type EnergisaLogRow = {
    id: string
    user_id: string | null
    action_type: string
    notes: string | null
    created_at: string
    user?: { name: string | null } | { name: string | null }[] | null
}

function isPermissionDenied(error?: { code?: string | null; message?: string | null } | null) {
    if (!error) return false
    return error.code === '42501' || /permission denied/i.test(error.message ?? '')
}

async function hasTaskAccessForIndicacao(indicacaoId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('indicacao_id', indicacaoId)
        .limit(1)

    if (error) {
        console.error('Error checking task access for Energisa logs:', error)
        return false
    }

    return (data?.length ?? 0) > 0
}

export async function getEnergisaLogs(indicacaoId: string) {
    const supabase = await createClient()
    let activeClient: any = supabase
    let { data, error } = await activeClient
        .from('energisa_logs')
        .select('*, user:users(name)')
        .eq('indicacao_id', indicacaoId)
        .order('created_at', { ascending: false })

    if (error && isPermissionDenied(error)) {
        const canAccessByTask = await hasTaskAccessForIndicacao(indicacaoId)
        if (canAccessByTask) {
            try {
                const supabaseAdmin = createSupabaseServiceClient()
                activeClient = supabaseAdmin
                const adminResult = await activeClient
                    .from('energisa_logs')
                    .select('*, user:users(name)')
                    .eq('indicacao_id', indicacaoId)
                    .order('created_at', { ascending: false })

                data = adminResult.data as any
                error = adminResult.error as any
            } catch (adminError) {
                console.error('Error creating admin client for Energisa logs:', adminError)
            }
        }
    }

    if (error && /relationship between 'energisa_logs' and 'users'/i.test(error.message ?? '')) {
        const fallback = await activeClient
            .from('energisa_logs')
            .select('id, user_id, action_type, notes, created_at')
            .eq('indicacao_id', indicacaoId)
            .order('created_at', { ascending: false })

        data = fallback.data as any
        error = fallback.error as any
    }

    if (error) {
        console.error("Error fetching Energisa logs:", error)
        return []
    }

    const rows = ((data ?? []) as EnergisaLogRow[])
    const needsUserLookup = rows.some((row) => !row.user && row.user_id)

    const usersById = new Map<string, { name: string | null }>()
    if (needsUserLookup) {
        const userIds = Array.from(
            new Set(
                rows
                    .map((row) => row.user_id)
                    .filter((userId): userId is string => Boolean(userId))
            )
        )

        if (userIds.length > 0) {
            const { data: usersData, error: usersError } = await activeClient
                .from('users')
                .select('id, name')
                .in('id', userIds)

            if (usersError) {
                console.error("Error fetching users for Energisa logs:", usersError)
            } else {
                ;(usersData ?? []).forEach((user: { id: string; name: string | null }) => {
                    usersById.set(user.id, { name: user.name ?? null })
                })
            }
        }
    }

    return rows.map((row) => {
        const joinedUser = Array.isArray(row.user) ? (row.user[0] ?? null) : (row.user ?? null)
        const fallbackUser = row.user_id ? usersById.get(row.user_id) ?? null : null

        return {
            id: row.id,
            action_type: row.action_type,
            notes: row.notes ?? '',
            created_at: row.created_at,
            user: {
                name: joinedUser?.name ?? fallbackUser?.name ?? 'Desconhecido',
            },
        } satisfies EnergisaLog
    })
}

export async function addEnergisaLog(indicacaoId: string, actionType: string, notes: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }
    const profile = await getProfile(supabase, user.id)
    if (profile?.role === 'supervisor') {
        const supabaseAdmin = createSupabaseServiceClient()
        const { data: targetIndicacao, error: targetIndicacaoError } = await supabaseAdmin
            .from('indicacoes')
            .select('id, user_id')
            .eq('id', indicacaoId)
            .maybeSingle()

        if (targetIndicacaoError || !targetIndicacao) {
            return { error: targetIndicacaoError?.message ?? "Indicação não encontrada" }
        }

        if (targetIndicacao.user_id !== user.id) {
            return { error: "Supervisor possui acesso apenas de visualização das indicações da equipe." }
        }
    }

    let { error } = await supabase
        .from('energisa_logs')
        .insert({
            indicacao_id: indicacaoId,
            user_id: user.id,
            action_type: actionType,
            notes: notes
        })

    if (error && isPermissionDenied(error)) {
        const canAccessByTask = await hasTaskAccessForIndicacao(indicacaoId)
        if (canAccessByTask) {
            try {
                const supabaseAdmin = createSupabaseServiceClient()
                const adminResult = await supabaseAdmin
                    .from('energisa_logs')
                    .insert({
                        indicacao_id: indicacaoId,
                        user_id: user.id,
                        action_type: actionType,
                        notes: notes
                    })

                error = adminResult.error
            } catch (adminError) {
                console.error('Error creating admin client for Energisa insert:', adminError)
            }
        }
    }

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    revalidatePath('/admin/leads')
    return { success: true }
}
