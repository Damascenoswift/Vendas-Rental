"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasFullAccess, type UserProfile } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Department = 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'outro'
export type Brand = 'rental' | 'dorata'
export type TaskChecklistPhase = 'cadastro' | 'energisa' | 'geral'
export type TaskChecklistEventKey =
    | 'DOCS_APPROVED'
    | 'DOCS_INCOMPLETE'
    | 'DOCS_REJECTED'
    | 'CONTRACT_SENT'
    | 'CONTRACT_SIGNED'
    | null

const CADASTRO_CHECKLIST_TEMPLATE = [
    { title: 'Documentação aprovada', days: 0, sort_order: 1, event_key: 'DOCS_APPROVED' as const },
    { title: 'Concluir contrato', days: 1, sort_order: 2, event_key: null },
    { title: 'Enviar contrato', days: 1, sort_order: 3, event_key: 'CONTRACT_SENT' as const },
    { title: 'Contrato assinado', days: 4, sort_order: 4, event_key: 'CONTRACT_SIGNED' as const },
]

const ENERGISA_CHECKLIST_TEMPLATE = [
    { title: 'Pedido de transferência na energia feito', days: 10, sort_order: 1 },
    { title: 'Transferido', days: 10, sort_order: 2 },
]

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DOC_EVENT_KEYS: Exclude<TaskChecklistEventKey, null>[] = [
    'DOCS_APPROVED',
    'DOCS_INCOMPLETE',
    'DOCS_REJECTED',
]

const TASK_BOARD_ALLOWED_ROLES = [
    'adm_mestre',
    'adm_dorata',
    'supervisor',
    'suporte',
    'suporte_tecnico',
    'suporte_limitado',
    'funcionario_n1',
    'funcionario_n2',
    'vendedor_interno',
    'vendedor_externo',
] as const

function canManageTaskBoard(role?: string | null, department?: UserProfile['department'] | null) {
    if (hasFullAccess(role ?? null, department ?? null)) return true
    return Boolean(role && TASK_BOARD_ALLOWED_ROLES.includes(role as (typeof TASK_BOARD_ALLOWED_ROLES)[number]))
}

function addDays(base: Date, days: number) {
    return new Date(base.getTime() + days * MS_PER_DAY)
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null

    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null

    return { column: match[1], table: match[2] }
}

function isPermissionDenied(error?: { code?: string | null; message?: string | null } | null) {
    if (!error) return false
    return error.code === '42501' || /permission denied/i.test(error.message ?? '')
}

function isLegacyDepartmentConstraintError(error?: { code?: string | null; message?: string | null } | null) {
    if (!error) return false
    const message = error.message ?? ''
    return error.code === '23514' && /tasks_department_check/i.test(message)
}

function toLegacyDepartmentValue(department: string) {
    const map: Record<string, string> = {
        vendas: 'VENDAS',
        cadastro: 'CADASTRO',
        energia: 'ENERGIA',
        juridico: 'JURIDICO',
        financeiro: 'FINANCEIRO',
        outro: 'OUTRO',
        ti: 'OUTRO',
        diretoria: 'OUTRO',
    }

    return map[department] ?? department
}

function inferEventKey(title?: string | null): TaskChecklistEventKey {
    if (!title) return null
    const normalized = title.toLowerCase()

    if (normalized.includes('document') && normalized.includes('aprov')) return 'DOCS_APPROVED'
    if (normalized.includes('document') && (normalized.includes('incomplet') || normalized.includes('penden'))) {
        return 'DOCS_INCOMPLETE'
    }
    if (normalized.includes('document') && (normalized.includes('rejeit') || normalized.includes('reprov'))) {
        return 'DOCS_REJECTED'
    }
    if (normalized.includes('enviar contrato') || normalized.includes('contrato enviado')) return 'CONTRACT_SENT'
    if (normalized.includes('contrato assinado')) return 'CONTRACT_SIGNED'

    return null
}

function isDocAlertEventKey(eventKey: TaskChecklistEventKey) {
    return eventKey === 'DOCS_INCOMPLETE' || eventKey === 'DOCS_REJECTED'
}

