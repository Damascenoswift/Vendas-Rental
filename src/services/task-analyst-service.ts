"use server"

import { revalidatePath } from "next/cache"
import OpenAI from "openai"

import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { sendSystemDirectMessage } from "@/services/internal-chat-service"

type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED"
type Department = "vendas" | "cadastro" | "energia" | "juridico" | "financeiro" | "ti" | "diretoria" | "obras" | "outro"

type AnalystTrigger = "manual" | "scheduled"

type TaskRow = {
  id: string
  title: string | null
  status: TaskStatus
  department: string | null
  assignee_id: string | null
  creator_id: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

type AnalystUserRow = {
  id: string
  name: string | null
  email: string | null
  role: string | null
  status: string | null
}

type ActivityEventRow = {
  task_id: string
  event_type: string
  event_at: string
}

type MessageLogRow = {
  recipient_user_id: string
  task_id: string | null
  kind: TaskAnalystMessageKind
  sent_at: string
}

type AnalystConfigRow = {
  id: number
  enabled: boolean
  bot_user_id: string | null
  history_window_days: number
  base_reminder_hours: number
  base_escalation_hours: number
  slow_sector_hours: number
  learning_enabled: boolean
}

export type TaskActivityEventType =
  | "TASK_CREATED"
  | "TASK_STATUS_CHANGED"
  | "TASK_ASSIGNEE_CHANGED"
  | "TASK_CHECKLIST_CREATED"
  | "TASK_CHECKLIST_DECISION_CHANGED"
  | "TASK_COMMENT_CREATED"

export type TaskAnalystMessageKind = "REMINDER" | "ESCALATION" | "MANAGER_DIGEST" | "UNASSIGNED_ALERT"

export type TaskAnalystRunStatus = "running" | "success" | "partial" | "failed" | "skipped"

export type DepartmentThreshold = {
  department: string
  reminderHours: number
  escalationHours: number
  slowHours: number
  source: "manual" | "learned"
}

export type TaskAnalystRunResult = {
  ok: boolean
  statusCode: number
  status: TaskAnalystRunStatus
  message: string
  runId?: string | null
  stats?: {
    tasksScanned: number
    remindersSent: number
    escalationsSent: number
    digestsSent: number
    unassignedAlertsSent: number
    learnedThresholdsUpdated: number
  }
}

export type TaskAnalystDashboardSummary = {
  generatedAt: string
  openTasks: number
  overdueOpenTasks: number
  withoutAssignee: number
  avgHoursToFirstProgress: number | null
  avgHoursToCompletion: number | null
  slowSectors: Array<{
    department: string
    totalOpen: number
    stagnant: number
    stagnationRate: number
    thresholdHours: number
  }>
  mostStagnantTasks: Array<{
    taskId: string
    title: string
    status: string
    department: string
    assigneeName: string
    dueDate: string | null
    lastProgressAt: string
    hoursWithoutProgress: number
  }>
}

type LocalProgressSnapshot = {
  latestByTask: Map<string, string>
  firstProgressHoursByTask: Map<string, number>
}

type RunStats = {
  tasksScanned: number
  remindersSent: number
  escalationsSent: number
  digestsSent: number
  unassignedAlertsSent: number
  learnedThresholdsUpdated: number
}

const LOCAL_TIMEZONE = "America/Cuiaba"
const DEPARTMENTS: Department[] = [
  "vendas",
  "cadastro",
  "energia",
  "juridico",
  "financeiro",
  "ti",
  "diretoria",
  "obras",
  "outro",
]

const PROGRESS_EVENT_TYPES = new Set<TaskActivityEventType>([
  "TASK_STATUS_CHANGED",
  "TASK_ASSIGNEE_CHANGED",
  "TASK_CHECKLIST_CREATED",
  "TASK_CHECKLIST_DECISION_CHANGED",
  "TASK_COMMENT_CREATED",
])

const INACTIVE_USER_STATUSES = new Set(["inativo", "inactive", "suspended"])

function normalizeStatus(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

function isInactiveStatus(value?: string | null) {
  return INACTIVE_USER_STATUSES.has(normalizeStatus(value))
}

function normalizeDepartment(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase()
  if (!normalized) return null
  if (DEPARTMENTS.includes(normalized as Department)) return normalized
  return null
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

function toISODateUTC(value: Date) {
  return value.toISOString().slice(0, 10)
}

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
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
  kind: TaskAnalystMessageKind
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

function currentLocalHour(timeZone = LOCAL_TIMEZONE, date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date)

  const parsed = Number.parseInt(formatted, 10)
  if (Number.isNaN(parsed)) return date.getUTCHours()
  return parsed
}

function currentLocalWeekday(timeZone = LOCAL_TIMEZONE, date = new Date()) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date)

  if (short === "Mon") return 1
  if (short === "Tue") return 2
  if (short === "Wed") return 3
  if (short === "Thu") return 4
  if (short === "Fri") return 5
  if (short === "Sat") return 6
  return 0
}

function isMissingRelationError(error?: { code?: string | null; message?: string | null } | null, relation?: string) {
  if (!error) return false
  if (error.code === "42P01") return true
  const message = (error.message ?? "").toLowerCase()
  if (!message.includes("does not exist")) return false
  if (!relation) return true
  return message.includes(relation.toLowerCase())
}

