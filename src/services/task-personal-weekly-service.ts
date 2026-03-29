import { createClient } from "@/lib/supabase/server"
import { differenceInBusinessDays } from "@/lib/business-days"
import type { Brand, Department, Task, TaskChecklistDecision, TaskPriority, TaskStatus } from "@/services/task-service"
import { getTasks } from "@/services/task-service"
import {
    PERSONAL_WEEK_TIMEZONE,
    compareTasksByImportance,
    filterOpenBlockers,
    getCurrentWeekDateKeys,
    isDueInCurrentWeek,
    isOverdue,
} from "@/services/task-personal-weekly-utils"

type TaskBlockerOwnerType = "USER" | "DEPARTMENT"

type TaskBlockerRow = {
    id: string
    task_id: string
    status: string
    owner_type: string
    owner_user_id: string | null
    owner_department: string | null
    reason: string
    expected_unblock_at: string
    opened_at: string
}

type ChecklistPendingRow = {
    id: string
    task_id: string
    title: string
    due_date: string | null
    phase: string | null
    decision_status?: string | null
    is_done: boolean
    responsible_user_id?: string | null
    created_at: string
}

type UserNameRow = {
    id: string
    name: string | null
    email: string | null
}

type ExtraTaskRow = {
    id: string
    title: string | null
    status: TaskStatus
    priority: TaskPriority
    due_date: string | null
    assignee_id: string | null
    creator_id: string | null
    department: string | null
    created_at: string
    updated_at: string
    brand?: Brand | null
    assignee?: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    creator?: { name: string | null } | { name: string | null }[] | null
}

export type TaskPersonalSummaryTask = {
    taskId: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    department: Department
    dueDate: string | null
    overdue: boolean
    dueInCurrentWeek: boolean
    assigneeName: string
    creatorName: string
    blockerCount: number
    oldestBlockerOpenedAt: string | null
    createdAt: string
    /** ISO timestamp of the most recent IN_PROGRESS event, or null if not found. */
    inProgressAt: string | null
}

export type TaskPersonalDependencyGroup = {
    ownerType: TaskBlockerOwnerType
    ownerKey: string
    ownerLabel: string
    blockedTasks: number
    blockers: number
    oldestBlockerOpenedAt: string | null
    tasks: TaskPersonalSummaryTask[]
}

export type TaskPersonalChecklistPending = {
    checklistItemId: string
    checklistTitle: string
    phase: string | null
    decisionStatus: TaskChecklistDecision | null
    dueDate: string | null
    createdAt: string
    task: TaskPersonalSummaryTask
}

export type TaskPersonalWeeklySummary = {
    generatedAt: string
    timeZone: string
    weekStartDate: string
    weekEndDate: string
    cards: {
        maisImportantes: number
        emAndamento: number
        travadas: number
        vencendoOuAtrasadas: number
        obrasAtivas: number
    }
    importantTasks: TaskPersonalSummaryTask[]
    blockedByDependency: {
        byUser: TaskPersonalDependencyGroup[]
        byDepartment: TaskPersonalDependencyGroup[]
        oldestBlockedTasks: TaskPersonalSummaryTask[]
    }
    inProgressTasks: TaskPersonalSummaryTask[]
    tasksByRole: {
        assignee: TaskPersonalSummaryTask[]
        observer: TaskPersonalSummaryTask[]
        creator: TaskPersonalSummaryTask[]
    }
    pendingChecklistItems: TaskPersonalChecklistPending[]
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null
    return {
        column: match[1],
        table: match[2],
    }
}

function isMissingRelationError(error?: { code?: string | null; message?: string | null } | null, relation?: string) {
    if (!error) return false
    if (error.code === "42P01") return true
    const message = (error.message ?? "").toLowerCase()
    if (!message.includes("does not exist")) return false
    if (!relation) return true
    return message.includes(relation.toLowerCase())
}