function isChecklistAlertOnlyItem(item: { event_key?: string | null; title?: string | null }) {
    const inferred = ((item.event_key as TaskChecklistEventKey | undefined) ?? inferEventKey(item.title)) ?? null
    return isDocAlertEventKey(inferred)
}

function buildInteractionFromChecklistEvent(eventKey: Exclude<TaskChecklistEventKey, null>) {
    if (eventKey === 'DOCS_APPROVED') {
        return {
            type: 'DOC_APPROVAL',
            content: 'Documentação marcada como APROVADA via checklist de tarefas.',
            metadata: { new_status: 'APPROVED', source: 'task_checklist' },
        }
    }
    if (eventKey === 'DOCS_INCOMPLETE') {
        return {
            type: 'DOC_APPROVAL',
            content: 'Documentação marcada como INCOMPLETA via checklist de tarefas.',
            metadata: { new_status: 'INCOMPLETE', source: 'task_checklist' },
        }
    }
    if (eventKey === 'DOCS_REJECTED') {
        return {
            type: 'DOC_APPROVAL',
            content: 'Documentação marcada como REJEITADA via checklist de tarefas.',
            metadata: { new_status: 'REJECTED', source: 'task_checklist' },
        }
    }
    if (eventKey === 'CONTRACT_SENT') {
        return {
            type: 'STATUS_CHANGE',
            content: 'Contrato enviado para assinatura via checklist de tarefas.',
            metadata: { new_status: 'AGUARDANDO_ASSINATURA', source: 'task_checklist' },
        }
    }

    return {
        type: 'STATUS_CHANGE',
        content: 'Contrato marcado como assinado via checklist de tarefas.',
        metadata: { new_status: 'CONCLUIDA', source: 'task_checklist' },
    }
}

export interface Task {
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    due_date: string | null
    assignee_id: string | null
    creator_id: string | null
    indicacao_id: string | null
    client_name: string | null
    codigo_instalacao: string | null
    energisa_activated_at: string | null
    department: Department | null
    created_at: string
    completed_at: string | null
    completed_by: string | null
    brand: Brand
    checklist_total?: number
    checklist_done?: number
    assignee?: {
        name: string
        email: string
    }
    creator?: {
        name: string
    }
}

export interface TaskChecklistItem {
    id: string
    task_id: string
    title: string
    event_key?: TaskChecklistEventKey
    is_done: boolean
    sort_order: number
    created_at: string
    due_date: string | null
    completed_at: string | null
    completed_by: string | null
    phase: string | null
    completed_by_user?: {
        name: string | null
        email: string | null
    } | null
}

export interface TaskObserver {
    user_id: string
    user: {
        name: string
        email: string
    } | null
}

export interface TaskComment {
    id: string
    task_id: string
    user_id: string | null
    parent_id: string | null
    content: string
    created_at: string
    user?: {
        id?: string
        name: string | null
        email: string | null
    } | null
    parent?: {
        id: string
        content: string | null
        user?: {
            id?: string
            name: string | null
            email: string | null
        } | null
    } | null
}

export interface TaskUserOption {
    id: string
    name: string
    department: string | null
    email: string | null
}

export interface TaskLeadOption {
    id: string
    nome: string
    documento: string | null
    unidade_consumidora: string | null
    codigo_cliente: string | null
    codigo_instalacao: string | null
    marca?: Brand | null
}

export interface TaskContactOption {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    whatsapp: string | null
    phone: string | null
    mobile: string | null
}