async function loadAnalystConfig() {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("task_analyst_config")
    .select("id, enabled, bot_user_id, history_window_days, base_reminder_hours, base_escalation_hours, slow_sector_hours, learning_enabled")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, "task_analyst_config")) return null
    throw new Error(error.message)
  }

  return (data as AnalystConfigRow | null) ?? null
}

async function loadDepartmentThresholds(fallback: DepartmentThreshold) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("task_analyst_department_thresholds")
    .select("department, reminder_hours, escalation_hours, slow_hours, source")

  if (error) {
    if (isMissingRelationError(error, "task_analyst_department_thresholds")) {
      return new Map<string, DepartmentThreshold>()
    }
    throw new Error(error.message)
  }

  const map = new Map<string, DepartmentThreshold>()
  ;((data ?? []) as Array<{
    department: string
    reminder_hours: number
    escalation_hours: number
    slow_hours: number
    source: "manual" | "learned"
  }>).forEach((row) => {
    const department = normalizeDepartment(row.department)
    if (!department) return

    map.set(department, {
      department,
      reminderHours: row.reminder_hours ?? fallback.reminderHours,
      escalationHours: row.escalation_hours ?? fallback.escalationHours,
      slowHours: row.slow_hours ?? fallback.slowHours,
      source: row.source === "learned" ? "learned" : "manual",
    })
  })

  return map
}

async function createRunRow(trigger: AnalystTrigger, dryRun: boolean) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("task_analyst_runs")
    .insert({
      trigger,
      dry_run: dryRun,
      status: "running",
      started_at: new Date().toISOString(),
      message: null,
    })
    .select("id")
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, "task_analyst_runs")) return null
    throw new Error(error.message)
  }

  return (data as { id?: string | null } | null)?.id ?? null
}