function toDepartment(value?: string | null): Department {
    const normalized = (value ?? "").trim().toLowerCase()
    if (normalized === "vendas") return "vendas"
    if (normalized === "cadastro") return "cadastro"
    if (normalized === "energia") return "energia"
    if (normalized === "juridico") return "juridico"
    if (normalized === "financeiro") return "financeiro"
    if (normalized === "ti") return "ti"
    if (normalized === "diretoria") return "diretoria"
    if (normalized === "obras") return "obras"
    return "outro"
}

function formatDepartmentLabel(department: string) {
    if (department === "vendas") return "Vendas"
    if (department === "cadastro") return "Cadastro"
    if (department === "energia") return "Energia"
    if (department === "juridico") return "Jurídico"
    if (department === "financeiro") return "Financeiro"
    if (department === "ti") return "TI"
    if (department === "diretoria") return "Diretoria"
    if (department === "obras") return "Obras"
    return "Outro"
}

function parseDate(value?: string | null) {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
}

function compareIsoAsc(a: string | null, b: string | null) {
    if (a && b) {
        const aDate = parseDate(a)
        const bDate = parseDate(b)
        if (aDate && bDate) return aDate.getTime() - bDate.getTime()
    }
    if (a && !b) return -1
    if (!a && b) return 1
    return 0
}

function unwrapSingleRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    if (Array.isArray(value)) return value[0] ?? null
    return value
}

function toTaskFromExtraRow(row: ExtraTaskRow): Task {
    const assignee = unwrapSingleRelation(row.assignee)
    const creator = unwrapSingleRelation(row.creator)
    return {
        id: row.id,
        title: row.title ?? "Sem título",
        description: null,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date ?? null,
        assignee_id: row.assignee_id ?? null,
        creator_id: row.creator_id ?? null,
        indicacao_id: null,
        contact_id: null,
        proposal_id: null,
        visibility_scope: null,
        client_name: null,
        codigo_instalacao: null,
        energisa_activated_at: null,
        department: toDepartment(row.department),
        created_at: row.created_at,
        completed_at: null,
        completed_by: null,
        brand: row.brand === "dorata" ? "dorata" : "rental",
        assignee: assignee
            ? {
                name: assignee.name ?? "Sem responsável",
                email: assignee.email ?? "",
            }
            : undefined,
        creator: creator
            ? {
                name: creator.name ?? "Sem criador",
            }
            : undefined,
    }
}

function normalizeChecklistDecision(value?: string | null): TaskChecklistDecision | null {
    if (value === "APPROVED" || value === "REJECTED" || value === "IN_REVIEW") return value
    return null
}

function toSummaryTask(params: {
    task: Task
    now: Date
    week: { startDateKey: string; endDateKey: string }
    blockerCount?: number
    oldestBlockerOpenedAt?: string | null
    inProgressAt?: string | null
}): TaskPersonalSummaryTask {
    const blockerCount = params.blockerCount ?? 0
    const oldestBlockerOpenedAt = params.oldestBlockerOpenedAt ?? null
    const dueDate = params.task.due_date ?? null
    return {
        taskId: params.task.id,
        title: params.task.title?.trim() || "Sem título",
        status: params.task.status,
        priority: params.task.priority,
        department: toDepartment(params.task.department),
        dueDate,
        overdue: isOverdue(dueDate, params.now),
        dueInCurrentWeek: isDueInCurrentWeek(dueDate, params.week, PERSONAL_WEEK_TIMEZONE),
        assigneeName: params.task.assignee?.name?.trim() || params.task.assignee?.email?.trim() || "Sem responsável",
        creatorName: params.task.creator?.name?.trim() || "Sem criador",
        blockerCount,
        oldestBlockerOpenedAt,
        createdAt: params.task.created_at,
        inProgressAt: params.inProgressAt ?? null,
    }
}

function sortSummaryTasksByImportance(
    tasks: Task[],
    params: {
        now: Date
        week: { startDateKey: string; endDateKey: string }
    }
) {
    return [...tasks].sort((a, b) =>
        compareTasksByImportance(a, b, {
            now: params.now,
            week: params.week,
            timeZone: PERSONAL_WEEK_TIMEZONE,
        })
    )
}