export async function getTasks(filters?: {
    department?: Department,
    assigneeId?: string,
    showAll?: boolean,
    brand?: Brand
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    let query = supabase
        .from('tasks')
        .select(`
            *,
            assignee:users!tasks_assignee_id_fkey(name, email),
            creator:users!tasks_creator_id_fkey(name)
        `)
        .order('created_at', { ascending: false })

    if (filters?.department) {
        query = query.eq('department', filters.department)
    }

    if (filters?.assigneeId) {
        query = query.eq('assignee_id', filters.assigneeId)
    }

    if (filters?.brand) {
        query = query.eq('brand', filters.brand)
    }

    const { data, error } = await query

    if (error) {
        console.error("Error fetching tasks:", error)
        return []
    }

    const rows = (data as any[]).map(item => ({
        ...item,
        assignee: item.assignee,
        creator: item.creator
    })) as Task[]

    if (rows.length === 0) return rows

    const taskIds = rows.map(task => task.id)

    let { data: checklistRows, error: checklistError } = await supabase
        .from('task_checklists')
        .select('task_id, is_done, event_key, title')
        .in('task_id', taskIds)

    if (checklistError) {
        const missingColumn = parseMissingColumnError(checklistError.message)
        if (missingColumn && missingColumn.table === 'task_checklists' && missingColumn.column === 'event_key') {
            const fallback = await supabase
                .from('task_checklists')
                .select('task_id, is_done, title')
                .in('task_id', taskIds)
            checklistRows = fallback.data as any
            checklistError = fallback.error
        }
    }

    if (checklistError) {
        console.error("Error fetching task checklists:", checklistError)
        return rows
    }

    const summary = new Map<string, { total: number; done: number }>()
    ;(checklistRows ?? []).forEach((item: any) => {
        if (isChecklistAlertOnlyItem(item)) return
        const current = summary.get(item.task_id) ?? { total: 0, done: 0 }
        current.total += 1
        if (item.is_done) current.done += 1
        summary.set(item.task_id, current)
    })

    return rows.map(task => {
        const counts = summary.get(task.id)
        return {
            ...task,
            checklist_total: counts?.total ?? 0,
            checklist_done: counts?.done ?? 0,
        }
    })
}

export async function getTaskAssignableUsers() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, department, status')
        .order('name')

    if (error) {
        console.error("Error fetching users for tasks:", error)
        return []
    }

    return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name || "Sem Nome",
        email: row.email ?? null,
        department: row.department ?? null,
        status: row.status ?? null,
    })) as TaskUserOption[]
}

export async function searchTaskLeads(search?: string, brand?: Brand) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const supabaseAdmin = createSupabaseServiceClient()
    let query = supabaseAdmin
        .from('indicacoes')
        .select('id, nome, documento, unidade_consumidora, codigo_cliente, codigo_instalacao, marca')
        .limit(20)

    if (brand) {
        query = query.eq('marca', brand)
    }

    if (search) {
        query = query.ilike('nome', `%${search}%`)
    } else {
        query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query
    if (error) {
        console.error("Error fetching task leads:", error)
        return []
    }

    return data as TaskLeadOption[]
}

export async function getTaskLeadById(leadId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from('indicacoes')
        .select('id, nome, documento, unidade_consumidora, codigo_cliente, codigo_instalacao')
        .eq('id', leadId)
        .maybeSingle()

    if (error) {
        console.error("Error fetching task lead:", error)
        return null
    }

    return data as TaskLeadOption | null
}

