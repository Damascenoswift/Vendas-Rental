export type DepartmentThreshold = {
  department: string
  reminderHours: number
  escalationHours: number
  slowHours: number
  source: "manual" | "learned"
}

export type DeadlineHealthBucket = "on_time" | "in_risk" | "late" | "without_due_date"

export type TaskStatusEventLite = {
  eventType: string
  eventAt: string
  payload?: Record<string, unknown> | null
}

type TaskAnalystMessageKindValue = "REMINDER" | "ESCALATION" | "MANAGER_DIGEST" | "UNASSIGNED_ALERT" | "BLOCKER_REMINDER"

const KNOWN_DEPARTMENTS = new Set([
  "vendas",
  "cadastro",
  "energia",
  "juridico",
  "financeiro",
  "ti",
  "diretoria",
  "obras",
  "outro",
])

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toISODateUTC(value: Date) {
  return value.toISOString().slice(0, 10)
}

function normalizeDepartment(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase()
  if (!normalized) return null
  if (!KNOWN_DEPARTMENTS.has(normalized)) return null
  return normalized
}

export function computeHoursWithoutProgress(lastProgressAt: string, now = new Date()) {
  const base = parseDate(lastProgressAt)
  if (!base) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((now.getTime() - base.getTime()) / (1000 * 60 * 60)))
}

export function findFirstInProgressAt(events: TaskStatusEventLite[]) {
  const statusEvents = events
    .filter((event) => event.eventType === "TASK_STATUS_CHANGED")
    .slice()
    .sort((left, right) => {
      const leftTime = parseDate(left.eventAt)?.getTime() ?? 0
      const rightTime = parseDate(right.eventAt)?.getTime() ?? 0
      return leftTime - rightTime
    })

  for (const event of statusEvents) {
    const newStatus = typeof event.payload?.new_status === "string"
      ? event.payload.new_status.trim().toUpperCase()
      : ""
    if (newStatus === "IN_PROGRESS") return event.eventAt
  }

  return null
}

function toMillis(value?: string | null) {
  const parsed = parseDate(value)
  return parsed?.getTime() ?? null
}

function intersectionHours(params: {
  leftStart: number
  leftEnd: number
  rightStart: number
  rightEnd: number
}) {
  const start = Math.max(params.leftStart, params.rightStart)
  const end = Math.min(params.leftEnd, params.rightEnd)
  if (end <= start) return 0
  return Math.floor((end - start) / (1000 * 60 * 60))
}

export function computeBlockedHoursInWindow(params: {
  windowStartAt: string
  windowEndAt: string
  blockers: Array<{
    openedAt: string
    resolvedAt?: string | null
  }>
}) {
  const windowStart = toMillis(params.windowStartAt)
  const windowEnd = toMillis(params.windowEndAt)
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) return 0

  return params.blockers.reduce((total, blocker) => {
    const blockerStart = toMillis(blocker.openedAt)
    if (blockerStart === null) return total
    const blockerEnd = toMillis(blocker.resolvedAt) ?? windowEnd
    if (blockerEnd <= blockerStart) return total
    return total + intersectionHours({
      leftStart: windowStart,
      leftEnd: windowEnd,
      rightStart: blockerStart,
      rightEnd: blockerEnd,
    })
  }, 0)
}

export function classifyTaskDeadlineHealth(params: {
  status?: string | null
  dueDate?: string | null
  completedAt?: string | null
  now?: Date
  inRiskDays?: number
}): DeadlineHealthBucket {
  const dueAt = parseDate(params.dueDate)
  if (!dueAt) return "without_due_date"

  const now = params.now ?? new Date()
  const inRiskDays = Number.isFinite(params.inRiskDays) ? Math.max(0, Math.floor(params.inRiskDays ?? 0)) : 2
  const inRiskThreshold = new Date(now.getTime() + (inRiskDays * 24 * 60 * 60 * 1000))

  const completedAt = parseDate(params.completedAt)
  const status = (params.status ?? "").trim().toUpperCase()

  if (status === "DONE" || completedAt) {
    if (!completedAt) return "late"
    return completedAt.getTime() <= dueAt.getTime() ? "on_time" : "late"
  }

  if (dueAt.getTime() < now.getTime()) return "late"
  if (dueAt.getTime() <= inRiskThreshold.getTime()) return "in_risk"
  return "on_time"
}

export function formatHoursToDaysHours(hours: number | null | undefined) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "-"
  const normalized = Math.max(0, Math.floor(hours))
  const days = Math.floor(normalized / 24)
  const remainingHours = normalized % 24
  return `${days}d ${remainingHours}h`
}

export function clampHours(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return Math.round(value)
}

export function percentile75(values: number[]) {
  if (values.length === 0) return 0
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const index = Math.ceil(sorted.length * 0.75) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

export function applyLearningSmoothing(currentValue: number, targetValue: number) {
  return Math.round((currentValue * 0.7) + (targetValue * 0.3))
}

export function buildCooldownHashKey(input: {
  kind: TaskAnalystMessageKindValue
  recipientUserId: string
  taskId: string
  referenceAt?: Date
}) {
  const ref = input.referenceAt ?? new Date()
  return `${input.kind}:${input.recipientUserId}:${input.taskId}:${toISODateUTC(ref)}`
}

export function buildBlockerDependencyKey(input: {
  ownerType: "USER" | "DEPARTMENT"
  ownerUserId?: string | null
  ownerDepartment?: string | null
}) {
  if (input.ownerType === "USER") {
    const ownerUserId = input.ownerUserId?.trim()
    if (!ownerUserId) return null
    return `USER:${ownerUserId}`
  }

  const department = normalizeDepartment(input.ownerDepartment)
  if (!department) return null
  return `DEPARTMENT:${department}`
}

export function shouldSendByCooldown(params: {
  lastSentAt: string | null
  now?: Date
  cooldownHours: number
}) {
  if (!params.lastSentAt) return true
  const now = params.now ?? new Date()
  return computeHoursWithoutProgress(params.lastSentAt, now) >= params.cooldownHours
}

export function pickTaskThreshold(params: {
  department?: string | null
  thresholds: Map<string, DepartmentThreshold>
  fallback: DepartmentThreshold
}) {
  const normalizedDepartment = normalizeDepartment(params.department)
  if (!normalizedDepartment) return params.fallback
  return params.thresholds.get(normalizedDepartment) ?? params.fallback
}
