"use server"

import { revalidatePath } from "next/cache"
import OpenAI from "openai"

import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { sendSystemDirectMessage } from "@/services/internal-chat-service"
import {
  applyLearningSmoothing,
  buildBlockerDependencyKey,
  buildCooldownHashKey,
  clampHours,
  computeHoursWithoutProgress,
  percentile75,
  pickTaskThreshold,
  shouldSendByCooldown,
  type DepartmentThreshold,
} from "@/services/task-analyst-utils"

type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED"
type Department = "vendas" | "cadastro" | "energia" | "juridico" | "financeiro" | "ti" | "diretoria" | "obras" | "outro"
type TaskBlockerStatus = "OPEN" | "RESOLVED" | "CANCELED"
type TaskBlockerOwnerType = "USER" | "DEPARTMENT"

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
  department?: string | null
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
  metadata?: Record<string, unknown> | null
}

type TaskBlockerRow = {
  id: string
  task_id: string
  status: TaskBlockerStatus
  owner_type: TaskBlockerOwnerType
  owner_user_id: string | null
  owner_department: string | null
  reason: string
  expected_unblock_at: string
  opened_by_user_id: string
  opened_at: string
  resolved_by_user_id: string | null
  resolved_at: string | null
}

type AnalystConfigRow = {
  id: number
  enabled: boolean
  bot_user_id: string | null
  history_window_days: number
  base_reminder_hours: number
  base_escalation_hours: number
  slow_sector_hours: number
  feedback_required_days?: number | null
  feedback_escalation_days?: number | null
  learning_enabled: boolean
}

export type TaskActivityEventType =
  | "TASK_CREATED"
  | "TASK_STATUS_CHANGED"
  | "TASK_ASSIGNEE_CHANGED"
  | "TASK_ASSIGNEE_TRANSFERRED"
  | "TASK_CHECKLIST_CREATED"
  | "TASK_CHECKLIST_DECISION_CHANGED"
  | "TASK_COMMENT_CREATED"
  | "TASK_BLOCKER_OPENED"
  | "TASK_BLOCKER_RESOLVED"

export type TaskAnalystMessageKind = "REMINDER" | "ESCALATION" | "MANAGER_DIGEST" | "UNASSIGNED_ALERT" | "BLOCKER_REMINDER"

export type TaskAnalystRunStatus = "running" | "success" | "partial" | "failed" | "skipped"

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
  overdueTasks: Array<{
    taskId: string
    title: string
    status: string
    department: string
    assigneeName: string
    dueDate: string
    overdueHours: number
    lastProgressAt: string
    hoursWithoutProgress: number
  }>
  blockerLoadByUser: Array<{
    ownerUserId: string
    ownerName: string
    blockedTasks: number
    activeBlockers: number
  }>
  blockerLoadByDepartment: Array<{
    department: string
    blockedTasks: number
    activeBlockers: number
  }>
  blockedTasks: Array<{
    blockerId: string
    taskId: string
    taskTitle: string
    department: string
    ownerType: TaskBlockerOwnerType
    ownerLabel: string
    reason: string
    expectedUnblockAt: string
    openedAt: string
    blockerAgeHours: number
  }>
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
  "TASK_ASSIGNEE_TRANSFERRED",
  "TASK_CHECKLIST_CREATED",
  "TASK_CHECKLIST_DECISION_CHANGED",
  "TASK_COMMENT_CREATED",
  "TASK_BLOCKER_OPENED",
  "TASK_BLOCKER_RESOLVED",
])

const INACTIVE_USER_STATUSES = new Set(["inativo", "inactive", "suspended"])
const DEFAULT_FEEDBACK_REQUIRED_DAYS = 5
const DEFAULT_FEEDBACK_ESCALATION_DAYS = 1
const FEEDBACK_REQUIRED_FLOW_KEY = "feedback_required_days"

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

function parseMissingColumnError(message?: string | null) {
  if (!message) return null
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
  if (!match) return null
  return {
    column: match[1],
    table: match[2],
  }
}

function clampDays(value: number | null | undefined, min: number, max: number, fallback: number) {
  const safe = typeof value === "number" ? value : fallback
  return clampHours(safe, min, max)
}

function daysToHours(days: number) {
  return Math.max(1, days) * 24
}

function formatDurationDaysAndHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "0h"
  const wholeHours = Math.floor(hours)
  const days = Math.floor(wholeHours / 24)
  const remainingHours = wholeHours % 24

  if (days <= 0) return `${wholeHours}h`
  if (remainingHours === 0) return `${days} dia(s) (${wholeHours}h)`
  return `${days} dia(s) e ${remainingHours}h (${wholeHours}h)`
}

