export const PROPOSAL_REMINDER_TIMEZONE = "America/Cuiaba"
export const CUIABA_UTC_OFFSET = "-04:00"

export type ProposalReminderDueKind = "NONE" | "MANUAL" | "AUTO"

export type NextAutoReminderParams = {
  proposalCreatedAt: string | null | undefined
  lastAutoReminderAt?: string | null
  autoReminderEnabled?: boolean | null
  autoReminderIntervalDays?: number | null
  negotiationStatus?: string | null
}

export type ManualReminderDueParams = {
  now?: Date
  followupAt?: string | null
  followupNotifiedAt?: string | null
}

export type AutoReminderDueParams = NextAutoReminderParams & {
  now?: Date
}

export type ReminderKindParams = AutoReminderDueParams & {
  followupAt?: string | null
  followupNotifiedAt?: string | null
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function safeInteger(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(Math.trunc(value), 1)
}

export function normalizeAutoReminderIntervalDays(value: number | null | undefined) {
  return safeInteger(value, 2)
}

export function isClosedNegotiationStatus(status: string | null | undefined) {
  return status === "convertido" || status === "perdido"
}

export function computeNextAutoReminderAt(params: NextAutoReminderParams) {
  if (params.autoReminderEnabled === false) return null
  if (isClosedNegotiationStatus(params.negotiationStatus)) return null

  const intervalDays = normalizeAutoReminderIntervalDays(params.autoReminderIntervalDays)
  const baseDate = parseDate(params.lastAutoReminderAt) ?? parseDate(params.proposalCreatedAt)
  if (!baseDate) return null

  return new Date(baseDate.getTime() + intervalDays * 24 * 60 * 60 * 1000)
}

export function isManualReminderDue(params: ManualReminderDueParams) {
  const now = params.now ?? new Date()
  const followupAt = parseDate(params.followupAt)
  if (!followupAt) return false
  if (now.getTime() < followupAt.getTime()) return false

  const notifiedAt = parseDate(params.followupNotifiedAt)
  if (!notifiedAt) return true

  return notifiedAt.getTime() < followupAt.getTime()
}

export function isAutoReminderDue(params: AutoReminderDueParams) {
  if (params.autoReminderEnabled === false) return false
  if (isClosedNegotiationStatus(params.negotiationStatus)) return false

  const now = params.now ?? new Date()
  const nextAutoReminderAt = computeNextAutoReminderAt(params)
  if (!nextAutoReminderAt) return false

  return now.getTime() >= nextAutoReminderAt.getTime()
}

export function getDueProposalReminderKind(params: ReminderKindParams): ProposalReminderDueKind {
  if (isClosedNegotiationStatus(params.negotiationStatus)) return "NONE"

  if (
    isManualReminderDue({
      now: params.now,
      followupAt: params.followupAt,
      followupNotifiedAt: params.followupNotifiedAt,
    })
  ) {
    return "MANUAL"
  }

  if (
    isAutoReminderDue({
      now: params.now,
      proposalCreatedAt: params.proposalCreatedAt,
      lastAutoReminderAt: params.lastAutoReminderAt,
      autoReminderEnabled: params.autoReminderEnabled,
      autoReminderIntervalDays: params.autoReminderIntervalDays,
      negotiationStatus: params.negotiationStatus,
    })
  ) {
    return "AUTO"
  }

  return "NONE"
}

function getDatePartsInTimeZone(date: Date, timeZone = PROPOSAL_REMINDER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

export function toDateTimeLocalInCuiaba(value: string | null | undefined) {
  const parsed = parseDate(value)
  if (!parsed) return ""

  const parts = getDatePartsInTimeZone(parsed, PROPOSAL_REMINDER_TIMEZONE)
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return ""

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function formatDateTimeInCuiaba(value: string | null | undefined) {
  const parsed = parseDate(value)
  if (!parsed) return "—"

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: PROPOSAL_REMINDER_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed)
}

export function toDateKeyInTimeZone(value: string | null | undefined, timeZone = PROPOSAL_REMINDER_TIMEZONE) {
  const parsed = parseDate(value)
  if (!parsed) return null

  const parts = getDatePartsInTimeZone(parsed, timeZone)
  if (!parts.year || !parts.month || !parts.day) return null

  return `${parts.year}-${parts.month}-${parts.day}`
}

export function normalizeFollowupAtInput(value: string | null | undefined) {
  const raw = (value ?? "").trim()
  if (!raw) return null

  const localMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/)
  if (localMatch) {
    const [, datePart, hourMinute, seconds] = localMatch
    return `${datePart}T${hourMinute}:${seconds ?? "00"}${CUIABA_UTC_OFFSET}`
  }

  const parsed = parseDate(raw)
  if (!parsed) return null
  return parsed.toISOString()
}
