import type { Task, TaskChecklistItem, TaskPriority } from "@/services/task-service"

export const PERSONAL_WEEK_TIMEZONE = "America/Cuiaba"

export type WeekWindowDateKeys = {
    currentDateKey: string
    startDateKey: string
    endDateKey: string
}

export function getLocalDateParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
    })

    const parts = formatter.formatToParts(date)
    const year = Number.parseInt(parts.find((part) => part.type === "year")?.value ?? "", 10)
    const month = Number.parseInt(parts.find((part) => part.type === "month")?.value ?? "", 10)
    const day = Number.parseInt(parts.find((part) => part.type === "day")?.value ?? "", 10)
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun"

    if (
        !Number.isFinite(year) ||
        Number.isNaN(year) ||
        !Number.isFinite(month) ||
        Number.isNaN(month) ||
        !Number.isFinite(day) ||
        Number.isNaN(day)
    ) {
        throw new Error("Não foi possível calcular a data local no timezone informado.")
    }

    return { year, month, day, weekday }
}

function weekdayToIndex(weekday: string) {
    if (weekday === "Mon") return 1
    if (weekday === "Tue") return 2
    if (weekday === "Wed") return 3
    if (weekday === "Thu") return 4
    if (weekday === "Fri") return 5
    if (weekday === "Sat") return 6
    return 0
}

function dateToKey(value: Date) {
    return value.toISOString().slice(0, 10)
}

export function getCurrentWeekDateKeys(now = new Date(), timeZone = PERSONAL_WEEK_TIMEZONE): WeekWindowDateKeys {
    const local = getLocalDateParts(now, timeZone)
    const weekday = weekdayToIndex(local.weekday)

    const currentDateUtc = new Date(Date.UTC(local.year, local.month - 1, local.day))
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1

    const mondayUtc = new Date(currentDateUtc)
    mondayUtc.setUTCDate(currentDateUtc.getUTCDate() - daysFromMonday)

    const sundayUtc = new Date(mondayUtc)
    sundayUtc.setUTCDate(mondayUtc.getUTCDate() + 6)

    return {
        currentDateKey: dateToKey(currentDateUtc),
        startDateKey: dateToKey(mondayUtc),
        endDateKey: dateToKey(sundayUtc),
    }
}

export function getLocalDateKeyFromIso(value: string | null | undefined, timeZone = PERSONAL_WEEK_TIMEZONE) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null

    const local = getLocalDateParts(date, timeZone)
    const localUtc = new Date(Date.UTC(local.year, local.month - 1, local.day))
    return dateToKey(localUtc)
}

export function isDateKeyInRange(dateKey: string | null | undefined, range: { startDateKey: string; endDateKey: string }) {
    if (!dateKey) return false
    return dateKey >= range.startDateKey && dateKey <= range.endDateKey
}

export function isDueInCurrentWeek(
    dueDate: string | null | undefined,
    week: { startDateKey: string; endDateKey: string },
    timeZone = PERSONAL_WEEK_TIMEZONE
) {
    const dueKey = getLocalDateKeyFromIso(dueDate, timeZone)
    return isDateKeyInRange(dueKey, week)
}

export function isOverdue(dueDate: string | null | undefined, now = new Date()) {
    if (!dueDate) return false
    const parsed = new Date(dueDate)
    if (Number.isNaN(parsed.getTime())) return false
    return parsed.getTime() < now.getTime()
}

export function getPriorityWeight(priority: TaskPriority | string | null | undefined) {
    if (priority === "URGENT") return 4
    if (priority === "HIGH") return 3
    if (priority === "MEDIUM") return 2
    return 1
}

function parseIso(value: string | null | undefined) {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
}

export function compareTasksByImportance(
    a: Pick<Task, "priority" | "due_date" | "created_at">,
    b: Pick<Task, "priority" | "due_date" | "created_at">,
    params: {
        now?: Date
        timeZone?: string
        week: { startDateKey: string; endDateKey: string }
    }
) {
    const now = params.now ?? new Date()
    const timeZone = params.timeZone ?? PERSONAL_WEEK_TIMEZONE
    const overdueA = isOverdue(a.due_date, now)
    const overdueB = isOverdue(b.due_date, now)

    if (overdueA !== overdueB) return overdueA ? -1 : 1

    const dueInWeekA = isDueInCurrentWeek(a.due_date, params.week, timeZone)
    const dueInWeekB = isDueInCurrentWeek(b.due_date, params.week, timeZone)
    if (dueInWeekA !== dueInWeekB) return dueInWeekA ? -1 : 1

    const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
    if (priorityDiff !== 0) return priorityDiff

    const dueA = parseIso(a.due_date)
    const dueB = parseIso(b.due_date)
    if (dueA && dueB) {
        const diff = dueA.getTime() - dueB.getTime()
        if (diff !== 0) return diff
    } else if (dueA && !dueB) {
        return -1
    } else if (!dueA && dueB) {
        return 1
    }

    const createdA = parseIso(a.created_at)
    const createdB = parseIso(b.created_at)
    if (createdA && createdB) return createdA.getTime() - createdB.getTime()
    if (createdA && !createdB) return -1
    if (!createdA && createdB) return 1
    return 0
}

export function classifyTaskRoles(
    task: Pick<Task, "id" | "assignee_id" | "creator_id">,
    userId: string,
    observerTaskIds: Set<string>
) {
    return {
        assignee: task.assignee_id === userId,
        observer: observerTaskIds.has(task.id),
        creator: task.creator_id === userId,
    }
}

export function filterOpenBlockers<T extends { status?: string | null }>(blockers: T[]) {
    return blockers.filter((blocker) => blocker.status === "OPEN")
}

export function isPendingChecklistForUser(
    checklist: Pick<TaskChecklistItem, "is_done" | "responsible_user_id">,
    userId: string
) {
    return checklist.is_done === false && checklist.responsible_user_id === userId
}