async function loadAnalystConfig() {
  const supabaseAdmin = createSupabaseServiceClient()

  let { data, error } = await supabaseAdmin
    .from("task_analyst_config")
    .select("id, enabled, bot_user_id, history_window_days, base_reminder_hours, base_escalation_hours, slow_sector_hours, feedback_required_days, feedback_escalation_days, learning_enabled")
    .eq("id", 1)
    .maybeSingle()

  const missingColumn = parseMissingColumnError(error?.message)
  if (
    error &&
    missingColumn &&
    missingColumn.table === "task_analyst_config" &&
    (missingColumn.column === "feedback_required_days" || missingColumn.column === "feedback_escalation_days")
  ) {
    const fallback = await supabaseAdmin
      .from("task_analyst_config")
      .select("id, enabled, bot_user_id, history_window_days, base_reminder_hours, base_escalation_hours, slow_sector_hours, learning_enabled")
      .eq("id", 1)
      .maybeSingle()

    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) {
    if (isMissingRelationError(error, "task_analyst_config")) return null
    throw new Error(error.message)
  }

  const row = (data as AnalystConfigRow | null) ?? null
  if (!row) return null

  return {
    ...row,
    feedback_required_days: clampDays(row.feedback_required_days, 1, 30, DEFAULT_FEEDBACK_REQUIRED_DAYS),
    feedback_escalation_days: clampDays(row.feedback_escalation_days, 1, 14, DEFAULT_FEEDBACK_ESCALATION_DAYS),
  }
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
    .select("id, name, email, role, department, status")
    .eq("role", "adm_mestre")

  if (error) throw new Error(error.message)

  return ((data ?? []) as AnalystUserRow[]).filter((user) => !isInactiveStatus(user.status))
}

function normalizeTaskBlockerStatus(value?: string | null): TaskBlockerStatus {
  if (value === "RESOLVED" || value === "CANCELED") return value
  return "OPEN"
}

function normalizeTaskBlockerOwnerType(value?: string | null): TaskBlockerOwnerType {
  if (value === "DEPARTMENT") return "DEPARTMENT"
  return "USER"
}

async function loadOpenTaskBlockers(taskIds: string[]) {
  if (taskIds.length === 0) return [] as TaskBlockerRow[]

  const supabaseAdmin = createSupabaseServiceClient()
  const { data, error } = await supabaseAdmin
    .from("task_blockers")
    .select(`
      id,
      task_id,
      status,
      owner_type,
      owner_user_id,
      owner_department,
      reason,
      expected_unblock_at,
      opened_by_user_id,
      opened_at,
      resolved_by_user_id,
      resolved_at
    `)
    .in("task_id", taskIds)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: true })

  if (error) {
    if (isMissingRelationError(error, "task_blockers")) return [] as TaskBlockerRow[]
    throw new Error(error.message)
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    task_id: String(row.task_id ?? ""),
    status: normalizeTaskBlockerStatus(typeof row.status === "string" ? row.status : null),
    owner_type: normalizeTaskBlockerOwnerType(typeof row.owner_type === "string" ? row.owner_type : null),
    owner_user_id: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
    owner_department: normalizeDepartment(typeof row.owner_department === "string" ? row.owner_department : null),
    reason: String(row.reason ?? ""),
    expected_unblock_at: String(row.expected_unblock_at ?? ""),
    opened_by_user_id: String(row.opened_by_user_id ?? ""),
    opened_at: String(row.opened_at ?? ""),
    resolved_by_user_id: typeof row.resolved_by_user_id === "string" ? row.resolved_by_user_id : null,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
  }))
}

