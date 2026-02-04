"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Department = 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'outro'
export type Brand = 'rental' | 'dorata'
export type TaskChecklistPhase = 'cadastro' | 'energisa' | 'geral'

const CADASTRO_CHECKLIST_TEMPLATE = [
    { title: 'Concluir contrato', days: 1, sort_order: 1 },
    { title: 'Enviar contrato', days: 1, sort_order: 2 },
    { title: 'Contrato assinado', days: 4, sort_order: 3 },
]

const ENERGISA_CHECKLIST_TEMPLATE = [
    { title: 'Pedido de transferência na energia feito', days: 10, sort_order: 1 },
    { title: 'Transferido', days: 10, sort_order: 2 },
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

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

export interface TaskUserOption {
    id: string
    name: string
    department: string | null
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

    const { data: checklistRows, error: checklistError } = await supabase
        .from('task_checklists')
        .select('task_id, is_done')
        .in('task_id', taskIds)

    if (checklistError) {
        console.error("Error fetching task checklists:", checklistError)
        return rows
    }

    const summary = new Map<string, { total: number; done: number }>()
    ;(checklistRows ?? []).forEach((item: any) => {
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
        .select('id, name, department, status')
        .order('name')

    if (error) {
        console.error("Error fetching users for tasks:", error)
        return []
    }

    return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name || "Sem Nome",
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

    const { data: inserted, error } = await supabase
        .from('tasks')
        .insert({
            ...data,
            creator_id: user.id
        })
        .select('id')
        .single()

    if (error) {
        console.error("Error creating task:", error)
        return { error: error.message }
    }

    const observerIds = Array.from(new Set((data.observer_ids ?? []).filter(Boolean)))
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

    revalidatePath('/admin/tarefas')
    return { success: true }
}

async function insertChecklistTemplate(params: {
    supabase: any
    taskId: string
    phase: TaskChecklistPhase
    baseDate: Date
    template: { title: string; days: number; sort_order: number }[]
}) {
    const payload = params.template.map((item) => ({
        task_id: params.taskId,
        title: item.title,
        phase: params.phase,
        sort_order: item.sort_order,
        due_date: addDays(params.baseDate, item.days).toISOString(),
    }))

    const { error } = await params.supabase
        .from('task_checklists')
        .insert(payload)

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
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['adm_mestre', 'adm_dorata', 'supervisor'].includes(profile.role)) {
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

    // Authorization check is handled by RLS, but good to be safe
    const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

    if (error) return { error: error.message }

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
        .select('id, task_id, title, is_done, sort_order, created_at, due_date, completed_at, completed_by, phase, completed_by_user:users!task_checklists_completed_by_fkey(name, email)')
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
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function toggleTaskChecklistItem(itemId: string, isDone: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from('task_checklists')
        .update({
            is_done: isDone,
            completed_at: isDone ? new Date().toISOString() : null,
            completed_by: isDone ? user.id : null,
        })
        .eq('id', itemId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
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
