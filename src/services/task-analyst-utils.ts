export type DepartmentThreshold = {
  department: string
  reminderHours: number
  escalationHours: number
  slowHours: number
  source: "manual" | "learned"
}

type TaskAnalystMessageKindValue = "REMINDER" | "ESCALATION" | "MANAGER_DIGEST" | "UNASSIGNED_ALERT"

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