async function loadObserverTaskIds(userId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_observers")
        .select("task_id")
        .eq("user_id", userId)

    if (error) {
        if (isMissingRelationError(error, "task_observers")) return new Set<string>()
        console.error("Error loading observer task ids for personal weekly summary:", error)
        return new Set<string>()
    }

    return new Set(
        ((data ?? []) as Array<{ task_id?: string | null }>)
            .map((row) => (typeof row.task_id === "string" ? row.task_id.trim() : ""))
            .filter(Boolean)
    )
}

async function loadOpenBlockers(taskIds: string[]) {
    if (taskIds.length === 0) return [] as TaskBlockerRow[]

    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_blockers")
        .select("id, task_id, status, owner_type, owner_user_id, owner_department, reason, expected_unblock_at, opened_at")
        .in("task_id", taskIds)
        .eq("status", "OPEN")

    if (error) {
        if (isMissingRelationError(error, "task_blockers")) return []
        console.error("Error loading blockers for personal weekly summary:", error)
        return []
    }

    return filterOpenBlockers((data ?? []) as TaskBlockerRow[])
}

async function loadUsersNameMap(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, UserNameRow>()
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", userIds)

    if (error) {
        console.error("Error loading dependency users for personal weekly summary:", error)
        return new Map<string, UserNameRow>()
    }

    const map = new Map<string, UserNameRow>()
    ;((data ?? []) as UserNameRow[]).forEach((item) => map.set(item.id, item))
    return map
}

async function loadInProgressEventsByTask(taskIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (taskIds.length === 0) return map

    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_activity_events")
        .select("task_id, event_at")
        .in("task_id", taskIds)
        .eq("event_type", "TASK_STATUS_CHANGED")
        .eq("metadata->>new_status" as string, "IN_PROGRESS")
        .order("event_at", { ascending: false })

    if (error) {
        // table may not exist yet in some envs — degrade gracefully
        return map
    }

    for (const row of (data ?? []) as Array<{ task_id: string; event_at: string }>) {
        if (!map.has(row.task_id)) {
            map.set(row.task_id, row.event_at)
        }
    }
    return map
}

async function loadPendingChecklistRows(userId: string) {
    const supabase = await createClient()
    let includeDecisionStatus = true

    while (true) {
        const columns = [
            "id",
            "task_id",
            "title",
            "due_date",
            "phase",
            includeDecisionStatus ? "decision_status" : null,
            "is_done",
            "responsible_user_id",
            "created_at",
        ]
            .filter(Boolean)
            .join(", ")

        const { data, error } = await supabase
            .from("task_checklists")
            .select(columns)
            .eq("responsible_user_id", userId)
            .eq("is_done", false)
            .order("due_date", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true })
            .limit(100)

        if (!error) return ((data ?? []) as unknown as ChecklistPendingRow[])

        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn && missingColumn.table === "task_checklists" && missingColumn.column === "responsible_user_id") {
            return []
        }
        if (missingColumn && missingColumn.table === "task_checklists" && missingColumn.column === "decision_status" && includeDecisionStatus) {
            includeDecisionStatus = false
            continue
        }
        if (isMissingRelationError(error, "task_checklists")) return []

        console.error("Error loading pending checklist rows for personal weekly summary:", error)
        return []
    }
}