export async function searchTaskContacts(search?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const supabaseAdmin = createSupabaseServiceClient()
    let query = supabaseAdmin
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, whatsapp, phone, mobile')
        .limit(20)

    if (search) {
        const sanitized = search.replace(/[(),']/g, " ").trim()
        if (sanitized) {
            query = query.or(
                `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,whatsapp.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,mobile.ilike.%${sanitized}%`
            )
        }
    } else {
        query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query
    if (error) {
        console.error("Error fetching task contacts:", error)
        return []
    }

    return data as TaskContactOption[]
}

export async function createTask(data: {
    title: string
    description?: string
    priority: TaskPriority
    due_date?: string
    assignee_id?: string
    department?: Department
    indicacao_id?: string
    client_name?: string
    codigo_instalacao?: string
    status?: TaskStatus
    brand?: Brand
    observer_ids?: string[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { observer_ids: observerIdsRaw, description: descriptionRaw, ...taskData } = data
    const description = descriptionRaw?.trim()
    const nowIso = new Date().toISOString()
    const payload: Record<string, any> = {
        ...taskData,
        description: description || null,
        creator_id: user.id,
        completed_at: taskData.status === 'DONE' ? nowIso : null,
        completed_by: taskData.status === 'DONE' ? user.id : null,
    }

    let { data: inserted, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select('id')
        .single()

    const missingColumn = parseMissingColumnError(error?.message)
    if (error && missingColumn && (missingColumn.column === 'completed_at' || missingColumn.column === 'completed_by')) {
        delete payload.completed_at
        delete payload.completed_by
        const fallbackResult = await supabase
            .from('tasks')
            .insert(payload)
            .select('id')
            .single()
        inserted = fallbackResult.data
        error = fallbackResult.error
    }

    if (error) {
        console.error("Error creating task:", error)
        return { error: error.message }
    }

    const observerIds = Array.from(new Set((observerIdsRaw ?? []).filter(Boolean)))
    if (observerIds.length > 0 && inserted?.id) {
        const { error: observersError } = await supabase
            .from('task_observers')
            .insert(observerIds.map((observerId) => ({
                task_id: inserted.id,
                user_id: observerId,
            })))

        if (observersError) {
            console.error("Error creating task observers:", observersError)
            return { error: observersError.message }
        }
    }

    if (description && inserted?.id) {
        const { error: commentError } = await supabase
            .from('task_comments')
            .insert({
                task_id: inserted.id,
                user_id: user.id,
                content: description,
            })

        if (commentError) {
            console.error("Error creating task comment:", commentError)
            return { error: commentError.message }
        }
    }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

async function insertChecklistTemplate(params: {
    supabase: any
    taskId: string
    phase: TaskChecklistPhase
    baseDate: Date
    template: {
        title: string
        days: number
        sort_order: number
        event_key?: TaskChecklistEventKey
    }[]
}) {
    const payload = params.template.map((item) => ({
        task_id: params.taskId,
        title: item.title,
        phase: params.phase,
        sort_order: item.sort_order,
        event_key: item.event_key ?? null,
        due_date: addDays(params.baseDate, item.days).toISOString(),
    }))

    let { error } = await params.supabase
        .from('task_checklists')
        .insert(payload)

    const missingColumn = parseMissingColumnError(error?.message)
    if (error && missingColumn && missingColumn.table === 'task_checklists' && missingColumn.column === 'event_key') {
        const fallbackPayload = payload.map(({ event_key: _eventKey, ...rest }) => rest)
        const fallbackResult = await params.supabase
            .from('task_checklists')
            .insert(fallbackPayload)
        error = fallbackResult.error
    }

    if (error) {
        console.error("Error inserting checklist template:", error)
        return { error: error.message, permissionDenied: isPermissionDenied(error) }
    }

    return { success: true }
}

export async function createRentalTasksForIndication(params: {
    indicacaoId: string
    nome?: string | null
    codigoInstalacao?: string | null
    creatorId: string
}) {
    const supabaseAdmin = createSupabaseServiceClient()
    const supabaseUser = await createClient()
    let writeClient: any = supabaseAdmin

    const codes = new Set<string>()
    const normalizedCode = params.codigoInstalacao?.trim()
    if (normalizedCode) codes.add(normalizedCode)

    let { data: ucs, error: ucsError } = await supabaseAdmin
        .from('energia_ucs')
        .select('codigo_instalacao')
        .eq('cliente_id', params.indicacaoId)

    if (ucsError && isPermissionDenied(ucsError)) {
        const fallback = await supabaseUser
            .from('energia_ucs')
            .select('codigo_instalacao')
            .eq('cliente_id', params.indicacaoId)

        ucs = fallback.data
        ucsError = fallback.error
    }

    if (ucsError) {
        console.error("Error fetching energia_ucs for rental task generation:", ucsError)
    }

    ;(ucs ?? []).forEach((uc: { codigo_instalacao: string | null }) => {
        const code = uc.codigo_instalacao?.trim()
        if (code) codes.add(code)
    })

    const codeList = codes.size > 0 ? Array.from(codes) : [null]
    const baseDate = new Date()
    let created = 0

    for (const code of codeList) {
        let existingQuery = writeClient
            .from('tasks')
            .select('id')
            .eq('indicacao_id', params.indicacaoId)
            .eq('brand', 'rental')
            .in('department', ['cadastro', 'CADASTRO'])
            .limit(1)

        existingQuery = code
            ? existingQuery.eq('codigo_instalacao', code)
            : existingQuery.is('codigo_instalacao', null)

        let { data: existingTasks, error: existingTaskError } = await existingQuery

        if (existingTaskError && isPermissionDenied(existingTaskError) && writeClient === supabaseAdmin) {
            writeClient = supabaseUser

            let fallbackQuery = writeClient
                .from('tasks')
                .select('id')
                .eq('indicacao_id', params.indicacaoId)
                .eq('brand', 'rental')
                .in('department', ['cadastro', 'CADASTRO'])
                .limit(1)

            fallbackQuery = code
                ? fallbackQuery.eq('codigo_instalacao', code)
                : fallbackQuery.is('codigo_instalacao', null)

            const fallback = await fallbackQuery
            existingTasks = fallback.data
            existingTaskError = fallback.error
        }

        if (existingTaskError) {
            console.error('Error checking existing rental task:', existingTaskError)
        }

        if ((existingTasks?.length ?? 0) > 0) {
            continue
        }

        const titleParts = [
            'Cadastro',
            params.nome?.trim() || 'Cliente',
            code || undefined,
        ].filter(Boolean)

        const taskPayload: Record<string, string | null> = {
            title: titleParts.join(' • '),
            status: 'TODO',
            priority: 'MEDIUM',
            department: 'cadastro',
            indicacao_id: params.indicacaoId,
            client_name: params.nome ?? null,
            codigo_instalacao: code,
            brand: 'rental',
            creator_id: params.creatorId,
        }

        const insertPayload: Record<string, string | null> = { ...taskPayload }
        const droppedColumns: string[] = []
        let retriedLegacyDepartment = false
        let taskRow: { id: string } | null = null
        let taskError: { code?: string | null; message?: string | null } | null = null

        while (true) {
            const result = await writeClient
                .from('tasks')
                .insert(insertPayload)
                .select('id')
                .single()

            taskRow = result.data
            taskError = result.error

            if (!taskError) break

            if (isPermissionDenied(taskError) && writeClient === supabaseAdmin) {
                writeClient = supabaseUser
                continue
            }

            const missingColumn = parseMissingColumnError(taskError.message)
            if (missingColumn && missingColumn.table === 'tasks' && missingColumn.column in insertPayload) {
                droppedColumns.push(missingColumn.column)
                delete insertPayload[missingColumn.column]
                continue
            }

            if (!retriedLegacyDepartment && isLegacyDepartmentConstraintError(taskError)) {
                insertPayload.department = toLegacyDepartmentValue(insertPayload.department ?? '')
                retriedLegacyDepartment = true
                continue
            }

            break
        }

        if (taskError || !taskRow) {
            console.error("Error creating rental task:", taskError)
            continue
        }

        if (droppedColumns.length > 0) {
            console.warn(
                `[createRentalTasksForIndication] Insert fallback for missing tasks columns: ${droppedColumns.join(', ')}`
            )
        }

        created += 1

        let checklistResult = await insertChecklistTemplate({
            supabase: writeClient,
            taskId: taskRow.id,
            phase: 'cadastro',
            baseDate,
            template: CADASTRO_CHECKLIST_TEMPLATE,
        })

        if (checklistResult?.permissionDenied && writeClient === supabaseAdmin) {
            writeClient = supabaseUser
            checklistResult = await insertChecklistTemplate({
                supabase: writeClient,
                taskId: taskRow.id,
                phase: 'cadastro',
                baseDate,
                template: CADASTRO_CHECKLIST_TEMPLATE,
            })
        }

        if (checklistResult?.error) {
            console.error("Error creating cadastro checklist:", checklistResult.error)
        }
    }

    revalidatePath('/admin/tarefas')
    return { success: true, created }
}

export async function activateTaskEnergisa(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, energisa_activated_at')
        .eq('id', taskId)
        .single()

    if (taskError) {
        console.error("Error fetching task for Energisa activation:", taskError)
        return { error: taskError.message }
    }

    if (task?.energisa_activated_at) {
        return { success: true, alreadyActive: true, activatedAt: task.energisa_activated_at }
    }

    const activatedAt = new Date()

    const { error: updateError } = await supabase
        .from('tasks')
        .update({ energisa_activated_at: activatedAt.toISOString() })
        .eq('id', taskId)

    if (updateError) {
        console.error("Error activating Energisa:", updateError)
        return { error: updateError.message }
    }

    const { data: existing } = await supabase
        .from('task_checklists')
        .select('id')
        .eq('task_id', taskId)
        .eq('phase', 'energisa')
        .limit(1)

    if (!existing || existing.length === 0) {
        const checklistResult = await insertChecklistTemplate({
            supabase,
            taskId,
            phase: 'energisa',
            baseDate: activatedAt,
            template: ENERGISA_CHECKLIST_TEMPLATE,
        })

        if (checklistResult?.error) {
            return { error: checklistResult.error }
        }
    }

    revalidatePath('/admin/tarefas')
    return { success: true, activatedAt: activatedAt.toISOString() }
}

export async function backfillRentalTasksFromIndicacoes() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role, department')
        .eq('id', user.id)
        .single()

    const profileDepartment = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null
    if (!profile || (!hasFullAccess(profile.role, profileDepartment) && !['supervisor'].includes(profile.role))) {
        return { error: "Sem permissão para backfill." }
    }

    const { data: indicacoes, error } = await supabaseAdmin
        .from('indicacoes')
        .select('id, nome, codigo_instalacao, marca')
        .eq('marca', 'rental')
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching indicacoes for backfill:", error)
        return { error: error.message }
    }

    let createdTotal = 0
    for (const indicacao of indicacoes ?? []) {
        const result = await createRentalTasksForIndication({
            indicacaoId: indicacao.id,
            nome: indicacao.nome,
            codigoInstalacao: indicacao.codigo_instalacao,
            creatorId: user.id,
        })
        createdTotal += result?.created ?? 0
    }

    revalidatePath('/admin/tarefas')
    return { success: true, created: createdTotal }
}

export async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const baseUpdates: Record<string, string | null> = {
        status: newStatus,
    }
    if (newStatus === 'DONE') {
        baseUpdates.completed_at = new Date().toISOString()
        baseUpdates.completed_by = user.id
    }

    async function tryUpdateStatus(client: any, updates: Record<string, string | null>) {
        let payload = { ...updates }
        let { data, error } = await client
            .from('tasks')
            .update(payload)
            .eq('id', taskId)
            .select('id')
            .maybeSingle()

        const missingColumn = parseMissingColumnError(error?.message)
        if (
            error &&
            missingColumn &&
            missingColumn.table === 'tasks' &&
            (missingColumn.column === 'completed_at' || missingColumn.column === 'completed_by')
        ) {
            delete payload.completed_at
            delete payload.completed_by
            const fallback = await client
                .from('tasks')
                .update(payload)
                .eq('id', taskId)
                .select('id')
                .maybeSingle()
            data = fallback.data
            error = fallback.error
        }

        return { data, error }
    }

    // Prefer user-scoped update to respect RLS first.
    const userScoped = await tryUpdateStatus(supabase, baseUpdates)
    if (!userScoped.error && userScoped.data?.id) {
        revalidatePath('/admin/tarefas')
        return { success: true }
    }

    // If it failed for reasons other than permissions/no-row, stop early.
    if (userScoped.error && !isPermissionDenied(userScoped.error)) {
        return { error: userScoped.error.message }
    }

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role, department')
        .eq('id', user.id)
        .maybeSingle()

    const department = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null
    if (profileError) return { error: profileError.message }
    if (!canManageTaskBoard((profile as any)?.role ?? null, department)) {
        return { error: "Sem permissão para mover tarefas." }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const adminResult = await tryUpdateStatus(supabaseAdmin, baseUpdates)
    if (adminResult.error) return { error: adminResult.error.message }
    if (!adminResult.data?.id) return { error: "Tarefa não encontrada para atualização." }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function deleteTask(taskId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function getTaskChecklists(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_checklists')
        .select('id, task_id, title, event_key, is_done, sort_order, created_at, due_date, completed_at, completed_by, phase, completed_by_user:users!task_checklists_completed_by_fkey(name, email)')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching task checklists:", error)
        return []
    }

    return data as TaskChecklistItem[]
}

export async function addTaskChecklistItem(
    taskId: string,
    title: string,
    options?: {
        dueDate?: string | null
        phase?: TaskChecklistPhase | null
        sortOrder?: number
        eventKey?: TaskChecklistEventKey
    }
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_checklists')
        .insert({
            task_id: taskId,
            title: title.trim(),
            due_date: options?.dueDate ?? null,
            phase: options?.phase ?? null,
            sort_order: options?.sortOrder ?? 0,
            event_key: options?.eventKey ?? null,
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function triggerTaskDocAlert(taskId: string, alertType: 'DOCS_INCOMPLETE' | 'DOCS_REJECTED') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, indicacao_id')
        .eq('id', taskId)
        .maybeSingle()

    if (taskError) return { error: taskError.message }
    if (!task?.indicacao_id) {
        return { error: "Esta tarefa não está vinculada a uma indicação." }
    }

    const updates =
        alertType === 'DOCS_INCOMPLETE'
            ? { doc_validation_status: 'INCOMPLETE', status: 'FALTANDO_DOCUMENTACAO' }
            : { doc_validation_status: 'REJECTED', status: 'REJEITADA' }

    const supabaseAdmin = createSupabaseServiceClient()
    const { error: updateLeadError } = await supabaseAdmin
        .from('indicacoes')
        .update(updates)
        .eq('id', task.indicacao_id)

    if (updateLeadError) return { error: updateLeadError.message }

    const interaction = buildInteractionFromChecklistEvent(alertType)
    const { error: interactionError } = await supabaseAdmin
        .from('indicacao_interactions' as any)
        .insert({
            indicacao_id: task.indicacao_id,
            user_id: user.id,
            type: interaction.type,
            content: interaction.content,
            metadata: interaction.metadata,
        } as any)

    if (interactionError) {
        console.error("Error logging doc alert interaction:", interactionError)
    }

    // If docs were previously approved in checklist, clear that marker to avoid contradiction.
    let { error: clearApprovedError } = await supabase
        .from('task_checklists')
        .update({
            is_done: false,
            completed_at: null,
            completed_by: null,
        })
        .eq('task_id', taskId)
        .eq('event_key', 'DOCS_APPROVED')

    if (clearApprovedError) {
        const missingColumn = parseMissingColumnError(clearApprovedError.message)
        if (missingColumn && missingColumn.table === 'task_checklists' && missingColumn.column === 'event_key') {
            const fallback = await supabase
                .from('task_checklists')
                .update({
                    is_done: false,
                    completed_at: null,
                    completed_by: null,
                })
                .eq('task_id', taskId)
                .ilike('title', '%document%')
                .ilike('title', '%aprov%')
            clearApprovedError = fallback.error
        }
    }

    if (clearApprovedError) {
        console.error("Error clearing approved doc checklist after alert:", clearApprovedError)
    }

    revalidatePath('/admin/tarefas')
    revalidatePath('/indicacoes')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function toggleTaskChecklistItem(itemId: string, isDone: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    let eventKeyColumnAvailable = true
    const { data: itemWithTaskData, error: itemFetchError } = await supabase
        .from('task_checklists')
        .select('id, task_id, title, event_key, task:tasks!inner(indicacao_id, brand)')
        .eq('id', itemId)
        .maybeSingle()

    let fallbackItemWithTaskData: any = null
    if (itemFetchError) {
        const missingColumn = parseMissingColumnError(itemFetchError.message)
        if (missingColumn && missingColumn.table === 'task_checklists' && missingColumn.column === 'event_key') {
            eventKeyColumnAvailable = false
            const fallback = await supabase
                .from('task_checklists')
                .select('id, task_id, title, task:tasks!inner(indicacao_id, brand)')
                .eq('id', itemId)
                .maybeSingle()

            if (fallback.error) {
                return { error: fallback.error.message }
            }
            fallbackItemWithTaskData = fallback.data
        } else {
            return { error: itemFetchError.message }
        }
    }

    const itemWithTask = (itemWithTaskData ?? fallbackItemWithTaskData) as {
        id: string
        task_id: string
        title: string | null
        event_key?: string | null
        task?: { indicacao_id: string | null; brand: Brand | null } | null
    } | null

    const rawEventKey = itemWithTask?.event_key ?? null
    const eventKey =
        (rawEventKey as TaskChecklistEventKey) ??
        inferEventKey(itemWithTask?.title)

    const { error } = await supabase
        .from('task_checklists')
        .update({
            is_done: isDone,
            completed_at: isDone ? new Date().toISOString() : null,
            completed_by: isDone ? user.id : null,
        })
        .eq('id', itemId)

    if (error) return { error: error.message }

    // Keep doc commands mutually exclusive in the same task
    if (
        isDone &&
        eventKey &&
        DOC_EVENT_KEYS.includes(eventKey) &&
        itemWithTask?.task_id &&
        eventKeyColumnAvailable
    ) {
        const { error: clearDocError } = await supabase
            .from('task_checklists')
            .update({
                is_done: false,
                completed_at: null,
                completed_by: null,
            })
            .eq('task_id', itemWithTask.task_id)
            .in('event_key', DOC_EVENT_KEYS as string[])
            .neq('id', itemId)

        if (clearDocError) {
            console.error("Error clearing other doc checklist events:", clearDocError)
        }
    }

    // Reflect key milestones/doc commands to the lead of the seller
    if (isDone && eventKey && itemWithTask?.task?.indicacao_id) {
        const indicacaoId = itemWithTask.task.indicacao_id
        const supabaseAdmin = createSupabaseServiceClient()

        const { data: indicacaoAtual } = await supabaseAdmin
            .from('indicacoes')
            .select('id, contrato_enviado_em, assinada_em')
            .eq('id', indicacaoId)
            .maybeSingle()

        const now = new Date().toISOString()
        const updates: Record<string, string> = {}

        if (eventKey === 'DOCS_APPROVED') {
            updates.doc_validation_status = 'APPROVED'
            updates.status = 'APROVADA'
        } else if (eventKey === 'DOCS_INCOMPLETE') {
            updates.doc_validation_status = 'INCOMPLETE'
            updates.status = 'FALTANDO_DOCUMENTACAO'
        } else if (eventKey === 'DOCS_REJECTED') {
            updates.doc_validation_status = 'REJECTED'
            updates.status = 'REJEITADA'
        } else if (eventKey === 'CONTRACT_SENT') {
            updates.status = 'AGUARDANDO_ASSINATURA'
            if (!indicacaoAtual?.contrato_enviado_em) {
                updates.contrato_enviado_em = now
            }
        } else if (eventKey === 'CONTRACT_SIGNED') {
            updates.status = 'CONCLUIDA'
            if (!indicacaoAtual?.contrato_enviado_em) {
                updates.contrato_enviado_em = now
            }
            if (!indicacaoAtual?.assinada_em) {
                updates.assinada_em = now
            }
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateLeadError } = await supabaseAdmin
                .from('indicacoes')
                .update(updates)
                .eq('id', indicacaoId)

            if (updateLeadError) {
                console.error("Error syncing lead from checklist event:", updateLeadError)
            } else {
                const interaction = buildInteractionFromChecklistEvent(eventKey)
                const { error: interactionError } = await supabaseAdmin
                    .from('indicacao_interactions' as any)
                    .insert({
                        indicacao_id: indicacaoId,
                        user_id: user.id,
                        type: interaction.type,
                        content: interaction.content,
                        metadata: interaction.metadata,
                    } as any)

                if (interactionError) {
                    console.error("Error logging checklist interaction:", interactionError)
                }
            }
        }
    }

    revalidatePath('/admin/tarefas')
    revalidatePath('/indicacoes')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function deleteTaskChecklistItem(itemId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_checklists')
        .delete()
        .eq('id', itemId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function getTaskComments(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_comments')
        .select(`
            id,
            task_id,
            user_id,
            parent_id,
            content,
            created_at,
            user:users(id, name, email),
            parent:task_comments!task_comments_parent_id_fkey(
                id,
                content,
                user:users(id, name, email)
            )
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching task comments:", error)
        return []
    }

    return data as TaskComment[]
}

export async function addTaskComment(taskId: string, content: string, parentId?: string | null) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const cleaned = content.trim()
    if (!cleaned) return { error: "Comentário vazio" }

    const { error } = await supabase
        .from('task_comments')
        .insert({
            task_id: taskId,
            user_id: user.id,
            parent_id: parentId ?? null,
            content: cleaned,
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function getTaskObservers(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_observers')
        .select('user_id, user:users(name, email)')
        .eq('task_id', taskId)

    if (error) {
        console.error("Error fetching task observers:", error)
        return []
    }

    return data as TaskObserver[]
}

export async function addTaskObserver(taskId: string, userId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_observers')
        .insert({
            task_id: taskId,
            user_id: userId
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function removeTaskObserver(taskId: string, userId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_observers')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}