async function finalizeRunRow(params: {
  runId: string | null
  status: TaskAnalystRunStatus
  message: string
  stats: RunStats
  errorDetails?: Record<string, unknown> | null
}) {
  if (!params.runId) return

  const supabaseAdmin = createSupabaseServiceClient()

  const { error } = await supabaseAdmin
    .from("task_analyst_runs")
    .update({
      status: params.status,
      message: params.message,
      error_details: params.errorDetails ?? null,
      tasks_scanned: params.stats.tasksScanned,
      reminders_sent: params.stats.remindersSent,
      escalations_sent: params.stats.escalationsSent,
      digests_sent: params.stats.digestsSent,
      unassigned_alerts_sent: params.stats.unassignedAlertsSent,
      learned_thresholds_updated: params.stats.learnedThresholdsUpdated,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.runId)

  if (error) {
    console.error("Error finalizing task analyst run:", error)
  }
}

async function loadOpenTasks() {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("id, title, status, department, assignee_id, creator_id, due_date, created_at, updated_at")
    .neq("status", "DONE")

  if (error) throw new Error(error.message)

  return (data ?? []) as TaskRow[]
}

async function loadUsersById(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AnalystUserRow>()

  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, status")
    .in("id", userIds)

  if (error) throw new Error(error.message)

  const map = new Map<string, AnalystUserRow>()
  ;((data ?? []) as AnalystUserRow[]).forEach((row) => {
    map.set(row.id, row)
  })

  return map
}

async function loadAdmMestreUsers() {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, status")
    .eq("role", "adm_mestre")

  if (error) throw new Error(error.message)

  return ((data ?? []) as AnalystUserRow[]).filter((user) => !isInactiveStatus(user.status))
}

async function loadProgressSnapshot(taskRows: TaskRow[]): Promise<LocalProgressSnapshot> {
  const taskIds = taskRows.map((task) => task.id)
  const latestByTask = new Map<string, string>()
  const firstProgressHoursByTask = new Map<string, number>()

  if (taskIds.length === 0) {
    return { latestByTask, firstProgressHoursByTask }
  }

  const supabaseAdmin = createSupabaseServiceClient()
  const { data, error } = await supabaseAdmin
    .from("task_activity_events")
    .select("task_id, event_type, event_at")
    .in("task_id", taskIds)
    .order("event_at", { ascending: false })

  if (error) {
    if (isMissingRelationError(error, "task_activity_events")) {
      return { latestByTask, firstProgressHoursByTask }
    }

    throw new Error(error.message)
  }

  const createdAtByTask = new Map<string, string>()
  taskRows.forEach((task) => {
    createdAtByTask.set(task.id, task.created_at)
  })

  const rows = (data ?? []) as ActivityEventRow[]
  rows.forEach((row) => {
    if (!latestByTask.has(row.task_id) && PROGRESS_EVENT_TYPES.has(row.event_type as TaskActivityEventType)) {
      latestByTask.set(row.task_id, row.event_at)
    }
  })

  // find earliest progress event for each task
  const progressRowsAsc = rows
    .filter((row) => PROGRESS_EVENT_TYPES.has(row.event_type as TaskActivityEventType))
    .slice()
    .sort((a, b) => {
      const left = parseDate(a.event_at)?.getTime() ?? 0
      const right = parseDate(b.event_at)?.getTime() ?? 0
      return left - right
    })

  progressRowsAsc.forEach((row) => {
    if (firstProgressHoursByTask.has(row.task_id)) return

    const createdAt = createdAtByTask.get(row.task_id)
    const createdDate = parseDate(createdAt)
    const progressDate = parseDate(row.event_at)
    if (!createdDate || !progressDate) return

    const diffHours = Math.max(0, Math.floor((progressDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60)))
    firstProgressHoursByTask.set(row.task_id, diffHours)
  })

  return { latestByTask, firstProgressHoursByTask }
}

async function findLatestMessageLog(params: {
  recipientUserId: string
  taskId?: string | null
  kind: TaskAnalystMessageKind
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  let query = supabaseAdmin
    .from("task_analyst_message_log")
    .select("recipient_user_id, task_id, kind, sent_at")
    .eq("recipient_user_id", params.recipientUserId)
    .eq("kind", params.kind)
    .order("sent_at", { ascending: false })
    .limit(1)

  if (params.taskId) {
    query = query.eq("task_id", params.taskId)
  } else {
    query = query.is("task_id", null)
  }

  const { data, error } = await query

  if (error) {
    if (isMissingRelationError(error, "task_analyst_message_log")) return null
    throw new Error(error.message)
  }

  return ((data ?? []) as MessageLogRow[])[0] ?? null
}

async function hasReminderWithoutReaction(params: {
  recipientUserId: string
  taskId: string
  latestProgressAt: string
}) {
  const lastReminder = await findLatestMessageLog({
    recipientUserId: params.recipientUserId,
    taskId: params.taskId,
    kind: "REMINDER",
  })

  if (!lastReminder?.sent_at) return false

  const reminderAt = parseDate(lastReminder.sent_at)
  const progressAt = parseDate(params.latestProgressAt)
  if (!reminderAt || !progressAt) return false

  return progressAt.getTime() <= reminderAt.getTime()
}

async function insertMessageLog(params: {
  recipientUserId: string
  taskId?: string | null
  kind: TaskAnalystMessageKind
  conversationId?: string | null
  hashKey: string
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { error } = await supabaseAdmin
    .from("task_analyst_message_log")
    .insert({
      recipient_user_id: params.recipientUserId,
      task_id: params.taskId ?? null,
      kind: params.kind,
      sent_at: new Date().toISOString(),
      conversation_id: params.conversationId ?? null,
      hash_key: params.hashKey,
    })

  if (!error) return true
  if (error.code === "23505") return false
  if (isMissingRelationError(error, "task_analyst_message_log")) {
    throw new Error("Tabela task_analyst_message_log não encontrada. Aplique a migration do analista.")
  }

  throw new Error(error.message)
}

async function markMessageLogDelivered(params: {
  hashKey: string
  conversationId: string
  messageId: string
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { error } = await supabaseAdmin
    .from("task_analyst_message_log")
    .update({
      conversation_id: params.conversationId,
      metadata: {
        delivered: true,
        message_id: params.messageId,
      },
    })
    .eq("hash_key", params.hashKey)

  if (!error) return
  if (isMissingRelationError(error, "task_analyst_message_log")) return
  console.error("Error updating task analyst message log delivery:", error)
}

async function rollbackMessageLog(hashKey: string) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { error } = await supabaseAdmin
    .from("task_analyst_message_log")
    .delete()
    .eq("hash_key", hashKey)

  if (!error) return
  if (isMissingRelationError(error, "task_analyst_message_log")) return
  console.error("Error rolling back task analyst message log:", error)
}

function taskTitle(task: Pick<TaskRow, "title">) {
  return task.title?.trim() || "Tarefa sem título"
}

function renderDueDateLabel(value: string | null) {
  const date = parseDate(value)
  if (!date) return "sem prazo"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: LOCAL_TIMEZONE,
  }).format(date)
}

function buildReminderMessage(params: {
  task: TaskRow
  hoursWithoutProgress: number
}) {
  return [
    "Lembrete automático do Analista IA.",
    `A tarefa \"${taskTitle(params.task)}\" está sem avanço há ${params.hoursWithoutProgress}h.`,
    `Status atual: ${params.task.status}. Prazo: ${renderDueDateLabel(params.task.due_date)}.`,
    "Se houver bloqueio, responda nesta conversa para registrar o contexto para a gestão.",
  ].join("\n")
}

function buildEscalationMessage(params: {
  task: TaskRow
  assigneeName: string
  hoursWithoutProgress: number
}) {
  return [
    "Escalonamento automático do Analista IA.",
    `A tarefa \"${taskTitle(params.task)}\" (responsável: ${params.assigneeName}) está sem avanço há ${params.hoursWithoutProgress}h.`,
    `Status atual: ${params.task.status}. Prazo: ${renderDueDateLabel(params.task.due_date)}.`,
    "Sugerido: revisar prioridade, bloqueio e responsável.",
  ].join("\n")
}

function buildUnassignedMessage(tasks: Array<{ task: TaskRow; hoursWithoutProgress: number }>) {
  const lines = tasks
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${taskTitle(item.task)} • ${item.task.status} • ${item.hoursWithoutProgress}h sem avanço`)

  return [
    "Alerta de tarefas sem responsável.",
    `Total sem responsável: ${tasks.length}.`,
    ...lines,
  ].join("\n")
}

async function generateAIDigestSummary(input: {
  overdueCount: number
  withoutAssigneeCount: number
  remindersSent: number
  escalationsSent: number
  slowSectors: Array<{ department: string; rate: number; stagnant: number; total: number }>
  topTasks: Array<{ title: string; hours: number; department: string }>
}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const client = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini"

    const prompt = [
      "Você é um analista de operações. Resuma os dados em até 6 linhas em português.",
      "Foque em prioridade de ação, gargalos por setor e próximos passos para gestor.",
      "Não invente números.",
      `Atrasadas: ${input.overdueCount}`,
      `Sem responsável: ${input.withoutAssigneeCount}`,
      `Lembretes enviados: ${input.remindersSent}`,
      `Escalonamentos enviados: ${input.escalationsSent}`,
      `Setores lentos: ${JSON.stringify(input.slowSectors)}`,
      `Top tarefas paradas: ${JSON.stringify(input.topTasks)}`,
    ].join("\n")

    const response = await client.responses.create({
      model,
      input: [{ role: "user", content: prompt }],
    })

    const output = response.output_text?.trim()
    if (!output) return null
    return output
  } catch (error) {
    console.error("Error generating AI digest summary:", error)
    return null
  }
}

function buildDigestMessage(input: {
  overdueCount: number
  withoutAssigneeCount: number
  remindersSent: number
  escalationsSent: number
  slowSectors: Array<{ department: string; rate: number; stagnant: number; total: number }>
  topTasks: Array<{ title: string; hours: number; department: string }>
  aiSummary: string | null
}) {
  const headline = [
    "Resumo do Analista IA (tarefas)",
    `Atrasadas: ${input.overdueCount}`,
    `Sem responsável: ${input.withoutAssigneeCount}`,
    `Lembretes enviados no ciclo: ${input.remindersSent}`,
    `Escalonamentos enviados no ciclo: ${input.escalationsSent}`,
  ].join("\n")

  const slowLines = input.slowSectors.length === 0
    ? ["Setores lentos: nenhum com incidência relevante no ciclo."]
    : [
      "Setores com lentidão:",
      ...input.slowSectors.slice(0, 5).map((item) => {
        const pct = Math.round(item.rate * 100)
        return `- ${formatDepartmentLabel(item.department)}: ${item.stagnant}/${item.total} (${pct}%)`
      }),
    ]

  const topTasks = input.topTasks.length === 0
    ? ["Tarefas mais paradas: nenhuma aberta."]
    : [
      "Tarefas mais paradas:",
      ...input.topTasks.slice(0, 5).map((item, index) => `${index + 1}. ${item.title} • ${item.hours}h • ${formatDepartmentLabel(item.department)}`),
    ]

  const aiBlock = input.aiSummary ? ["", "Leitura IA:", input.aiSummary] : []

  return [headline, ...slowLines, ...topTasks, ...aiBlock].join("\n")
}

async function maybeApplyLearning(params: {
  trigger: AnalystTrigger
  now: Date
  config: AnalystConfigRow
  thresholdsMap: Map<string, DepartmentThreshold>
  fallbackThreshold: DepartmentThreshold
}) {
  if (!params.config.learning_enabled) return 0

  if (params.trigger === "scheduled") {
    const weekday = currentLocalWeekday(LOCAL_TIMEZONE, params.now)
    const hour = currentLocalHour(LOCAL_TIMEZONE, params.now)
    if (weekday !== 1 || hour !== 8) return 0
  }

  const supabaseAdmin = createSupabaseServiceClient()
  const historyDays = clampHours(params.config.history_window_days, 30, 365)
  const windowStart = new Date(params.now.getTime() - (historyDays * 24 * 60 * 60 * 1000)).toISOString()

  const { data: tasksData, error: tasksError } = await supabaseAdmin
    .from("tasks")
    .select("id, department, created_at")
    .gte("created_at", windowStart)

  if (tasksError) {
    console.error("Error loading tasks for analyst learning:", tasksError)
    return 0
  }

  const taskRows = (tasksData ?? []) as Array<{ id: string; department: string | null; created_at: string }>
  const ids = taskRows.map((row) => row.id)
  if (ids.length === 0) return 0

  const { data: eventsData, error: eventsError } = await supabaseAdmin
    .from("task_activity_events")
    .select("task_id, event_type, event_at")
    .in("task_id", ids)

  if (eventsError) {
    if (isMissingRelationError(eventsError, "task_activity_events")) return 0
    console.error("Error loading events for analyst learning:", eventsError)
    return 0
  }

  const taskCreatedAt = new Map<string, string>()
  const taskDepartment = new Map<string, string>()
  taskRows.forEach((row) => {
    taskCreatedAt.set(row.id, row.created_at)
    const normalized = normalizeDepartment(row.department)
    if (normalized) taskDepartment.set(row.id, normalized)
  })

  const firstProgress = new Map<string, number>()
  ;((eventsData ?? []) as ActivityEventRow[])
    .filter((row) => PROGRESS_EVENT_TYPES.has(row.event_type as TaskActivityEventType))
    .sort((a, b) => {
      const left = parseDate(a.event_at)?.getTime() ?? 0
      const right = parseDate(b.event_at)?.getTime() ?? 0
      return left - right
    })
    .forEach((row) => {
      if (firstProgress.has(row.task_id)) return
      const createdAt = parseDate(taskCreatedAt.get(row.task_id))
      const progressAt = parseDate(row.event_at)
      if (!createdAt || !progressAt) return
      firstProgress.set(row.task_id, Math.max(0, Math.floor((progressAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60))))
    })

  const durationByDepartment = new Map<string, number[]>()
  firstProgress.forEach((hours, taskId) => {
    const department = taskDepartment.get(taskId)
    if (!department) return
    const current = durationByDepartment.get(department) ?? []
    current.push(hours)
    durationByDepartment.set(department, current)
  })

  let updated = 0

  for (const [department, samples] of durationByDepartment.entries()) {
    if (samples.length < 5) continue

    const currentThreshold = params.thresholdsMap.get(department) ?? {
      ...params.fallbackThreshold,
      department,
    }

    const p75 = percentile75(samples)
    const targetReminder = clampHours(p75, 12, 72)
    const targetEscalation = clampHours(Math.max(targetReminder + 24, Math.round(targetReminder * 1.5)), 24, 120)

    const reminderHours = clampHours(applyLearningSmoothing(currentThreshold.reminderHours, targetReminder), 12, 72)
    const escalationHours = clampHours(applyLearningSmoothing(currentThreshold.escalationHours, targetEscalation), 24, 120)
    const slowHours = currentThreshold.slowHours

    const { error: upsertError } = await supabaseAdmin
      .from("task_analyst_department_thresholds")
      .upsert({
        department,
        reminder_hours: reminderHours,
        escalation_hours: escalationHours,
        slow_hours: slowHours,
        source: "learned",
        updated_at: new Date().toISOString(),
      }, { onConflict: "department" })

    if (upsertError) {
      console.error("Error upserting learned threshold:", upsertError)
      continue
    }

    const { error: auditError } = await supabaseAdmin
      .from("task_analyst_learning_audits")
      .insert({
        department,
        sample_size: samples.length,
        p75_first_progress_hours: targetReminder,
        previous_reminder_hours: currentThreshold.reminderHours,
        new_reminder_hours: reminderHours,
        previous_escalation_hours: currentThreshold.escalationHours,
        new_escalation_hours: escalationHours,
        learned_at: new Date().toISOString(),
      })

    if (auditError) {
      console.error("Error writing task analyst learning audit:", auditError)
    }

    updated += 1
  }

  return updated
}

export async function runTaskAnalyst(params: {
  trigger: AnalystTrigger
  dryRun?: boolean
}): Promise<TaskAnalystRunResult> {
  const dryRun = params.dryRun === true
  const stats: RunStats = {
    tasksScanned: 0,
    remindersSent: 0,
    escalationsSent: 0,
    digestsSent: 0,
    unassignedAlertsSent: 0,
    learnedThresholdsUpdated: 0,
  }

  let runId: string | null = null

  try {
    const config = await loadAnalystConfig()
    if (!config) {
      return {
        ok: false,
        statusCode: 422,
        status: "skipped",
        message: "Configuração do analista indisponível. Aplique as migrations do analista.",
      }
    }

    runId = await createRunRow(params.trigger, dryRun)

    if (!config.enabled) {
      await finalizeRunRow({
        runId,
        status: "skipped",
        message: "Task analyst desabilitado na configuração.",
        stats,
      })
      return {
        ok: true,
        statusCode: 200,
        status: "skipped",
        message: "Task analyst desabilitado.",
        runId,
        stats,
      }
    }

    if (!config.bot_user_id?.trim()) {
      await finalizeRunRow({
        runId,
        status: "skipped",
        message: "bot_user_id não configurado.",
        stats,
      })
      return {
        ok: false,
        statusCode: 422,
        status: "skipped",
        message: "Configure task_analyst_config.bot_user_id antes de executar.",
        runId,
        stats,
      }
    }

    const now = new Date()

    // Safety gate for scheduled calls (hourly trigger, active windows at 08:00 and 14:00 local).
    if (params.trigger === "scheduled") {
      const localHour = currentLocalHour(LOCAL_TIMEZONE, now)
      if (![8, 14].includes(localHour)) {
        await finalizeRunRow({
          runId,
          status: "skipped",
          message: `Janela inativa para execução agendada (${localHour}h).`,
          stats,
        })
        return {
          ok: true,
          statusCode: 200,
          status: "skipped",
          message: "Fora da janela 08:00/14:00 (America/Cuiaba).",
          runId,
          stats,
        }
      }
    }

    const fallbackThreshold: DepartmentThreshold = {
      department: "_default",
      reminderHours: clampHours(config.base_reminder_hours, 12, 72),
      escalationHours: clampHours(config.base_escalation_hours, 24, 120),
      slowHours: clampHours(config.slow_sector_hours, 24, 120),
      source: "manual",
    }

    const thresholdsMap = await loadDepartmentThresholds(fallbackThreshold)

    const [openTasks, managerUsers] = await Promise.all([
      loadOpenTasks(),
      loadAdmMestreUsers(),
    ])

    stats.tasksScanned = openTasks.length

    const assigneeIds = Array.from(new Set(openTasks.map((task) => task.assignee_id).filter((id): id is string => Boolean(id))))
    const assigneesById = await loadUsersById(assigneeIds)
    const progressSnapshot = await loadProgressSnapshot(openTasks)

    const reminderCandidates: Array<{ task: TaskRow; recipientId: string; hours: number; threshold: DepartmentThreshold }> = []
    const escalationCandidates: Array<{ task: TaskRow; recipientId: string; hours: number; assigneeName: string; threshold: DepartmentThreshold }> = []
    const unassignedCandidates: Array<{ task: TaskRow; hours: number }> = []
    const slowSectorAccumulator = new Map<string, { total: number; stagnant: number; thresholdHours: number }>()

    openTasks.forEach((task) => {
      const threshold = pickTaskThreshold({
        department: task.department,
        thresholds: thresholdsMap,
        fallback: {
          ...fallbackThreshold,
          department: normalizeDepartment(task.department) ?? "outro",
        },
      })

      const latestProgressAt = progressSnapshot.latestByTask.get(task.id) ?? task.updated_at ?? task.created_at
      const hoursWithoutProgress = computeHoursWithoutProgress(latestProgressAt, now)

      const department = normalizeDepartment(task.department) ?? "outro"
      const slowCurrent = slowSectorAccumulator.get(department) ?? { total: 0, stagnant: 0, thresholdHours: threshold.slowHours }
      slowCurrent.total += 1
      if (hoursWithoutProgress >= threshold.slowHours) slowCurrent.stagnant += 1
      slowSectorAccumulator.set(department, slowCurrent)

      if (!task.assignee_id) {
        unassignedCandidates.push({ task, hours: hoursWithoutProgress })
        return
      }

      reminderCandidates.push({
        task,
        recipientId: task.assignee_id,
        hours: hoursWithoutProgress,
        threshold,
      })

      const assignee = assigneesById.get(task.assignee_id)
      escalationCandidates.push({
        task,
        recipientId: task.assignee_id,
        hours: hoursWithoutProgress,
        assigneeName: assignee?.name?.trim() || assignee?.email?.trim() || "Sem nome",
        threshold,
      })
    })

    const toSendReminders = reminderCandidates.filter((candidate) => candidate.hours >= candidate.threshold.reminderHours)
    const toSendEscalations = escalationCandidates.filter((candidate) => candidate.hours >= candidate.threshold.escalationHours)

    const overdueCount = openTasks.filter((task) => {
      const dueDate = parseDate(task.due_date)
      return Boolean(dueDate && dueDate.getTime() < now.getTime())
    }).length

    // reminders
    for (const candidate of toSendReminders) {
      const recent = await findLatestMessageLog({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        kind: "REMINDER",
      })

      if (!shouldSendByCooldown({
        lastSentAt: recent?.sent_at ?? null,
        now,
        cooldownHours: 24,
      })) {
        continue
      }

      if (dryRun) continue

      const hashKey = buildCooldownHashKey({
        kind: "REMINDER",
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        referenceAt: now,
      })

      const inserted = await insertMessageLog({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        kind: "REMINDER",
        hashKey,
      })

      if (!inserted) continue

      const sendResult = await sendSystemDirectMessage({
        senderUserId: config.bot_user_id,
        recipientUserId: candidate.recipientId,
        body: buildReminderMessage({
          task: candidate.task,
          hoursWithoutProgress: candidate.hours,
        }),
        dedupeToken: hashKey,
      })

      if (sendResult.success) {
        stats.remindersSent += 1
        await markMessageLogDelivered({
          hashKey,
          conversationId: sendResult.data.conversationId,
          messageId: sendResult.data.messageId,
        })
      } else {
        await rollbackMessageLog(hashKey)
        console.error("Task analyst reminder send failed:", sendResult.error)
      }
    }

    // escalations
    for (const candidate of toSendEscalations) {
      const noReaction = await hasReminderWithoutReaction({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        latestProgressAt: progressSnapshot.latestByTask.get(candidate.task.id) ?? candidate.task.updated_at,
      })

      if (!noReaction) continue

      for (const manager of managerUsers) {
        const recentEscalation = await findLatestMessageLog({
          recipientUserId: manager.id,
          taskId: candidate.task.id,
          kind: "ESCALATION",
        })

        if (!shouldSendByCooldown({
          lastSentAt: recentEscalation?.sent_at ?? null,
          now,
          cooldownHours: 24,
        })) {
          continue
        }

        if (dryRun) continue

        const hashKey = buildCooldownHashKey({
          kind: "ESCALATION",
          recipientUserId: manager.id,
          taskId: candidate.task.id,
          referenceAt: now,
        })

        const inserted = await insertMessageLog({
          recipientUserId: manager.id,
          taskId: candidate.task.id,
          kind: "ESCALATION",
          hashKey,
        })

        if (!inserted) continue

        const sendResult = await sendSystemDirectMessage({
          senderUserId: config.bot_user_id,
          recipientUserId: manager.id,
          body: buildEscalationMessage({
            task: candidate.task,
            assigneeName: candidate.assigneeName,
            hoursWithoutProgress: candidate.hours,
          }),
          dedupeToken: hashKey,
        })

        if (sendResult.success) {
          stats.escalationsSent += 1
          await markMessageLogDelivered({
            hashKey,
            conversationId: sendResult.data.conversationId,
            messageId: sendResult.data.messageId,
          })
        } else {
          await rollbackMessageLog(hashKey)
          console.error("Task analyst escalation send failed:", sendResult.error)
        }
      }
    }

    // unassigned alert
    if (unassignedCandidates.length > 0) {
      for (const manager of managerUsers) {
        const recentUnassigned = await findLatestMessageLog({
          recipientUserId: manager.id,
          kind: "UNASSIGNED_ALERT",
        })

        if (!shouldSendByCooldown({
          lastSentAt: recentUnassigned?.sent_at ?? null,
          now,
          cooldownHours: 24,
        })) {
          continue
        }

        if (dryRun) continue

        const hashKey = `UNASSIGNED_ALERT:${manager.id}:${toISODateUTC(now)}`
        const inserted = await insertMessageLog({
          recipientUserId: manager.id,
          kind: "UNASSIGNED_ALERT",
          hashKey,
        })

        if (!inserted) continue

        const sendResult = await sendSystemDirectMessage({
          senderUserId: config.bot_user_id,
          recipientUserId: manager.id,
          body: buildUnassignedMessage(
            unassignedCandidates
              .sort((a, b) => b.hours - a.hours)
              .map((item) => ({ task: item.task, hoursWithoutProgress: item.hours }))
          ),
          dedupeToken: hashKey,
        })

        if (sendResult.success) {
          stats.unassignedAlertsSent += 1
          await markMessageLogDelivered({
            hashKey,
            conversationId: sendResult.data.conversationId,
            messageId: sendResult.data.messageId,
          })
        } else {
          await rollbackMessageLog(hashKey)
          console.error("Task analyst unassigned alert send failed:", sendResult.error)
        }
      }
    }

    // digest
    const slowSectorsForDigest = Array.from(slowSectorAccumulator.entries())
      .map(([department, item]) => ({
        department,
        stagnant: item.stagnant,
        total: item.total,
        rate: item.total > 0 ? item.stagnant / item.total : 0,
      }))
      .filter((item) => item.stagnant > 0)
      .sort((a, b) => b.rate - a.rate)

    const topTasks = openTasks
      .map((task) => {
        const latestProgressAt = progressSnapshot.latestByTask.get(task.id) ?? task.updated_at ?? task.created_at
        return {
          title: taskTitle(task),
          hours: computeHoursWithoutProgress(latestProgressAt, now),
          department: normalizeDepartment(task.department) ?? "outro",
        }
      })
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)

    const aiSummary = await generateAIDigestSummary({
      overdueCount,
      withoutAssigneeCount: unassignedCandidates.length,
      remindersSent: stats.remindersSent,
      escalationsSent: stats.escalationsSent,
      slowSectors: slowSectorsForDigest,
      topTasks,
    })

    const digestBody = buildDigestMessage({
      overdueCount,
      withoutAssigneeCount: unassignedCandidates.length,
      remindersSent: stats.remindersSent,
      escalationsSent: stats.escalationsSent,
      slowSectors: slowSectorsForDigest,
      topTasks,
      aiSummary,
    })

    for (const manager of managerUsers) {
      if (dryRun) continue

      const hashKey = `MANAGER_DIGEST:${manager.id}:${toISODateUTC(now)}:${currentLocalHour(LOCAL_TIMEZONE, now)}`
      const inserted = await insertMessageLog({
        recipientUserId: manager.id,
        kind: "MANAGER_DIGEST",
        hashKey,
      })

      if (!inserted) continue

      const sendResult = await sendSystemDirectMessage({
        senderUserId: config.bot_user_id,
        recipientUserId: manager.id,
        body: digestBody,
        dedupeToken: hashKey,
      })

      if (sendResult.success) {
        stats.digestsSent += 1
        await markMessageLogDelivered({
          hashKey,
          conversationId: sendResult.data.conversationId,
          messageId: sendResult.data.messageId,
        })
      } else {
        await rollbackMessageLog(hashKey)
        console.error("Task analyst manager digest send failed:", sendResult.error)
      }
    }

    stats.learnedThresholdsUpdated = await maybeApplyLearning({
      trigger: params.trigger,
      now,
      config,
      thresholdsMap,
      fallbackThreshold,
    })

    revalidatePath("/admin/tarefas")

    await finalizeRunRow({
      runId,
      status: "success",
      message: "Task analyst executado com sucesso.",
      stats,
    })

    return {
      ok: true,
      statusCode: 200,
      status: "success",
      message: "Task analyst executado com sucesso.",
      runId,
      stats,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar task analyst"

    await finalizeRunRow({
      runId,
      status: "failed",
      message,
      stats,
      errorDetails: {
        error: message,
      },
    })

    return {
      ok: false,
      statusCode: 500,
      status: "failed",
      message,
      runId,
      stats,
    }
  }
}

export async function recordTaskActivityEvent(params: {
  eventType: TaskActivityEventType
  taskId: string
  actorUserId?: string | null
  checklistItemId?: string | null
  eventAt?: string
  payload?: Record<string, unknown>
}) {
  if (!params.taskId?.trim()) return

  let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  try {
    supabaseAdmin = createSupabaseServiceClient()
  } catch (error) {
    console.error("Error creating service client for task activity event:", error)
    return
  }

  const { error } = await supabaseAdmin
    .from("task_activity_events")
    .insert({
      event_type: params.eventType,
      task_id: params.taskId,
      actor_user_id: params.actorUserId ?? null,
      checklist_item_id: params.checklistItemId ?? null,
      event_at: params.eventAt ?? new Date().toISOString(),
      payload: params.payload ?? {},
    })

  if (!error) return

  if (isMissingRelationError(error, "task_activity_events")) {
    // Keep backward compatibility in environments where migration was not applied yet.
    return
  }

  console.error("Error recording task activity event:", error)
}

export async function getTaskAnalystDashboardSummary(): Promise<TaskAnalystDashboardSummary | null> {
  let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  try {
    supabaseAdmin = createSupabaseServiceClient()
  } catch (error) {
    console.error("Error creating service client for task analyst dashboard:", error)
    return null
  }

  const config = await loadAnalystConfig()
  if (!config) return null

  const fallbackThreshold: DepartmentThreshold = {
    department: "_default",
    reminderHours: clampHours(config.base_reminder_hours, 12, 72),
    escalationHours: clampHours(config.base_escalation_hours, 24, 120),
    slowHours: clampHours(config.slow_sector_hours, 24, 120),
    source: "manual",
  }

  const thresholdsMap = await loadDepartmentThresholds(fallbackThreshold)

  const { data: openTasksData, error: openTasksError } = await supabaseAdmin
    .from("tasks")
    .select("id, title, status, department, assignee_id, creator_id, due_date, created_at, updated_at")
    .neq("status", "DONE")

  if (openTasksError) {
    console.error("Error loading open tasks for dashboard:", openTasksError)
    return null
  }

  const openTasks = (openTasksData ?? []) as TaskRow[]

  const { data: completedTasksData, error: completedTasksError } = await supabaseAdmin
    .from("tasks")
    .select("id, created_at, completed_at")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(600)

  if (completedTasksError) {
    console.error("Error loading completed tasks for dashboard:", completedTasksError)
    return null
  }

  const assigneeIds = Array.from(new Set(openTasks.map((task) => task.assignee_id).filter((id): id is string => Boolean(id))))
  const assigneesById = await loadUsersById(assigneeIds)
  const progressSnapshot = await loadProgressSnapshot(openTasks)

  const now = new Date()
  const overdueOpenTasks = openTasks.filter((task) => {
    const dueDate = parseDate(task.due_date)
    return Boolean(dueDate && dueDate.getTime() < now.getTime())
  }).length

  const withoutAssignee = openTasks.filter((task) => !task.assignee_id).length

  const firstProgressHours = Array.from(progressSnapshot.firstProgressHoursByTask.values())
  const avgHoursToFirstProgress = firstProgressHours.length > 0
    ? Math.round(firstProgressHours.reduce((sum, value) => sum + value, 0) / firstProgressHours.length)
    : null

  const completionHours = ((completedTasksData ?? []) as Array<{ created_at: string; completed_at: string | null }>)
    .map((item) => {
      const createdAt = parseDate(item.created_at)
      const completedAt = parseDate(item.completed_at)
      if (!createdAt || !completedAt) return null
      return Math.max(0, Math.floor((completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)))
    })
    .filter((value): value is number => Number.isFinite(value as number))

  const avgHoursToCompletion = completionHours.length > 0
    ? Math.round(completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length)
    : null

  const slowSectorsMap = new Map<string, { totalOpen: number; stagnant: number; thresholdHours: number }>()

  const mostStagnantTasks = openTasks
    .map((task) => {
      const department = normalizeDepartment(task.department) ?? "outro"
      const threshold = pickTaskThreshold({
        department,
        thresholds: thresholdsMap,
        fallback: {
          ...fallbackThreshold,
          department,
        },
      })

      const lastProgressAt = progressSnapshot.latestByTask.get(task.id) ?? task.updated_at ?? task.created_at
      const hoursWithoutProgress = computeHoursWithoutProgress(lastProgressAt, now)

      const current = slowSectorsMap.get(department) ?? {
        totalOpen: 0,
        stagnant: 0,
        thresholdHours: threshold.slowHours,
      }

      current.totalOpen += 1
      if (hoursWithoutProgress >= threshold.slowHours) current.stagnant += 1
      slowSectorsMap.set(department, current)

      const assignee = task.assignee_id ? assigneesById.get(task.assignee_id) : null

      return {
        taskId: task.id,
        title: taskTitle(task),
        status: task.status,
        department,
        assigneeName: assignee?.name?.trim() || assignee?.email?.trim() || "Sem responsável",
        dueDate: task.due_date,
        lastProgressAt,
        hoursWithoutProgress,
      }
    })
    .sort((a, b) => b.hoursWithoutProgress - a.hoursWithoutProgress)
    .slice(0, 15)

  const slowSectors = Array.from(slowSectorsMap.entries())
    .map(([department, item]) => ({
      department,
      totalOpen: item.totalOpen,
      stagnant: item.stagnant,
      thresholdHours: item.thresholdHours,
      stagnationRate: item.totalOpen > 0 ? item.stagnant / item.totalOpen : 0,
    }))
    .sort((a, b) => b.stagnationRate - a.stagnationRate)

  return {
    generatedAt: new Date().toISOString(),
    openTasks: openTasks.length,
    overdueOpenTasks,
    withoutAssignee,
    avgHoursToFirstProgress,
    avgHoursToCompletion,
    slowSectors,
    mostStagnantTasks,
  }
}