export async function getTaskPersonalWeeklySummary(params?: {
    brand?: Brand
    search?: string
}): Promise<TaskPersonalWeeklySummary | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const now = new Date()
    const week = getCurrentWeekDateKeys(now, PERSONAL_WEEK_TIMEZONE)

    const allMineTasks = await getTasks({
        showAll: true,
        assigneeId: user.id,
        brand: params?.brand,
        search: params?.search,
    })

    const openTasks = allMineTasks.filter((task) => task.status !== "DONE")
    const openTaskIds = openTasks.map((task) => task.id)
    const observerTaskIds = await loadObserverTaskIds(user.id)
    const openBlockers = await loadOpenBlockers(openTaskIds)

    const blockersByTaskId = new Map<string, TaskBlockerRow[]>()
    openBlockers.forEach((row) => {
        const current = blockersByTaskId.get(row.task_id) ?? []
        current.push(row)
        blockersByTaskId.set(row.task_id, current)
    })

    const assigneeTasks = openTasks.filter((task) => task.assignee_id === user.id)
    const creatorTasks = openTasks.filter((task) => task.creator_id === user.id)
    const observerTasks = openTasks.filter((task) => observerTaskIds.has(task.id))

    const sortedAssigneeTasks = sortSummaryTasksByImportance(assigneeTasks, { now, week })
    const importantTaskRows = sortedAssigneeTasks.filter((task) => {
        const highPriority = task.priority === "URGENT" || task.priority === "HIGH"
        return highPriority || isOverdue(task.due_date, now) || isDueInCurrentWeek(task.due_date, week, PERSONAL_WEEK_TIMEZONE)
    })
    const selectedImportantRows = (importantTaskRows.length > 0 ? importantTaskRows : sortedAssigneeTasks).slice(0, 14)

    const inProgressRows = assigneeTasks
        .filter((task) => task.status === "IN_PROGRESS" || task.status === "REVIEW")
    const sortedInProgressRows = sortSummaryTasksByImportance(inProgressRows, { now, week }).slice(0, 20)

    const inProgressEventMap = await loadInProgressEventsByTask(sortedInProgressRows.map((t) => t.id))

    const assigneeTaskIdSet = new Set(assigneeTasks.map((task) => task.id))
    const blockersFromAssigneeTasks = openBlockers.filter((blocker) => assigneeTaskIdSet.has(blocker.task_id))
    const blockerOwnerUserIds = Array.from(
        new Set(
            blockersFromAssigneeTasks
                .map((item) => (typeof item.owner_user_id === "string" ? item.owner_user_id.trim() : ""))
                .filter(Boolean)
        )
    )
    const usersById = await loadUsersNameMap(blockerOwnerUserIds)

    const toSummaryTaskWithBlockers = (task: Task) => {
        const blockers = blockersByTaskId.get(task.id) ?? []
        const oldestBlockerOpenedAt = blockers
            .map((item) => item.opened_at)
            .sort(compareIsoAsc)[0] ?? null
        return toSummaryTask({
            task,
            now,
            week,
            blockerCount: blockers.length,
            oldestBlockerOpenedAt,
        })
    }

    const openTasksById = new Map<string, Task>(openTasks.map((task) => [task.id, task]))
    const importantTasks = selectedImportantRows.map(toSummaryTaskWithBlockers)
    const inProgressTasks = sortedInProgressRows.map((task) => {
        const blockers = blockersByTaskId.get(task.id) ?? []
        const oldestBlockerOpenedAt = blockers.map((item) => item.opened_at).sort(compareIsoAsc)[0] ?? null
        return toSummaryTask({
            task,
            now,
            week,
            blockerCount: blockers.length,
            oldestBlockerOpenedAt,
            inProgressAt: inProgressEventMap.get(task.id) ?? null,
        })
    })

    const tasksByRole = {
        assignee: sortSummaryTasksByImportance(assigneeTasks, { now, week }).slice(0, 25).map(toSummaryTaskWithBlockers),
        observer: sortSummaryTasksByImportance(observerTasks, { now, week }).slice(0, 25).map(toSummaryTaskWithBlockers),
        creator: sortSummaryTasksByImportance(creatorTasks, { now, week }).slice(0, 25).map(toSummaryTaskWithBlockers),
    }

    const blockedTaskSummaries = assigneeTasks
        .filter((task) => (blockersByTaskId.get(task.id)?.length ?? 0) > 0)
        .map(toSummaryTaskWithBlockers)
        .sort((a, b) => compareIsoAsc(a.oldestBlockerOpenedAt, b.oldestBlockerOpenedAt))

    const byUserMap = new Map<string, {
        ownerLabel: string
        blockers: number
        taskIds: Set<string>
    }>()
    const byDepartmentMap = new Map<string, {
        ownerLabel: string
        blockers: number
        taskIds: Set<string>
    }>()

    blockersFromAssigneeTasks.forEach((blocker) => {
        if (blocker.owner_type === "USER" && blocker.owner_user_id) {
            const owner = usersById.get(blocker.owner_user_id)
            const ownerLabel = owner?.name?.trim() || owner?.email?.trim() || "Pessoa não identificada"
            const current = byUserMap.get(blocker.owner_user_id) ?? {
                ownerLabel,
                blockers: 0,
                taskIds: new Set<string>(),
            }
            current.blockers += 1
            current.taskIds.add(blocker.task_id)
            byUserMap.set(blocker.owner_user_id, current)
            return
        }

        const department = toDepartment(blocker.owner_department)
        const current = byDepartmentMap.get(department) ?? {
            ownerLabel: formatDepartmentLabel(department),
            blockers: 0,
            taskIds: new Set<string>(),
        }
        current.blockers += 1
        current.taskIds.add(blocker.task_id)
        byDepartmentMap.set(department, current)
    })

    const toGroupSummary = (input: {
        ownerType: TaskBlockerOwnerType
        ownerKey: string
        ownerLabel: string
        blockers: number
        taskIds: Set<string>
    }): TaskPersonalDependencyGroup => {
        const tasks = Array.from(input.taskIds)
            .map((taskId) => openTasksById.get(taskId))
            .filter((task): task is Task => Boolean(task))
            .map(toSummaryTaskWithBlockers)
            .sort((a, b) => compareIsoAsc(a.oldestBlockerOpenedAt, b.oldestBlockerOpenedAt))

        const oldestBlockerOpenedAt = tasks
            .map((task) => task.oldestBlockerOpenedAt)
            .filter((value): value is string => Boolean(value))
            .sort(compareIsoAsc)[0] ?? null

        return {
            ownerType: input.ownerType,
            ownerKey: input.ownerKey,
            ownerLabel: input.ownerLabel,
            blockedTasks: tasks.length,
            blockers: input.blockers,
            oldestBlockerOpenedAt,
            tasks: tasks.slice(0, 8),
        }
    }

    const blockedByDependency = {
        byUser: Array.from(byUserMap.entries())
            .map(([ownerKey, item]) =>
                toGroupSummary({
                    ownerType: "USER",
                    ownerKey,
                    ownerLabel: item.ownerLabel,
                    blockers: item.blockers,
                    taskIds: item.taskIds,
                })
            )
            .sort((a, b) => {
                if (b.blockedTasks !== a.blockedTasks) return b.blockedTasks - a.blockedTasks
                if (b.blockers !== a.blockers) return b.blockers - a.blockers
                return compareIsoAsc(a.oldestBlockerOpenedAt, b.oldestBlockerOpenedAt)
            }),
        byDepartment: Array.from(byDepartmentMap.entries())
            .map(([ownerKey, item]) =>
                toGroupSummary({
                    ownerType: "DEPARTMENT",
                    ownerKey,
                    ownerLabel: item.ownerLabel,
                    blockers: item.blockers,
                    taskIds: item.taskIds,
                })
            )
            .sort((a, b) => {
                if (b.blockedTasks !== a.blockedTasks) return b.blockedTasks - a.blockedTasks
                if (b.blockers !== a.blockers) return b.blockers - a.blockers
                return compareIsoAsc(a.oldestBlockerOpenedAt, b.oldestBlockerOpenedAt)
            }),
        oldestBlockedTasks: blockedTaskSummaries.slice(0, 12),
    }

    const pendingChecklistRows = await loadPendingChecklistRows(user.id)
    const checklistTaskIds = Array.from(new Set(pendingChecklistRows.map((item) => item.task_id)))
    const missingChecklistTaskIds = checklistTaskIds.filter((taskId) => !openTasksById.has(taskId))

    if (missingChecklistTaskIds.length > 0) {
        const { data: extraChecklistTaskRows, error: extraChecklistTaskError } = await supabase
            .from("tasks")
            .select(`
                id,
                title,
                status,
                priority,
                due_date,
                assignee_id,
                creator_id,
                department,
                brand,
                created_at,
                updated_at,
                assignee:users!tasks_assignee_id_fkey(name, email),
                creator:users!tasks_creator_id_fkey(name)
            `)
            .in("id", missingChecklistTaskIds)

        if (!extraChecklistTaskError) {
            ;((extraChecklistTaskRows ?? []) as unknown as ExtraTaskRow[]).forEach((row) => {
                const task = toTaskFromExtraRow(row)
                openTasksById.set(task.id, task)
            })
        } else {
            console.error("Error loading extra tasks for pending checklist in personal weekly summary:", extraChecklistTaskError)
        }
    }

    const pendingChecklistItems = pendingChecklistRows
        .map((row) => {
            const task = openTasksById.get(row.task_id)
            if (!task) return null
            return {
                checklistItemId: row.id,
                checklistTitle: row.title?.trim() || "Checklist sem título",
                phase: row.phase,
                decisionStatus: normalizeChecklistDecision(row.decision_status),
                dueDate: row.due_date,
                createdAt: row.created_at,
                task: toSummaryTask({
                    task,
                    now,
                    week,
                    blockerCount: blockersByTaskId.get(task.id)?.length ?? 0,
                    oldestBlockerOpenedAt:
                        (blockersByTaskId.get(task.id) ?? [])
                            .map((item) => item.opened_at)
                            .sort(compareIsoAsc)[0] ?? null,
                }),
            } satisfies TaskPersonalChecklistPending
        })
        .filter((item): item is TaskPersonalChecklistPending => Boolean(item))
        .sort((a, b) => compareIsoAsc(a.dueDate, b.dueDate))
        .slice(0, 40)

    const dueOrOverdueCount = assigneeTasks.filter((task) => {
        const overdue = isOverdue(task.due_date, now)
        const dueInWeek = isDueInCurrentWeek(task.due_date, week, PERSONAL_WEEK_TIMEZONE)
        return overdue || dueInWeek
    }).length

    return {
        generatedAt: new Date().toISOString(),
        timeZone: PERSONAL_WEEK_TIMEZONE,
        weekStartDate: week.startDateKey,
        weekEndDate: week.endDateKey,
        cards: {
            maisImportantes: importantTasks.length,
            emAndamento: inProgressTasks.length,
            travadas: blockedTaskSummaries.length,
            vencendoOuAtrasadas: dueOrOverdueCount,
            obrasAtivas: 0, // populated by getActiveWorksForUser in the page layer
        },
        importantTasks,
        blockedByDependency,
        inProgressTasks,
        tasksByRole,
        pendingChecklistItems,
    }
}