async function loadSupervisorUsers() {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, department, status")
    .eq("role", "supervisor")

  if (error) throw new Error(error.message)

  return ((data ?? []) as AnalystUserRow[]).filter((user) => {
    if (isInactiveStatus(user.status)) return false
    return Boolean(normalizeDepartment(user.department))
  })
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
    .select("recipient_user_id, task_id, kind, sent_at, metadata")
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

async function findLatestMessageLogByFlow(params: {
  recipientUserId: string
  taskId?: string | null
  kind: TaskAnalystMessageKind
  flow: string
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  let query = supabaseAdmin
    .from("task_analyst_message_log")
    .select("recipient_user_id, task_id, kind, sent_at, metadata")
    .eq("recipient_user_id", params.recipientUserId)
    .eq("kind", params.kind)
    .eq("metadata->>flow", params.flow)
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

async function findLatestBlockerReminderByDependency(params: {
  taskId: string
  dependencyKey: string
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("task_analyst_message_log")
    .select("recipient_user_id, task_id, kind, sent_at, metadata")
    .eq("kind", "BLOCKER_REMINDER")
    .eq("task_id", params.taskId)
    .eq("metadata->>dependency_key", params.dependencyKey)
    .order("sent_at", { ascending: false })
    .limit(1)

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
  metadata?: Record<string, unknown> | null
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
      metadata: params.metadata ?? {},
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

  const { data: currentData, error: currentError } = await supabaseAdmin
    .from("task_analyst_message_log")
    .select("metadata")
    .eq("hash_key", params.hashKey)
    .maybeSingle()

  if (currentError && !isMissingRelationError(currentError, "task_analyst_message_log")) {
    console.error("Error loading current metadata for task analyst message log:", currentError)
  }

  const currentMetadata = (currentData as { metadata?: Record<string, unknown> | null } | null)?.metadata ?? {}

  const { error } = await supabaseAdmin
    .from("task_analyst_message_log")
    .update({
      conversation_id: params.conversationId,
      metadata: {
        ...currentMetadata,
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

function buildFeedbackRequiredMessage(params: {
  task: TaskRow
  hoursWithoutProgress: number
  feedbackRequiredDays: number
  feedbackEscalationDays: number
}) {
  return [
    `Ação obrigatória do Analista IA (${params.feedbackRequiredDays} dia(s) sem avanço).`,
    `A tarefa \"${taskTitle(params.task)}\" está há ${formatDurationDaysAndHours(params.hoursWithoutProgress)} sem atividade.`,
    `Status atual: ${params.task.status}. Prazo: ${renderDueDateLabel(params.task.due_date)}.`,
    "Registre um feedback agora com uma destas opções:",
    "1) atualizar prazo (ETA) da tarefa,",
    "2) transferir responsabilidade com justificativa,",
    "3) abrir bloqueio formal por pessoa/setor.",
    `Se não houver avanço em ${params.feedbackEscalationDays} dia(s) após este aviso, haverá escalonamento para gestão.`,
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

function buildFeedbackEscalationMessage(params: {
  task: TaskRow
  assigneeName: string
  hoursWithoutProgress: number
  feedbackRequestedAt: string
  feedbackEscalationDays: number
}) {
  return [
    "Escalonamento de feedback pendente (Analista IA).",
    `A tarefa \"${taskTitle(params.task)}\" está sem avanço há ${formatDurationDaysAndHours(params.hoursWithoutProgress)}.`,
    `Responsável atual: ${params.assigneeName}.`,
    `Feedback obrigatório enviado em ${renderDueDateLabel(params.feedbackRequestedAt)} e sem reação operacional após ${params.feedbackEscalationDays} dia(s).`,
    "Sugerido: alinhar ETA real, decidir transferência ou formalizar bloqueio.",
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

function buildBlockerOwnerLabel(params: {
  blocker: TaskBlockerRow
  usersById: Map<string, AnalystUserRow>
}) {
  if (params.blocker.owner_type === "USER") {
    const userId = params.blocker.owner_user_id
    const user = userId ? params.usersById.get(userId) : null
    return user?.name?.trim() || user?.email?.trim() || "Pessoa não identificada"
  }

  return `Setor ${formatDepartmentLabel(params.blocker.owner_department ?? "outro")}`
}

function buildBlockerReminderMessage(params: {
  task: TaskRow
  blocker: TaskBlockerRow
  ownerLabel: string
  hoursWithoutProgress: number
}) {
  return [
    "Cobrança automática de dependência (Analista IA).",
    `A tarefa \"${taskTitle(params.task)}\" está bloqueada e sem avanço há ${params.hoursWithoutProgress}h.`,
    `Dependência: ${params.ownerLabel}.`,
    `Motivo informado: ${params.blocker.reason}.`,
    `Previsão de desbloqueio: ${renderDueDateLabel(params.blocker.expected_unblock_at)}.`,
    "Ação esperada: atualizar o desbloqueio ou responder com novo prazo.",
  ].join("\n")
}

async function generateAIDigestSummary(input: {
  overdueCount: number
  withoutAssigneeCount: number
  activeBlockersCount: number
  remindersSent: number
  escalationsSent: number
  slowSectors: Array<{ department: string; rate: number; stagnant: number; total: number }>
  topTasks: Array<{ title: string; hours: number; department: string }>
  topBlockers: Array<{ owner: string; blockedTasks: number }>
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
      `Bloqueios ativos: ${input.activeBlockersCount}`,
      `Lembretes enviados: ${input.remindersSent}`,
      `Escalonamentos enviados: ${input.escalationsSent}`,
      `Setores lentos: ${JSON.stringify(input.slowSectors)}`,
      `Top tarefas paradas: ${JSON.stringify(input.topTasks)}`,
      `Top dependências bloqueando tarefas: ${JSON.stringify(input.topBlockers)}`,
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
  activeBlockersCount: number
  remindersSent: number
  escalationsSent: number
  slowSectors: Array<{ department: string; rate: number; stagnant: number; total: number }>
  topTasks: Array<{ title: string; hours: number; department: string }>
  topBlockers: Array<{ owner: string; blockedTasks: number }>
  oldestBlockedTasks: Array<{ title: string; ownerLabel: string; ageHours: number }>
  aiSummary: string | null
}) {
  const headline = [
    "Resumo do Analista IA (tarefas)",
    `Atrasadas: ${input.overdueCount}`,
    `Sem responsável: ${input.withoutAssigneeCount}`,
    `Bloqueios ativos: ${input.activeBlockersCount}`,
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

  const topBlockers = input.topBlockers.length === 0
    ? ["Bloqueios ativos: nenhum."]
    : [
      "Bloqueios ativos por dependência:",
      ...input.topBlockers.slice(0, 5).map((item, index) => `${index + 1}. ${item.owner}: ${item.blockedTasks} tarefa(s)`),
    ]

  const oldestBlockedTasks = input.oldestBlockedTasks.length === 0
    ? ["Tarefas bloqueadas antigas: nenhuma."]
    : [
      "Exemplos de tarefas bloqueadas antigas:",
      ...input.oldestBlockedTasks.slice(0, 5).map((item, index) => `${index + 1}. ${item.title} • ${item.ownerLabel} • ${item.ageHours}h`),
    ]

  const aiBlock = input.aiSummary ? ["", "Leitura IA:", input.aiSummary] : []

  return [headline, ...slowLines, ...topTasks, ...topBlockers, ...oldestBlockedTasks, ...aiBlock].join("\n")
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
    const feedbackRequiredDays = clampDays(config.feedback_required_days, 1, 30, DEFAULT_FEEDBACK_REQUIRED_DAYS)
    const feedbackEscalationDays = clampDays(config.feedback_escalation_days, 1, 14, DEFAULT_FEEDBACK_ESCALATION_DAYS)
    const feedbackRequiredHours = daysToHours(feedbackRequiredDays)
    const feedbackEscalationDelayHours = daysToHours(feedbackEscalationDays)

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

    const [openTasks, managerUsers, supervisorUsers] = await Promise.all([
      loadOpenTasks(),
      loadAdmMestreUsers(),
      loadSupervisorUsers(),
    ])

    stats.tasksScanned = openTasks.length

    const taskIds = openTasks.map((task) => task.id)
    const [activeBlockers, progressSnapshot] = await Promise.all([
      loadOpenTaskBlockers(taskIds),
      loadProgressSnapshot(openTasks),
    ])

    const blockersByTask = new Map<string, TaskBlockerRow[]>()
    activeBlockers.forEach((blocker) => {
      const current = blockersByTask.get(blocker.task_id) ?? []
      current.push(blocker)
      blockersByTask.set(blocker.task_id, current)
    })

    const assigneeIds = Array.from(new Set(openTasks.map((task) => task.assignee_id).filter((id): id is string => Boolean(id))))
    const blockerOwnerIds = Array.from(new Set(activeBlockers.map((blocker) => blocker.owner_user_id).filter((id): id is string => Boolean(id))))
    const usersById = await loadUsersById(Array.from(new Set([...assigneeIds, ...blockerOwnerIds])))

    const supervisorsByDepartment = new Map<string, AnalystUserRow[]>()
    supervisorUsers.forEach((user) => {
      const department = normalizeDepartment(user.department)
      if (!department) return
      const current = supervisorsByDepartment.get(department) ?? []
      current.push(user)
      supervisorsByDepartment.set(department, current)
    })

    const reminderCandidates: Array<{ task: TaskRow; recipientId: string; hours: number; threshold: DepartmentThreshold }> = []
    const escalationCandidates: Array<{ task: TaskRow; recipientId: string; hours: number; assigneeName: string; threshold: DepartmentThreshold }> = []
    const feedbackRequiredCandidates: Array<{ task: TaskRow; recipientId: string; assigneeName: string; hours: number }> = []
    const unassignedCandidates: Array<{ task: TaskRow; hours: number }> = []
    const slowSectorAccumulator = new Map<string, { total: number; stagnant: number; thresholdHours: number }>()
    const blockerReminderCandidates = new Map<string, {
      task: TaskRow
      dependencyKey: string
      recipients: AnalystUserRow[]
      ownerLabel: string
      hours: number
      blockers: TaskBlockerRow[]
    }>()

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

      const taskBlockers = blockersByTask.get(task.id) ?? []

      if (taskBlockers.length > 0) {
        taskBlockers.forEach((blocker) => {
          const dependencyKey = buildBlockerDependencyKey({
            ownerType: blocker.owner_type,
            ownerUserId: blocker.owner_user_id,
            ownerDepartment: blocker.owner_department,
          })
          if (!dependencyKey) return

          const recipients = blocker.owner_type === "USER"
            ? (() => {
              const userId = blocker.owner_user_id
              if (!userId) return [] as AnalystUserRow[]
              const ownerUser = usersById.get(userId)
              if (!ownerUser || isInactiveStatus(ownerUser.status)) return [] as AnalystUserRow[]
              return [ownerUser]
            })()
            : (() => {
              const department = normalizeDepartment(blocker.owner_department)
              const supervisors = department ? (supervisorsByDepartment.get(department) ?? []) : []
              const merged = [...supervisors, ...managerUsers]
              const deduped = new Map<string, AnalystUserRow>()
              merged.forEach((user) => {
                if (isInactiveStatus(user.status)) return
                deduped.set(user.id, user)
              })
              return Array.from(deduped.values())
            })()

          if (recipients.length === 0) return

          const ownerLabel = buildBlockerOwnerLabel({
            blocker,
            usersById,
          })

          const candidateKey = `${task.id}:${dependencyKey}`
          const existing = blockerReminderCandidates.get(candidateKey)
          if (!existing) {
            blockerReminderCandidates.set(candidateKey, {
              task,
              dependencyKey,
              recipients,
              ownerLabel,
              hours: hoursWithoutProgress,
              blockers: [blocker],
            })
            return
          }

          existing.hours = Math.max(existing.hours, hoursWithoutProgress)
          existing.blockers.push(blocker)
          existing.ownerLabel = existing.ownerLabel || ownerLabel

          const recipientMap = new Map<string, AnalystUserRow>()
          existing.recipients.forEach((recipient) => recipientMap.set(recipient.id, recipient))
          recipients.forEach((recipient) => recipientMap.set(recipient.id, recipient))
          existing.recipients = Array.from(recipientMap.values())
          blockerReminderCandidates.set(candidateKey, existing)
        })

        if (!task.assignee_id) {
          unassignedCandidates.push({ task, hours: hoursWithoutProgress })
        }

        // When task is blocked, cobrança shifts to dependency, not the assignee.
        return
      }

      if (!task.assignee_id) {
        unassignedCandidates.push({ task, hours: hoursWithoutProgress })
        return
      }

      const assignee = usersById.get(task.assignee_id)
      const assigneeName = assignee?.name?.trim() || assignee?.email?.trim() || "Sem nome"

      if (hoursWithoutProgress >= feedbackRequiredHours) {
        feedbackRequiredCandidates.push({
          task,
          recipientId: task.assignee_id,
          assigneeName,
          hours: hoursWithoutProgress,
        })
        return
      }

      reminderCandidates.push({
        task,
        recipientId: task.assignee_id,
        hours: hoursWithoutProgress,
        threshold,
      })

      escalationCandidates.push({
        task,
        recipientId: task.assignee_id,
        hours: hoursWithoutProgress,
        assigneeName,
        threshold,
      })
    })

    const toSendReminders = reminderCandidates.filter((candidate) => candidate.hours >= candidate.threshold.reminderHours)
    const toSendEscalations = escalationCandidates.filter((candidate) => candidate.hours >= candidate.threshold.escalationHours)

    const overdueCount = openTasks.filter((task) => {
      const dueDate = parseDate(task.due_date)
      return Boolean(dueDate && dueDate.getTime() < now.getTime())
    }).length

    // feedback required (5+ days without activity)
    for (const candidate of feedbackRequiredCandidates) {
      const recentFeedback = await findLatestMessageLogByFlow({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        kind: "REMINDER",
        flow: FEEDBACK_REQUIRED_FLOW_KEY,
      })

      if (!shouldSendByCooldown({
        lastSentAt: recentFeedback?.sent_at ?? null,
        now,
        cooldownHours: 24,
      })) {
        continue
      }

      if (dryRun) continue

      const hashKey = [
        "REMINDER",
        candidate.recipientId,
        candidate.task.id,
        FEEDBACK_REQUIRED_FLOW_KEY,
        toISODateUTC(now),
      ].join(":")

      const inserted = await insertMessageLog({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        kind: "REMINDER",
        hashKey,
        metadata: {
          flow: FEEDBACK_REQUIRED_FLOW_KEY,
          feedback_deadline_days: feedbackEscalationDays,
          feedback_deadline_hours: feedbackEscalationDelayHours,
        },
      })

      if (!inserted) continue

      const sendResult = await sendSystemDirectMessage({
        senderUserId: config.bot_user_id,
        recipientUserId: candidate.recipientId,
        body: buildFeedbackRequiredMessage({
          task: candidate.task,
          hoursWithoutProgress: candidate.hours,
          feedbackRequiredDays,
          feedbackEscalationDays,
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
        console.error("Task analyst feedback-required reminder send failed:", sendResult.error)
      }
    }

    // feedback pending escalation (24h without reaction after required feedback request)
    for (const candidate of feedbackRequiredCandidates) {
      const lastFeedbackRequest = await findLatestMessageLogByFlow({
        recipientUserId: candidate.recipientId,
        taskId: candidate.task.id,
        kind: "REMINDER",
        flow: FEEDBACK_REQUIRED_FLOW_KEY,
      })

      if (!lastFeedbackRequest?.sent_at) continue

      if (!shouldSendByCooldown({
        lastSentAt: lastFeedbackRequest.sent_at,
        now,
        cooldownHours: feedbackEscalationDelayHours,
      })) {
        continue
      }

      const feedbackSentAtDate = parseDate(lastFeedbackRequest.sent_at)
      const latestProgressAt = progressSnapshot.latestByTask.get(candidate.task.id) ?? candidate.task.updated_at
      const latestProgressDate = parseDate(latestProgressAt)

      const stillWithoutReaction = Boolean(
        feedbackSentAtDate &&
        latestProgressDate &&
        latestProgressDate.getTime() <= feedbackSentAtDate.getTime()
      )

      if (!stillWithoutReaction) continue

      for (const manager of managerUsers) {
        const recentEscalation = await findLatestMessageLogByFlow({
          recipientUserId: manager.id,
          taskId: candidate.task.id,
          kind: "ESCALATION",
          flow: FEEDBACK_REQUIRED_FLOW_KEY,
        })

        if (!shouldSendByCooldown({
          lastSentAt: recentEscalation?.sent_at ?? null,
          now,
          cooldownHours: 24,
        })) {
          continue
        }

        if (dryRun) continue

        const hashKey = [
          "ESCALATION",
          manager.id,
          candidate.task.id,
          FEEDBACK_REQUIRED_FLOW_KEY,
          toISODateUTC(now),
        ].join(":")

        const inserted = await insertMessageLog({
          recipientUserId: manager.id,
          taskId: candidate.task.id,
          kind: "ESCALATION",
          hashKey,
          metadata: {
            flow: FEEDBACK_REQUIRED_FLOW_KEY,
            assignee_user_id: candidate.recipientId,
            feedback_requested_at: lastFeedbackRequest.sent_at,
          },
        })

        if (!inserted) continue

        const sendResult = await sendSystemDirectMessage({
          senderUserId: config.bot_user_id,
          recipientUserId: manager.id,
          body: buildFeedbackEscalationMessage({
            task: candidate.task,
            assigneeName: candidate.assigneeName,
            hoursWithoutProgress: candidate.hours,
            feedbackRequestedAt: lastFeedbackRequest.sent_at,
            feedbackEscalationDays,
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
          console.error("Task analyst feedback escalation send failed:", sendResult.error)
        }
      }
    }

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

    // blocker reminders (dependency-driven cobrança)
    for (const candidate of blockerReminderCandidates.values()) {
      const recentByDependency = await findLatestBlockerReminderByDependency({
        taskId: candidate.task.id,
        dependencyKey: candidate.dependencyKey,
      })

      if (!shouldSendByCooldown({
        lastSentAt: recentByDependency?.sent_at ?? null,
        now,
        cooldownHours: 24,
      })) {
        continue
      }

      if (dryRun) continue

      const oldestBlocker = candidate.blockers
        .slice()
        .sort((a, b) => {
          const left = parseDate(a.opened_at)?.getTime() ?? 0
          const right = parseDate(b.opened_at)?.getTime() ?? 0
          return left - right
        })[0]

      if (!oldestBlocker) continue

      for (const recipient of candidate.recipients) {
        const hashKey = [
          "BLOCKER_REMINDER",
          recipient.id,
          candidate.task.id,
          candidate.dependencyKey,
          toISODateUTC(now),
        ].join(":")

        const inserted = await insertMessageLog({
          recipientUserId: recipient.id,
          taskId: candidate.task.id,
          kind: "BLOCKER_REMINDER",
          hashKey,
          metadata: {
            dependency_key: candidate.dependencyKey,
            blocker_id: oldestBlocker.id,
            owner_type: oldestBlocker.owner_type,
            owner_user_id: oldestBlocker.owner_user_id,
            owner_department: oldestBlocker.owner_department,
          },
        })

        if (!inserted) continue

        const sendResult = await sendSystemDirectMessage({
          senderUserId: config.bot_user_id,
          recipientUserId: recipient.id,
          body: buildBlockerReminderMessage({
            task: candidate.task,
            blocker: oldestBlocker,
            ownerLabel: candidate.ownerLabel,
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
          console.error("Task analyst blocker reminder send failed:", sendResult.error)
        }
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

    const taskById = new Map<string, TaskRow>()
    openTasks.forEach((task) => taskById.set(task.id, task))

    const blockerDependencyStats = new Map<string, { owner: string; taskIds: Set<string>; activeBlockers: number }>()
    const oldestBlockedTasks = activeBlockers
      .map((blocker) => {
        const task = taskById.get(blocker.task_id)
        if (!task) return null

        const ownerLabel = buildBlockerOwnerLabel({
          blocker,
          usersById,
        })
        const ageHours = computeHoursWithoutProgress(blocker.opened_at, now)
        const dependencyKey = buildBlockerDependencyKey({
          ownerType: blocker.owner_type,
          ownerUserId: blocker.owner_user_id,
          ownerDepartment: blocker.owner_department,
        }) ?? `${blocker.owner_type}:${blocker.id}`

        const currentDependency = blockerDependencyStats.get(dependencyKey) ?? {
          owner: ownerLabel,
          taskIds: new Set<string>(),
          activeBlockers: 0,
        }
        currentDependency.taskIds.add(task.id)
        currentDependency.activeBlockers += 1
        blockerDependencyStats.set(dependencyKey, currentDependency)

        return {
          title: taskTitle(task),
          ownerLabel,
          ageHours,
        }
      })
      .filter((item): item is { title: string; ownerLabel: string; ageHours: number } => Boolean(item))
      .sort((a, b) => b.ageHours - a.ageHours)
      .slice(0, 8)

    const topBlockers = Array.from(blockerDependencyStats.values())
      .map((item) => ({
        owner: item.owner,
        blockedTasks: item.taskIds.size,
        activeBlockers: item.activeBlockers,
      }))
      .sort((a, b) => {
        if (b.blockedTasks !== a.blockedTasks) return b.blockedTasks - a.blockedTasks
        return b.activeBlockers - a.activeBlockers
      })
      .slice(0, 8)

    const aiSummary = await generateAIDigestSummary({
      overdueCount,
      withoutAssigneeCount: unassignedCandidates.length,
      activeBlockersCount: activeBlockers.length,
      remindersSent: stats.remindersSent,
      escalationsSent: stats.escalationsSent,
      slowSectors: slowSectorsForDigest,
      topTasks,
      topBlockers: topBlockers.map((item) => ({
        owner: item.owner,
        blockedTasks: item.blockedTasks,
      })),
    })

    const digestBody = buildDigestMessage({
      overdueCount,
      withoutAssigneeCount: unassignedCandidates.length,
      activeBlockersCount: activeBlockers.length,
      remindersSent: stats.remindersSent,
      escalationsSent: stats.escalationsSent,
      slowSectors: slowSectorsForDigest,
      topTasks,
      topBlockers: topBlockers.map((item) => ({
        owner: item.owner,
        blockedTasks: item.blockedTasks,
      })),
      oldestBlockedTasks,
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

  const taskIds = openTasks.map((task) => task.id)
  const activeBlockers = await loadOpenTaskBlockers(taskIds)
  const assigneeIds = Array.from(new Set(openTasks.map((task) => task.assignee_id).filter((id): id is string => Boolean(id))))
  const blockerOwnerIds = Array.from(new Set(activeBlockers.map((blocker) => blocker.owner_user_id).filter((id): id is string => Boolean(id))))
  const usersById = await loadUsersById(Array.from(new Set([...assigneeIds, ...blockerOwnerIds])))
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
  const taskById = new Map<string, TaskRow>()
  openTasks.forEach((task) => taskById.set(task.id, task))

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

      const assignee = task.assignee_id ? usersById.get(task.assignee_id) : null

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

  const overdueTasks = openTasks
    .map((task) => {
      const dueDate = parseDate(task.due_date)
      if (!dueDate || dueDate.getTime() >= now.getTime()) return null

      const lastProgressAt = progressSnapshot.latestByTask.get(task.id) ?? task.updated_at ?? task.created_at
      const hoursWithoutProgress = computeHoursWithoutProgress(lastProgressAt, now)
      const overdueHours = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60)))
      const assignee = task.assignee_id ? usersById.get(task.assignee_id) : null

      return {
        taskId: task.id,
        title: taskTitle(task),
        status: task.status,
        department: normalizeDepartment(task.department) ?? "outro",
        assigneeName: assignee?.name?.trim() || assignee?.email?.trim() || "Sem responsável",
        dueDate: task.due_date ?? dueDate.toISOString(),
        overdueHours,
        lastProgressAt,
        hoursWithoutProgress,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.overdueHours - a.overdueHours)
    .slice(0, 50)

  const blockerLoadByUserMap = new Map<string, { ownerUserId: string; ownerName: string; taskIds: Set<string>; activeBlockers: number }>()
  const blockerLoadByDepartmentMap = new Map<string, { department: string; taskIds: Set<string>; activeBlockers: number }>()

  const blockedTasks = activeBlockers
    .map((blocker) => {
      const task = taskById.get(blocker.task_id)
      if (!task) return null

      const taskDepartment = normalizeDepartment(task.department) ?? "outro"
      const ownerLabel = buildBlockerOwnerLabel({
        blocker,
        usersById,
      })
      const blockerAgeHours = computeHoursWithoutProgress(blocker.opened_at, now)

      if (blocker.owner_type === "USER" && blocker.owner_user_id) {
        const ownerUser = usersById.get(blocker.owner_user_id)
        const ownerName = ownerUser?.name?.trim() || ownerUser?.email?.trim() || "Pessoa não identificada"
        const current = blockerLoadByUserMap.get(blocker.owner_user_id) ?? {
          ownerUserId: blocker.owner_user_id,
          ownerName,
          taskIds: new Set<string>(),
          activeBlockers: 0,
        }
        current.taskIds.add(task.id)
        current.activeBlockers += 1
        blockerLoadByUserMap.set(blocker.owner_user_id, current)
      }

      if (blocker.owner_type === "DEPARTMENT") {
        const ownerDepartment = normalizeDepartment(blocker.owner_department) ?? "outro"
        const current = blockerLoadByDepartmentMap.get(ownerDepartment) ?? {
          department: ownerDepartment,
          taskIds: new Set<string>(),
          activeBlockers: 0,
        }
        current.taskIds.add(task.id)
        current.activeBlockers += 1
        blockerLoadByDepartmentMap.set(ownerDepartment, current)
      }

      return {
        blockerId: blocker.id,
        taskId: task.id,
        taskTitle: taskTitle(task),
        department: taskDepartment,
        ownerType: blocker.owner_type,
        ownerLabel,
        reason: blocker.reason,
        expectedUnblockAt: blocker.expected_unblock_at,
        openedAt: blocker.opened_at,
        blockerAgeHours,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.blockerAgeHours - a.blockerAgeHours)
    .slice(0, 50)

  const blockerLoadByUser = Array.from(blockerLoadByUserMap.values())
    .map((item) => ({
      ownerUserId: item.ownerUserId,
      ownerName: item.ownerName,
      blockedTasks: item.taskIds.size,
      activeBlockers: item.activeBlockers,
    }))
    .sort((a, b) => {
      if (b.blockedTasks !== a.blockedTasks) return b.blockedTasks - a.blockedTasks
      return b.activeBlockers - a.activeBlockers
    })

  const blockerLoadByDepartment = Array.from(blockerLoadByDepartmentMap.values())
    .map((item) => ({
      department: item.department,
      blockedTasks: item.taskIds.size,
      activeBlockers: item.activeBlockers,
    }))
    .sort((a, b) => {
      if (b.blockedTasks !== a.blockedTasks) return b.blockedTasks - a.blockedTasks
      return b.activeBlockers - a.activeBlockers
    })

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
    overdueTasks,
    blockerLoadByUser,
    blockerLoadByDepartment,
    blockedTasks,
    slowSectors,
    mostStagnantTasks,
  }
}
