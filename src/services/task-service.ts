"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasFullAccess, type UserProfile } from "@/lib/auth"
import {
    createIndicationNotificationEvent,
    createTaskChecklistNotifications,
    createTaskCommentNotifications,
    createTaskStatusChangedNotifications,
} from "@/services/notification-service"
import { revalidatePath } from "next/cache"

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Department = 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'obras' | 'outro'
export type Brand = 'rental' | 'dorata'
export type TaskVisibilityScope = 'TEAM' | 'RESTRICTED'
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

function addDays(base: Date, days: number) {
    return new Date(base.getTime() + days * MS_PER_DAY)
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null

    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null

    return { column: match[1], table: match[2] }
}

function sanitizeTaskSearchTerm(value?: string | null) {
    if (!value) return ""
    return value
        .replace(/[(),%]/g, " ")
        .replace(/'/g, "")
        .trim()
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

function normalizeChecklistPhaseValue(value?: string | null): TaskChecklistPhase | null {
    if (!value) return null

    const normalized = value.trim().toLowerCase()
    if (!normalized) return null

    if (normalized.includes('cadastro')) return 'cadastro'
    if (normalized.includes('energisa')) return 'energisa'
    if (normalized.includes('geral') || normalized.includes('general')) return 'geral'

    return null
}

type TaskLeadLink = {
    id: string
    indicacao_id: string | null
    proposal_id?: string | null
    codigo_instalacao?: string | null
}

async function resolveTaskIndicacaoId(supabase: any, task: TaskLeadLink): Promise<string | null> {
    if (task.indicacao_id) return task.indicacao_id

    let resolvedId: string | null = null

    if (task.proposal_id) {
        const { data: proposalData, error: proposalError } = await supabase
            .from('proposals')
            .select('client_id')
            .eq('id', task.proposal_id)
            .maybeSingle()

        if (proposalError) {
            console.error("Error resolving indicacao_id from proposal:", proposalError)
        } else if (proposalData?.client_id) {
            resolvedId = proposalData.client_id
        }
    }

    if (!resolvedId && task.codigo_instalacao) {
        const { data: leadByInstall, error: leadByInstallError } = await supabase
            .from('indicacoes')
            .select('id')
            .eq('codigo_instalacao', task.codigo_instalacao)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (leadByInstallError) {
            console.error("Error resolving indicacao_id from installation code:", leadByInstallError)
        } else if (leadByInstall?.id) {
            resolvedId = leadByInstall.id
        }
    }

    if (!resolvedId) return null

    const { error: linkError } = await supabase
        .from('tasks')
        .update({ indicacao_id: resolvedId })
        .eq('id', task.id)

    if (linkError) {
        console.error("Error linking task to resolved indication:", linkError)
    }

    return resolvedId
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

function getIndicationNotificationEventForChecklist(eventKey: Exclude<TaskChecklistEventKey, null>) {
    if (eventKey === 'DOCS_APPROVED' || eventKey === 'DOCS_INCOMPLETE' || eventKey === 'DOCS_REJECTED') {
        return {
            eventKey: 'INDICATION_DOC_VALIDATION_CHANGED' as const,
            title: 'Validação de documentos atualizada',
            message: 'Documentação da indicação foi atualizada via checklist de tarefa.',
        }
    }

    return {
        eventKey: 'INDICATION_CONTRACT_MILESTONE' as const,
        title: 'Marco de contrato da indicação atualizado',
        message: 'Status de contrato/comissão da indicação foi atualizado via checklist de tarefa.',
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
    contact_id: string | null
    proposal_id: string | null
    visibility_scope?: TaskVisibilityScope | null
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

export interface TaskProposalOption {
    id: string
    status: string | null
    total_value: number | null
    created_at: string
    client_id: string | null
    contact_id: string | null
    client_name: string | null
    codigo_instalacao: string | null
    brand: Brand | null
    contact_name: string | null
}

export async function getTasks(filters?: {
    department?: Department,
    assigneeId?: string,
    showAll?: boolean,
    brand?: Brand,
    search?: string
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

    const sanitizedSearch = sanitizeTaskSearchTerm(filters?.search)
    if (sanitizedSearch) {
        query = query.or(
            `client_name.ilike.%${sanitizedSearch}%,codigo_instalacao.ilike.%${sanitizedSearch}%`
        )
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
        .select('id, nome, documento, unidade_consumidora, codigo_cliente, codigo_instalacao, marca, telefone, email')
        .limit(20)

    if (brand) {
        query = query.eq('marca', brand)
    }

    if (search) {
        const sanitized = search.replace(/[(),']/g, " ").trim()
        if (sanitized) {
            query = query.or(
                `nome.ilike.%${sanitized}%,documento.ilike.%${sanitized}%,codigo_instalacao.ilike.%${sanitized}%,codigo_cliente.ilike.%${sanitized}%,unidade_consumidora.ilike.%${sanitized}%,telefone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
            )
        }
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

export async function getTaskContactById(contactId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, whatsapp, phone, mobile')
        .eq('id', contactId)
        .maybeSingle()

    if (error) {
        console.error("Error fetching task contact:", error)
        return null
    }

    return data as TaskContactOption | null
}

export async function getTaskProposalOptions(brand?: Brand) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const internalProposalLookupRoles = new Set([
        'adm_mestre',
        'adm_dorata',
        'supervisor',
        'suporte',
        'suporte_tecnico',
        'suporte_limitado',
        'funcionario_n1',
        'funcionario_n2',
    ])

    const { data: profileData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

    const profileRole = (profileData as { role?: string | null } | null)?.role ?? null
    let proposalsClient: any = supabase
    if (profileRole && internalProposalLookupRoles.has(profileRole)) {
        try {
            proposalsClient = createSupabaseServiceClient()
        } catch (error) {
            console.error("Error creating admin client for proposal options:", error)
        }
    }

    let selectColumns = `
        id,
        status,
        total_value,
        created_at,
        client_id,
        contact_id,
        cliente:indicacoes!proposals_client_id_fkey(nome, codigo_instalacao, marca)
    `

    let { data, error } = await proposalsClient
        .from('proposals')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .limit(80)

    if (error) {
        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn && missingColumn.table === 'proposals' && missingColumn.column === 'contact_id') {
            selectColumns = `
                id,
                status,
                total_value,
                created_at,
                client_id,
                cliente:indicacoes!proposals_client_id_fkey(nome, codigo_instalacao, marca)
            `

            const fallback = await proposalsClient
                .from('proposals')
                .select(selectColumns)
                .order('created_at', { ascending: false })
                .limit(80)

            data = fallback.data as any
            error = fallback.error
        }
    }

    if (error) {
        console.error("Error fetching proposal options for tasks:", error)
        return []
    }

    type ProposalRow = {
        id: string
        status: string | null
        total_value: number | null
        created_at: string
        client_id: string | null
        contact_id?: string | null
        cliente?:
        | { nome: string | null; codigo_instalacao: string | null; marca: Brand | null }
        | { nome: string | null; codigo_instalacao: string | null; marca: Brand | null }[]
        | null
    }

    const mapped = ((data ?? []) as ProposalRow[]).map((row) => {
        const clientRaw = row.cliente
        const client = Array.isArray(clientRaw) ? (clientRaw[0] ?? null) : (clientRaw ?? null)

        return {
            id: row.id,
            status: row.status ?? null,
            total_value: row.total_value ?? null,
            created_at: row.created_at,
            client_id: row.client_id ?? null,
            contact_id: row.contact_id ?? null,
            client_name: client?.nome ?? null,
            codigo_instalacao: client?.codigo_instalacao ?? null,
            brand: client?.marca ?? null,
            contact_name: null,
        } satisfies TaskProposalOption
    })

    if (!brand) return mapped
    return mapped.filter((item) => item.brand === brand)
}

export async function createTask(data: {
    title: string
    description?: string
    priority: TaskPriority
    due_date?: string
    assignee_id?: string
    department?: Department
    indicacao_id?: string
    contact_id?: string
    proposal_id?: string
    client_name?: string
    codigo_instalacao?: string
    status?: TaskStatus
    brand?: Brand
    visibility_scope?: TaskVisibilityScope
    observer_ids?: string[]
    confirm_duplicate?: boolean
    allow_duplicate?: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const visibilityScope = data.visibility_scope ?? 'TEAM'
    const {
        observer_ids: observerIdsRaw,
        description: descriptionRaw,
        confirm_duplicate: confirmDuplicate,
        allow_duplicate: allowDuplicate,
        ...taskData
    } = data
    const description = descriptionRaw?.trim()
    const nowIso = new Date().toISOString()
    const internalProposalLookupRoles = new Set([
        'adm_mestre',
        'adm_dorata',
        'supervisor',
        'suporte',
        'suporte_tecnico',
        'suporte_limitado',
        'funcionario_n1',
        'funcionario_n2',
    ])

    const { data: profileData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

    const profileRole = (profileData as { role?: string | null } | null)?.role ?? null

    if (taskData.proposal_id) {
        let proposalClient: any = supabase
        if (profileRole && internalProposalLookupRoles.has(profileRole)) {
            try {
                proposalClient = createSupabaseServiceClient()
            } catch (error) {
                console.error("Error creating admin client for proposal/task link:", error)
            }
        }

        let { data: proposalData, error: proposalError } = await proposalClient
            .from('proposals')
            .select(`
                id,
                client_id,
                contact_id,
                cliente:indicacoes!proposals_client_id_fkey(nome, codigo_instalacao, marca)
            `)
            .eq('id', taskData.proposal_id)
            .maybeSingle()

        if (proposalError) {
            const missingColumn = parseMissingColumnError(proposalError.message)
            if (missingColumn && missingColumn.table === 'proposals' && missingColumn.column === 'contact_id') {
                const fallback = await proposalClient
                    .from('proposals')
                    .select(`
                        id,
                        client_id,
                        cliente:indicacoes!proposals_client_id_fkey(nome, codigo_instalacao, marca)
                    `)
                    .eq('id', taskData.proposal_id)
                    .maybeSingle()

                proposalData = fallback.data as any
                proposalError = fallback.error
            }
        }

        if (proposalError) {
            console.error("Error fetching proposal for task link:", proposalError)
            return { error: proposalError.message }
        }

        if (!proposalData) {
            return { error: "Orçamento não encontrado ou sem acesso para vincular." }
        }

        const proposal = proposalData as {
            client_id?: string | null
            contact_id?: string | null
            cliente?:
            | { nome: string | null; codigo_instalacao: string | null; marca: Brand | null }
            | { nome: string | null; codigo_instalacao: string | null; marca: Brand | null }[]
            | null
        }

        const clientRaw = proposal.cliente
        const client = Array.isArray(clientRaw) ? (clientRaw[0] ?? null) : (clientRaw ?? null)

        if (!taskData.indicacao_id && proposal.client_id) {
            taskData.indicacao_id = proposal.client_id
        }
        if (!taskData.contact_id && proposal.contact_id) {
            taskData.contact_id = proposal.contact_id
        }
        if (!taskData.client_name && client?.nome) {
            taskData.client_name = client.nome
        }
        if (!taskData.codigo_instalacao && client?.codigo_instalacao) {
            taskData.codigo_instalacao = client.codigo_instalacao
        }
        if (client?.marca) {
            taskData.brand = client.marca
        }
    }

    if (confirmDuplicate && !allowDuplicate) {
        const normalizedTitle = taskData.title?.trim()
        const normalizedClientName = taskData.client_name?.trim() || null
        const normalizedInstallationCode = taskData.codigo_instalacao?.trim() || null
        const normalizedDepartment = taskData.department ?? null

        if (normalizedTitle) {
            const duplicateStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED']
            let duplicateQuery = supabase
                .from('tasks')
                .select('id, title, status, created_at')
                .eq('title', normalizedTitle)
                .in('status', duplicateStatuses)
                .limit(5)
                .order('created_at', { ascending: false })

            if (taskData.brand) {
                duplicateQuery = duplicateQuery.eq('brand', taskData.brand)
            }

            if (normalizedDepartment) {
                duplicateQuery = duplicateQuery.in('department', [normalizedDepartment, toLegacyDepartmentValue(normalizedDepartment)])
            }

            if (taskData.indicacao_id) {
                duplicateQuery = duplicateQuery.eq('indicacao_id', taskData.indicacao_id)
            } else if (taskData.contact_id) {
                duplicateQuery = duplicateQuery.eq('contact_id', taskData.contact_id)
            } else if (taskData.proposal_id) {
                duplicateQuery = duplicateQuery.eq('proposal_id', taskData.proposal_id)
            } else if (normalizedInstallationCode) {
                duplicateQuery = duplicateQuery.eq('codigo_instalacao', normalizedInstallationCode)
            } else if (normalizedClientName) {
                duplicateQuery = duplicateQuery.eq('client_name', normalizedClientName)
            }

            const { data: duplicateRows, error: duplicateQueryError } = await duplicateQuery

            if (duplicateQueryError) {
                console.error("Error checking duplicate tasks:", duplicateQueryError)
            } else if ((duplicateRows?.length ?? 0) > 0) {
                return {
                    requires_duplicate_confirmation: true as const,
                    duplicate_count: duplicateRows?.length ?? 0,
                    duplicate_task_ids: (duplicateRows ?? []).map((row: any) => row.id as string),
                    duplicate_title: normalizedTitle,
                }
            }
        }
    }

    // Avoid INSERT ... RETURNING here: creator may not have SELECT access on RESTRICTED tasks.
    const taskId = crypto.randomUUID()
    const payload: Record<string, any> = {
        id: taskId,
        ...taskData,
        visibility_scope: visibilityScope,
        description: description || null,
        creator_id: user.id,
        completed_at: taskData.status === 'DONE' ? nowIso : null,
        completed_by: taskData.status === 'DONE' ? user.id : null,
    }

    let error: { message?: string | null } | null = null

    while (true) {
        const insertResult = await supabase
            .from('tasks')
            .insert(payload)

        error = insertResult.error

        if (!error) break

        const missingColumn = parseMissingColumnError(error.message)
        if (!missingColumn || missingColumn.table !== 'tasks') break

        if (missingColumn.column === 'completed_at' || missingColumn.column === 'completed_by') {
            delete payload.completed_at
            delete payload.completed_by
            continue
        }

        if (missingColumn.column === 'visibility_scope') {
            delete payload.visibility_scope
            continue
        }

        if (missingColumn.column === 'contact_id' || missingColumn.column === 'proposal_id') {
            delete payload[missingColumn.column]
            continue
        }

        break
    }

    if (error) {
        console.error("Error creating task:", error)
        return { error: error.message }
    }

    const observerIds = Array.from(new Set(observerIdsRaw ?? [])).filter(Boolean)
    if (observerIds.length > 0) {
        const { error: observersError } = await supabase
            .from('task_observers')
            .insert(observerIds.map((observerId) => ({
                task_id: taskId,
                user_id: observerId,
            })))

        if (observersError) {
            console.error("Error creating task observers:", observersError)
            return { error: observersError.message }
        }
    }

    if (description) {
        const { error: commentError } = await supabase
            .from('task_comments')
            .insert({
                task_id: taskId,
                user_id: user.id,
                content: description,
            })

        if (commentError) {
            console.error("Error creating task comment:", commentError)
            return { error: commentError.message }
        }
    }

    revalidatePath('/admin/tarefas')
    return { success: true, taskId }
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

    let previousStatus: string | null = null
    const { data: currentTask, error: currentTaskError } = await supabase
        .from('tasks')
        .select('status')
        .eq('id', taskId)
        .maybeSingle()

    if (!currentTaskError && currentTask) {
        previousStatus = (currentTask as { status?: string | null }).status ?? null
    }

    const nowIso = new Date().toISOString()
    const baseUpdates: Record<string, string | null> = {
        status: newStatus,
    }
    if (newStatus === 'DONE') {
        baseUpdates.completed_at = nowIso
        baseUpdates.completed_by = user.id
    }

    async function tryUpdateStatus(client: any, updates: Record<string, string | null>) {
        const payload = { ...updates }
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
        if (previousStatus !== newStatus) {
            try {
                await createTaskStatusChangedNotifications({
                    taskId,
                    actorUserId: user.id,
                    oldStatus: previousStatus,
                    newStatus,
                    dedupeToken: nowIso,
                })
            } catch (notificationError) {
                console.error("Error creating task status changed notification:", notificationError)
            }
        }
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

    if (profileError) return { error: profileError.message }
    const role = (profile as { role?: string | null } | null)?.role ?? null
    if (role !== 'adm_mestre') {
        return { error: "Sem permissão para mover tarefas." }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    if (!previousStatus) {
        const { data: currentTaskAdmin, error: currentTaskAdminError } = await supabaseAdmin
            .from('tasks')
            .select('status')
            .eq('id', taskId)
            .maybeSingle()

        if (!currentTaskAdminError && currentTaskAdmin) {
            previousStatus = (currentTaskAdmin as { status?: string | null }).status ?? null
        }
    }

    const adminResult = await tryUpdateStatus(supabaseAdmin, baseUpdates)
    if (adminResult.error) return { error: adminResult.error.message }
    if (!adminResult.data?.id) return { error: "Tarefa não encontrada para atualização." }

    if (previousStatus !== newStatus) {
        try {
            await createTaskStatusChangedNotifications({
                taskId,
                actorUserId: user.id,
                oldStatus: previousStatus,
                newStatus,
                dedupeToken: nowIso,
            })
        } catch (notificationError) {
            console.error("Error creating task status changed notification:", notificationError)
        }
    }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
    const supabase = await createClient()
    const payload: Record<string, any> = { ...updates }

    while (true) {
        const { error } = await supabase
            .from('tasks')
            .update(payload)
            .eq('id', taskId)

        if (!error) break

        const missingColumn = parseMissingColumnError(error.message)
        if (
            missingColumn &&
            missingColumn.table === 'tasks' &&
            missingColumn.column in payload
        ) {
            delete payload[missingColumn.column]
            continue
        }

        return { error: error.message }
    }

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

    let { data, error } = await supabase
        .from('task_checklists')
        .select('id, task_id, title, event_key, is_done, sort_order, created_at, due_date, completed_at, completed_by, phase, completed_by_user:users!task_checklists_completed_by_fkey(name, email)')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error && /relationship between 'task_checklists' and 'users'/i.test(error.message ?? '')) {
        const fallback = await supabase
            .from('task_checklists')
            .select('id, task_id, title, event_key, is_done, sort_order, created_at, due_date, completed_at, completed_by, phase')
            .eq('task_id', taskId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })

        data = fallback.data as any
        error = fallback.error
    }

    if (error) {
        console.error("Error fetching task checklists:", error)
        return []
    }

    return ((data ?? []) as any[]).map((item) => ({
        ...item,
        phase: normalizeChecklistPhaseValue(item.phase),
    })) as TaskChecklistItem[]
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
        .select('id, indicacao_id, proposal_id, codigo_instalacao')
        .eq('id', taskId)
        .maybeSingle()

    if (taskError) return { error: taskError.message }
    const resolvedIndicacaoId = task
        ? await resolveTaskIndicacaoId(supabase, task as TaskLeadLink)
        : null

    if (!resolvedIndicacaoId) {
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
        .eq('id', resolvedIndicacaoId)

    if (updateLeadError) return { error: updateLeadError.message }

    const interaction = buildInteractionFromChecklistEvent(alertType)
    const { error: interactionError } = await supabaseAdmin
        .from('indicacao_interactions' as any)
        .insert({
            indicacao_id: resolvedIndicacaoId,
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
        .select('id, task_id, title, event_key, task:tasks!inner(id, indicacao_id, brand, proposal_id, codigo_instalacao)')
        .eq('id', itemId)
        .maybeSingle()

    let fallbackItemWithTaskData: any = null
    if (itemFetchError) {
        const missingColumn = parseMissingColumnError(itemFetchError.message)
        if (missingColumn && missingColumn.table === 'task_checklists' && missingColumn.column === 'event_key') {
            eventKeyColumnAvailable = false
            const fallback = await supabase
                .from('task_checklists')
                .select('id, task_id, title, task:tasks!inner(id, indicacao_id, brand, proposal_id, codigo_instalacao)')
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
        task?: {
            id: string
            indicacao_id: string | null
            brand: Brand | null
            proposal_id: string | null
            codigo_instalacao: string | null
        } | null
    } | null

    const rawEventKey = itemWithTask?.event_key ?? null
    const eventKey =
        (rawEventKey as TaskChecklistEventKey) ??
        inferEventKey(itemWithTask?.title)

    let resolvedIndicacaoId = itemWithTask?.task?.indicacao_id ?? null
    if (isDone && eventKey && itemWithTask?.task) {
        resolvedIndicacaoId = await resolveTaskIndicacaoId(supabase, itemWithTask.task as TaskLeadLink)
        if (!resolvedIndicacaoId) {
            return { error: "Vincule a tarefa a uma indicação antes de concluir este checklist." }
        }
    }

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

    try {
        await createTaskChecklistNotifications({
            taskId: itemWithTask?.task_id ?? "",
            checklistItemId: itemId,
            checklistTitle: itemWithTask?.title ?? "",
            isDone,
            actorUserId: user.id,
        })
    } catch (notificationError) {
        console.error("Error creating task checklist notifications:", notificationError)
    }

    // Reflect key milestones/doc commands to the lead of the seller
    if (isDone && eventKey && resolvedIndicacaoId) {
        const indicacaoId = resolvedIndicacaoId
        let supabaseAdmin: any
        try {
            supabaseAdmin = createSupabaseServiceClient()
        } catch (error) {
            console.error("Error creating service client for checklist sync. Falling back to user client:", error)
            supabaseAdmin = supabase
        }

        const { data: indicacaoAtual } = await supabaseAdmin
            .from('indicacoes')
            .select('id, status, contrato_enviado_em, assinada_em')
            .eq('id', indicacaoId)
            .maybeSingle()

        const now = new Date().toISOString()
        const leadUpdates: Record<string, string> = {}
        let nextStatus: string | null = null

        if (eventKey === 'DOCS_APPROVED') {
            leadUpdates.doc_validation_status = 'APPROVED'
            nextStatus = 'APROVADA'
        } else if (eventKey === 'DOCS_INCOMPLETE') {
            leadUpdates.doc_validation_status = 'INCOMPLETE'
            nextStatus = 'FALTANDO_DOCUMENTACAO'
        } else if (eventKey === 'DOCS_REJECTED') {
            leadUpdates.doc_validation_status = 'REJECTED'
            nextStatus = 'REJEITADA'
        } else if (eventKey === 'CONTRACT_SENT') {
            nextStatus = 'AGUARDANDO_ASSINATURA'
            if (!indicacaoAtual?.contrato_enviado_em) {
                leadUpdates.contrato_enviado_em = now
            }
        } else if (eventKey === 'CONTRACT_SIGNED') {
            nextStatus = 'CONCLUIDA'
            if (!indicacaoAtual?.contrato_enviado_em) {
                leadUpdates.contrato_enviado_em = now
            }
            if (!indicacaoAtual?.assinada_em) {
                leadUpdates.assinada_em = now
            }
        }

        // Prevent regressions when an older event arrives after a newer one.
        if (
            nextStatus === 'APROVADA' &&
            (
                indicacaoAtual?.status === 'AGUARDANDO_ASSINATURA' ||
                indicacaoAtual?.status === 'CONCLUIDA' ||
                Boolean(indicacaoAtual?.contrato_enviado_em) ||
                Boolean(indicacaoAtual?.assinada_em)
            )
        ) {
            nextStatus = null
        }

        if (
            nextStatus === 'AGUARDANDO_ASSINATURA' &&
            (indicacaoAtual?.status === 'CONCLUIDA' || Boolean(indicacaoAtual?.assinada_em))
        ) {
            nextStatus = null
        }

        let syncLeadError: { message?: string | null } | null = null
        let syncedLead = false
        let statusChanged = false

        if (Object.keys(leadUpdates).length > 0) {
            const { error: updateLeadFieldsError } = await supabaseAdmin
                .from('indicacoes')
                .update(leadUpdates)
                .eq('id', indicacaoId)

            if (updateLeadFieldsError) {
                syncLeadError = updateLeadFieldsError
            } else {
                syncedLead = true
            }
        }

        if (!syncLeadError && nextStatus) {
            let statusQuery = supabaseAdmin
                .from('indicacoes')
                .update({ status: nextStatus })
                .eq('id', indicacaoId)

            if (nextStatus === 'AGUARDANDO_ASSINATURA') {
                statusQuery = statusQuery
                    .neq('status', 'CONCLUIDA')
                    .is('assinada_em', null)
            } else if (nextStatus === 'APROVADA') {
                statusQuery = statusQuery
                    .neq('status', 'CONCLUIDA')
                    .is('contrato_enviado_em', null)
                    .is('assinada_em', null)
            }

            const { data: syncedStatusRows, error: syncStatusError } = await statusQuery
                .select('id')

            if (syncStatusError) {
                syncLeadError = syncStatusError
            } else if ((syncedStatusRows?.length ?? 0) > 0) {
                syncedLead = true
                statusChanged = true
            }
        }

        if (syncLeadError) {
            console.error("Error syncing lead from checklist event:", syncLeadError)
            return {
                error: "Checklist atualizado, mas não foi possível sincronizar a indicação vinculada.",
            }
        } else if (syncedLead) {
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

            try {
                const indicationEvent = getIndicationNotificationEventForChecklist(eventKey)
                await createIndicationNotificationEvent({
                    eventKey: indicationEvent.eventKey,
                    indicacaoId,
                    actorUserId: user.id,
                    title: indicationEvent.title,
                    message: indicationEvent.message,
                    dedupeToken: `task-checklist:${itemId}:${eventKey}:${isDone ? 'done' : 'todo'}`,
                    metadata: {
                        source: 'task_checklist',
                        task_id: itemWithTask?.task_id ?? null,
                        checklist_item_id: itemId,
                        checklist_event_key: eventKey,
                        new_status: leadUpdates.doc_validation_status ?? nextStatus ?? null,
                    },
                })

                if (statusChanged && nextStatus) {
                    await createIndicationNotificationEvent({
                        eventKey: 'INDICATION_STATUS_CHANGED',
                        indicacaoId,
                        actorUserId: user.id,
                        title: 'Status da indicação alterado',
                        message: `Status da indicação atualizado para ${nextStatus}.`,
                        dedupeToken: `task-checklist-status:${itemId}:${nextStatus}`,
                        metadata: {
                            source: 'task_checklist',
                            task_id: itemWithTask?.task_id ?? null,
                            checklist_item_id: itemId,
                            new_status: nextStatus,
                        },
                    })
                }
            } catch (notificationError) {
                console.error("Error creating indication notifications from checklist sync:", notificationError)
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: taskAccess, error: taskAccessError } = await supabase
        .from('tasks')
        .select('id')
        .eq('id', taskId)
        .maybeSingle()

    if (taskAccessError) {
        console.error("Error checking task access for comments:", taskAccessError)
        return []
    }
    if (!taskAccess) return []

    const { data, error } = await supabase
        .from('task_comments')
        .select('id, task_id, user_id, parent_id, content, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching task comments:", error)
        return []
    }

    type CommentRow = {
        id: string
        task_id: string
        user_id: string | null
        parent_id: string | null
        content: string
        created_at: string
    }

    type UserRow = {
        id: string
        name: string | null
        email: string | null
    }

    const commentRows = (data ?? []) as CommentRow[]
    const userIds = Array.from(
        new Set(
            commentRows
                .map((row) => row.user_id)
                .filter((id): id is string => Boolean(id))
        )
    )

    const usersById = new Map<string, UserRow>()
    if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', userIds)

        if (usersError) {
            console.error("Error fetching users for task comments:", usersError)
        } else {
            ;(usersData as UserRow[]).forEach((item) => {
                usersById.set(item.id, item)
            })
        }
    }

    const commentsById = new Map<string, CommentRow>()
    commentRows.forEach((row) => commentsById.set(row.id, row))

    const mapped = commentRows.map((row) => {
        const author = row.user_id ? usersById.get(row.user_id) ?? null : null
        const parentRow = row.parent_id ? commentsById.get(row.parent_id) ?? null : null
        const parentAuthor = parentRow?.user_id ? usersById.get(parentRow.user_id) ?? null : null

        return {
            id: row.id,
            task_id: row.task_id,
            user_id: row.user_id,
            parent_id: row.parent_id,
            content: row.content,
            created_at: row.created_at,
            user: author
                ? { id: author.id, name: author.name, email: author.email }
                : null,
            parent: parentRow
                ? {
                    id: parentRow.id,
                    content: parentRow.content,
                    user: parentAuthor
                        ? { id: parentAuthor.id, name: parentAuthor.name, email: parentAuthor.email }
                        : null,
                }
                : null,
        }
    })

    return mapped as TaskComment[]
}

export async function addTaskComment(
    taskId: string,
    content: string,
    parentId?: string | null,
    mentionUserIds?: string[]
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const cleaned = content.trim()
    if (!cleaned) return { error: "Comentário vazio" }

    const { data: taskAccess, error: taskAccessError } = await supabase
        .from('tasks')
        .select('id')
        .eq('id', taskId)
        .maybeSingle()

    if (taskAccessError) {
        console.error("Error checking task access for comment creation:", taskAccessError)
        return { error: "Sem permissão para comentar nesta tarefa." }
    }
    if (!taskAccess) {
        return { error: "Sem permissão para comentar nesta tarefa." }
    }

    if (parentId) {
        const { data: parentComment, error: parentError } = await supabase
            .from('task_comments')
            .select('id')
            .eq('id', parentId)
            .eq('task_id', taskId)
            .maybeSingle()

        if (parentError) {
            console.error("Error validating parent task comment:", parentError)
            return { error: parentError.message }
        }
        if (!parentComment) {
            return { error: "Comentário de referência inválido para esta tarefa." }
        }
    }

    const { data: insertedComment, error } = await supabase
        .from('task_comments')
        .insert({
            task_id: taskId,
            user_id: user.id,
            parent_id: parentId ?? null,
            content: cleaned,
        })
        .select('id')
        .maybeSingle()

    if (error) return { error: error.message }

    if (!insertedComment?.id) {
        return { error: "Comentário criado, mas não foi possível confirmar o registro." }
    }

    try {
        await createTaskCommentNotifications({
            taskId,
            commentId: insertedComment.id,
            actorUserId: user.id,
            content: cleaned,
            parentCommentId: parentId ?? null,
            mentionUserIds,
        })
    } catch (notificationError) {
        console.error("Error creating task comment notifications:", notificationError)
    }

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

    return data as unknown as TaskObserver[]
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