// --- OBRAS EM ANDAMENTO ---

export type ActiveWorkSummary = {
    id: string
    title: string | null
    work_address: string | null
    status: string
    phase: "PROJETO" | "EXECUCAO" | null
    execution_deadline_at: string | null
    execution_deadline_business_days: number | null
    completed_at: string | null
    elapsed_business_days: number | null
    is_overdue: boolean
}

export async function getActiveWorksForUser(userId: string): Promise<ActiveWorkSummary[]> {
    const supabase = await createClient()

    // work_cards tem coluna user_id (migration 087) — filtrar diretamente pelo responsável
    const { data, error } = await supabase
        .from("work_cards")
        .select(`
            id,
            title,
            work_address,
            status,
            execution_deadline_at,
            execution_deadline_business_days,
            completed_at,
            created_at
        `)
        .eq("user_id", userId)
        .in("status", ["PARA_INICIAR", "EM_ANDAMENTO"])
        .order("execution_deadline_at", { ascending: true })
        .limit(10)

    if (error) {
        console.error("getActiveWorksForUser error:", error.message)
        return []
    }

    const now = new Date()
    return (data ?? []).map((row) => {
        const deadline = row.execution_deadline_at ? new Date(row.execution_deadline_at) : null
        const isOverdue = deadline ? now > deadline : false

        // elapsed = dias úteis desde criação da obra até hoje
        const startedAt = new Date(row.created_at)
        const elapsed = differenceInBusinessDays(startedAt, now)

        return {
            id: row.id,
            title: row.title,
            work_address: row.work_address,
            status: row.status,
            phase: null,
            execution_deadline_at: row.execution_deadline_at,
            execution_deadline_business_days: row.execution_deadline_business_days,
            completed_at: row.completed_at,
            elapsed_business_days: elapsed,
            is_overdue: isOverdue,
        }
    })
}
