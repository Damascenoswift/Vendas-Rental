"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"

export type NotificationType =
    | "TASK_COMMENT"
    | "TASK_MENTION"
    | "TASK_REPLY"
    | "TASK_SYSTEM"
    | "INTERNAL_CHAT_MESSAGE"

export type NotificationDomain = "TASK" | "INDICACAO" | "OBRA" | "CHAT" | "SYSTEM"

export type NotificationResponsibilityKind =
    | "ASSIGNEE"
    | "OBSERVER"
    | "CREATOR"
    | "MENTION"
    | "REPLY_TARGET"
    | "OWNER"
    | "SECTOR_MEMBER"
    | "LINKED_TASK_PARTICIPANT"
    | "DIRECT"
    | "SYSTEM"

export type NotificationEntityType =
    | "TASK"
    | "TASK_COMMENT"
    | "INDICACAO"
    | "INDICACAO_INTERACTION"
    | "ENERGISA_LOG"
    | "OBRA"
    | "OBRA_PROCESS_ITEM"
    | "OBRA_COMMENT"
    | "CHAT_CONVERSATION"
    | "SYSTEM"

export type NotificationEventKey =
    | "TASK_COMMENT_CREATED"
    | "TASK_COMMENT_MENTION"
    | "TASK_COMMENT_REPLY"
    | "TASK_CHECKLIST_UPDATED"
    | "TASK_STATUS_CHANGED"
    | "INDICATION_CREATED"
    | "INDICATION_STATUS_CHANGED"
    | "INDICATION_DOC_VALIDATION_CHANGED"
    | "INDICATION_INTERACTION_COMMENT"
    | "INDICATION_ENERGISA_LOG_ADDED"
    | "INDICATION_CONTRACT_MILESTONE"
    | "WORK_COMMENT_CREATED"
    | "WORK_PROCESS_STATUS_CHANGED"
    | "INTERNAL_CHAT_MESSAGE"
    | "SYSTEM_GENERIC"

export type NotificationDispatchRecipient = {
    userId: string
    responsibilityKind: NotificationResponsibilityKind
    isMandatory?: boolean
}

export type NotificationDispatchInput = {
    domain: NotificationDomain
    eventKey: NotificationEventKey
    sector?: string | null
    actorUserId?: string | null
    entityType: NotificationEntityType
    entityId: string
    taskId?: string | null
    taskCommentId?: string | null
    title: string
    message: string
    metadata?: Record<string, unknown>
    recipients: NotificationDispatchRecipient[]
    dedupeKey?: string | null
    isMandatory?: boolean
    targetPath?: string | null
    type?: NotificationType
    revalidatePaths?: string[]
}

type NotificationActor = {
    id: string
    name: string | null
    email: string | null
}

type NotificationTask = {
    id: string
    title: string | null
    status: string | null
}

type MentionLookupRow = {
    id: string
    name: string | null
    email: string | null
    role: string | null
    status: string | null
}

type NotificationRecipientUser = {
    id: string
    role: string | null
    status: string | null
    department: string | null
}

type TaskRecipientTaskData = {
    id: string
    title: string | null
    assignee_id: string | null
    creator_id: string | null
    department: string | null
    visibility_scope?: string | null
}

type NotificationEventCatalogRow = {
    event_key: string
    domain: NotificationDomain
    label: string
    sector: string | null
    default_enabled: boolean
    allow_user_disable: boolean
    is_mandatory: boolean
}

type NotificationDefaultRuleRow = {
    sector: string
    event_key: string
    responsibility_kind: NotificationResponsibilityKind
    enabled: boolean
}

type NotificationOverrideRow = {
    user_id: string
    event_key: string
    responsibility_kind: NotificationResponsibilityKind
    enabled: boolean
}

type RawNotificationRow = {
    id: string
    recipient_user_id: string
    actor_user_id: string | null
    task_id: string | null
    task_comment_id: string | null
    type: NotificationType
    title: string
    message: string
    metadata: Record<string, unknown> | null
    is_read: boolean
    read_at: string | null
    created_at: string
    domain?: NotificationDomain | null
    event_key?: string | null
    sector?: string | null
    responsibility_kind?: NotificationResponsibilityKind | null
    entity_type?: NotificationEntityType | null
    entity_id?: string | null
    dedupe_key?: string | null
    is_mandatory?: boolean | null
    actor?: NotificationActor | NotificationActor[] | null
    task?: NotificationTask | NotificationTask[] | null
}

type RawNotificationBaseRow = {
    id: string
    recipient_user_id: string
    actor_user_id: string | null
    task_id: string | null
    task_comment_id: string | null
    type: NotificationType
    title: string
    message: string
    metadata: Record<string, unknown> | null
    is_read: boolean
    read_at: string | null
    created_at: string
    domain?: NotificationDomain | null
    event_key?: string | null
    sector?: string | null
    responsibility_kind?: NotificationResponsibilityKind | null
    entity_type?: NotificationEntityType | null
    entity_id?: string | null
    dedupe_key?: string | null
    is_mandatory?: boolean | null
}

export interface NotificationItem {
    id: string
    recipient_user_id: string
    actor_user_id: string | null
    task_id: string | null
    task_comment_id: string | null
    type: NotificationType
    domain: NotificationDomain
    event_key: string | null
    sector: string | null
    responsibility_kind: NotificationResponsibilityKind | null
    entity_type: NotificationEntityType | null
    entity_id: string | null
    dedupe_key: string | null
    is_mandatory: boolean
    title: string
    message: string
    metadata: Record<string, unknown>
    is_read: boolean
    read_at: string | null
    created_at: string
    actor: NotificationActor | null
    task: NotificationTask | null
}

export interface NotificationRuleItem {
    sector: string
    eventKey: string
    eventLabel: string
    domain: NotificationDomain
    responsibilityKind: NotificationResponsibilityKind
    defaultEnabled: boolean
    enabled: boolean
    source: "default" | "override"
    allowUserDisable: boolean
    isMandatory: boolean
}

export interface NotificationRulesResponse {
    sector: string | null
    canManageDefaults: boolean
    rules: NotificationRuleItem[]
}

const INACTIVE_USER_STATUSES = new Set(["inativo", "inactive", "suspended"])

const RESPONSIBILITY_PRIORITY: NotificationResponsibilityKind[] = [
    "MENTION",
    "REPLY_TARGET",
    "OWNER",
    "ASSIGNEE",
    "CREATOR",
    "OBSERVER",
    "LINKED_TASK_PARTICIPANT",
    "SECTOR_MEMBER",
    "DIRECT",
    "SYSTEM",
]

const DEFAULT_TASK_SECTORS = [
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

function normalizeSector(value?: string | null) {
    const normalized = (value ?? "").trim().toLowerCase()
    return normalized || null
}

function normalizeStatus(value?: string | null) {
    return (value ?? "").trim().toLowerCase()
}

function isUserInactiveStatus(value?: string | null) {
    return INACTIVE_USER_STATUSES.has(normalizeStatus(value))
}

function sanitizePreview(content: string, maxLength = 180) {
    const cleaned = content.replace(/\s+/g, " ").trim()
    if (!cleaned) return ""
    if (cleaned.length <= maxLength) return cleaned
    return `${cleaned.slice(0, maxLength - 3)}...`
}

function normalizeMentionDisplayValue(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
}

function normalizeMentionLookupToken(value: string) {
    const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, ".")
        .replace(/^\.+|\.+$/g, "")

    return normalized
}

function extractMentionLookupTokens(content: string) {
    const tokens = new Set<string>()
    const mentionRegex = /(^|[\s([{])@([^\s@.,;:!?()[\]{}<>]+)/g

    let match: RegExpExecArray | null = mentionRegex.exec(content)
    while (match) {
        const token = normalizeMentionLookupToken(match[2] ?? "")
        if (token.length >= 3) {
            tokens.add(token)
        }
        match = mentionRegex.exec(content)
    }

    return Array.from(tokens)
}

function normalizeMentionUserIds(ids?: string[]) {
    return Array.from(
        new Set(
            (ids ?? [])
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
        )
    )
}

function toSingleRow<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null

    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null

    return { column: match[1], table: match[2] }
}

function isMissingRelationError(error: { code?: string | null; message?: string | null } | null | undefined, relation: string) {
    if (!error) return false
    if (error.code === "42P01") return true
    const message = error.message ?? ""
    if (!/does not exist/i.test(message)) return false
    return message.toLowerCase().includes(relation.toLowerCase())
}

function isPermissionDeniedError(error: { code?: string | null; message?: string | null } | null | undefined) {
    if (!error) return false
    if (error.code === "42501") return true
    const message = (error.message ?? "").toLowerCase()
    return message.includes("permission denied")
}

function resolveLegacyTypeFromEvent(params: {
    eventKey: string
    domain: NotificationDomain
    explicitType?: NotificationType
}) {
    if (params.explicitType) return params.explicitType

    if (params.eventKey === "TASK_COMMENT_MENTION") return "TASK_MENTION"
    if (params.eventKey === "TASK_COMMENT_REPLY") return "TASK_REPLY"
    if (params.eventKey === "TASK_COMMENT_CREATED") return "TASK_COMMENT"
    if (params.eventKey === "INTERNAL_CHAT_MESSAGE" || params.domain === "CHAT") {
        return "INTERNAL_CHAT_MESSAGE"
    }

    return "TASK_SYSTEM"
}

function priorityForResponsibility(kind: NotificationResponsibilityKind) {
    const index = RESPONSIBILITY_PRIORITY.indexOf(kind)
    return index >= 0 ? index : RESPONSIBILITY_PRIORITY.length
}

function pickPrimaryResponsibility(kinds: Iterable<NotificationResponsibilityKind>) {
    const uniqueKinds = Array.from(new Set(Array.from(kinds)))
    uniqueKinds.sort((a, b) => priorityForResponsibility(a) - priorityForResponsibility(b))
    return uniqueKinds[0] ?? "SYSTEM"
}

function fallbackDedupeKey(input: NotificationDispatchInput) {
    const actorToken = input.actorUserId?.trim() || "system"
    return `${input.eventKey}:${input.entityType}:${input.entityId}:${actorToken}`
}

function resolveNotificationSector(input: NotificationDispatchInput, catalogSector?: string | null) {
    const fromInput = normalizeSector(input.sector)
    if (fromInput) return fromInput

    const fromCatalog = normalizeSector(catalogSector)
    if (!fromCatalog) return null

    if (fromCatalog === "tasks.department") {
        return null
    }

    return fromCatalog
}

function isInvestidorRole(role?: string | null) {
    return (role ?? "").trim().toLowerCase() === "investidor"
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
    const value = metadata?.[key]
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function mergeMetadata(base?: Record<string, unknown>, extra?: Record<string, unknown>) {
    return {
        ...(base ?? {}),
        ...(extra ?? {}),
    }
}

async function resolveMentionUserIdsFromContent(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    content: string
    explicitMentionUserIds?: string[]
}) {
    const explicitMentionUserIds = normalizeMentionUserIds(params.explicitMentionUserIds)
    const lookupTokens = extractMentionLookupTokens(params.content)

    if (lookupTokens.length === 0) {
        return explicitMentionUserIds
    }

    const { data: usersData, error: usersError } = await params.supabaseAdmin
        .from("users")
        .select("id, name, email, role, status")

    if (usersError) {
        console.error("Error loading users for mention lookup:", usersError)
        return explicitMentionUserIds
    }

    const lookup = new Map<string, Set<string>>()
    const mentionableUsers: Array<{ id: string; normalizedName: string | null }> = []
    const addLookup = (token: string, userId: string) => {
        if (!token) return
        const current = lookup.get(token) ?? new Set<string>()
        current.add(userId)
        lookup.set(token, current)
    }

    ;((usersData ?? []) as MentionLookupRow[]).forEach((row) => {
        if (!row?.id) return
        if (isUserInactiveStatus(row.status)) return
        if (isInvestidorRole(row.role)) return

        const userId = row.id
        const name = row.name?.trim() ?? ""
        const email = row.email?.trim() ?? ""
        const normalizedDisplayName = normalizeMentionDisplayValue(name)

        const normalizedFullName = normalizeMentionLookupToken(name)
        addLookup(normalizedFullName, userId)

        const firstName = name.split(/\s+/)[0] ?? ""
        const normalizedFirstName = normalizeMentionLookupToken(firstName)
        addLookup(normalizedFirstName, userId)

        const emailLocal = email.includes("@") ? email.split("@")[0] : email
        const normalizedEmailLocal = normalizeMentionLookupToken(emailLocal)
        addLookup(normalizedEmailLocal, userId)

        mentionableUsers.push({
            id: userId,
            normalizedName: normalizedDisplayName.length > 0 ? normalizedDisplayName : null,
        })
    })

    const resolvedByToken: string[] = []
    lookupTokens.forEach((token) => {
        const matches = lookup.get(token)
        if (!matches || matches.size !== 1) return
        const [matchedId] = Array.from(matches)
        if (matchedId) resolvedByToken.push(matchedId)
    })

    // Fallback: support explicit display-name mentions like "@Nome Sobrenome".
    const normalizedContent = normalizeMentionDisplayValue(params.content)
    const resolvedByDisplayName: string[] = []

    mentionableUsers.forEach((user) => {
        if (!user.normalizedName) return
        if (!user.normalizedName.includes(" ")) return

        const token = `@${user.normalizedName}`
        let searchFrom = 0
        while (searchFrom < normalizedContent.length) {
            const index = normalizedContent.indexOf(token, searchFrom)
            if (index < 0) break

            const nextChar = normalizedContent[index + token.length]
            if (!nextChar || /[\s.,;:!?()[\]{}<>]/.test(nextChar)) {
                resolvedByDisplayName.push(user.id)
                break
            }

            searchFrom = index + token.length
        }
    })

    return normalizeMentionUserIds([
        ...explicitMentionUserIds,
        ...resolvedByToken,
        ...resolvedByDisplayName,
    ])
}

async function getActiveUsersByDepartment(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    department: string | null | undefined
) {
    const normalizedDepartment = normalizeSector(department)
    if (!normalizedDepartment) return [] as NotificationRecipientUser[]

    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, role, status, department")
        .eq("department", normalizedDepartment)

    if (error) {
        console.error("Error loading users by department for notifications:", error)
        return [] as NotificationRecipientUser[]
    }

    return ((data ?? []) as NotificationRecipientUser[])
        .filter((row) => !isUserInactiveStatus(row.status))
        .filter((row) => !isInvestidorRole(row.role))
}

async function getMandatoryAdmMestreUserIds(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
) {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, role, status")
        .eq("role", "adm_mestre")

    if (error) {
        console.error("Error loading adm_mestre users for notifications:", error)
        return [] as string[]
    }

    return ((data ?? []) as Array<{ id: string; status: string | null }>)
        .filter((row) => !isUserInactiveStatus(row.status))
        .map((row) => row.id)
}

function buildDefaultTaskSectorRulesFromCatalogRows(
    eventCatalogRows: NotificationEventCatalogRow[],
    department: string | null
): NotificationDefaultRuleRow[] {
    const normalizedDepartment = normalizeSector(department)
    if (!normalizedDepartment || !DEFAULT_TASK_SECTORS.includes(normalizedDepartment)) {
        return []
    }

    const taskEventKeys = eventCatalogRows
        .filter((row) => normalizeSector(row.sector) === "tasks.department")
        .map((row) => row.event_key)

    if (taskEventKeys.length === 0) return []

    const rows: NotificationDefaultRuleRow[] = []

    for (const eventKey of taskEventKeys) {
        if (eventKey === "TASK_COMMENT_CREATED") {
            rows.push(
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "ASSIGNEE", enabled: true },
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "OBSERVER", enabled: true },
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "CREATOR", enabled: true },
            )
            continue
        }

        if (eventKey === "TASK_COMMENT_MENTION") {
            rows.push({ sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "MENTION", enabled: true })
            continue
        }

        if (eventKey === "TASK_COMMENT_REPLY") {
            rows.push({ sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "REPLY_TARGET", enabled: true })
            continue
        }

        if (eventKey === "TASK_CHECKLIST_UPDATED" || eventKey === "TASK_STATUS_CHANGED") {
            rows.push(
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "ASSIGNEE", enabled: true },
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "OBSERVER", enabled: true },
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "CREATOR", enabled: true },
                { sector: normalizedDepartment, event_key: eventKey, responsibility_kind: "SECTOR_MEMBER", enabled: true },
            )
        }
    }

    return rows
}

async function readDispatchRules(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    eventKey: string
    sector: string | null
    userIds: string[]
    responsibilities: NotificationResponsibilityKind[]
}) {
    const { supabaseAdmin, eventKey, sector, userIds, responsibilities } = params

    const [catalogResult, defaultsResult, overridesResult] = await Promise.all([
        supabaseAdmin
            .from("notification_event_catalog")
            .select("event_key, domain, label, sector, default_enabled, allow_user_disable, is_mandatory")
            .eq("event_key", eventKey)
            .maybeSingle(),
        sector
            ? supabaseAdmin
                .from("notification_default_rules")
                .select("sector, event_key, responsibility_kind, enabled")
                .eq("event_key", eventKey)
                .eq("sector", sector)
                .in("responsibility_kind", responsibilities)
            : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
            ? supabaseAdmin
                .from("notification_user_rule_overrides")
                .select("user_id, event_key, responsibility_kind, enabled")
                .eq("event_key", eventKey)
                .in("user_id", userIds)
                .in("responsibility_kind", responsibilities)
            : Promise.resolve({ data: [], error: null }),
    ])

    if (catalogResult.error) {
        console.error("Error loading notification event catalog row:", catalogResult.error)
    }

    if (defaultsResult.error) {
        console.error("Error loading notification default rules:", defaultsResult.error)
    }

    if (overridesResult.error) {
        console.error("Error loading notification user overrides:", overridesResult.error)
    }

    return {
        catalog: (catalogResult.data as NotificationEventCatalogRow | null) ?? null,
        defaults: (defaultsResult.data ?? []) as NotificationDefaultRuleRow[],
        overrides: (overridesResult.data ?? []) as NotificationOverrideRow[],
    }
}

function applyRuleForRecipient(params: {
    catalog: NotificationEventCatalogRow | null
    defaultsByResponsibility: Map<NotificationResponsibilityKind, boolean>
    overridesByRecipientAndResponsibility: Map<string, boolean>
    recipientUserId: string
    responsibilityKind: NotificationResponsibilityKind
    forceMandatory: boolean
}) {
    const { catalog, defaultsByResponsibility, overridesByRecipientAndResponsibility } = params

    if (params.forceMandatory || catalog?.is_mandatory) {
        return true
    }

    const defaultEnabled = defaultsByResponsibility.get(params.responsibilityKind)
        ?? catalog?.default_enabled
        ?? true

    if (catalog && !catalog.allow_user_disable) {
        return defaultEnabled
    }

    const overrideKey = `${params.recipientUserId}::${params.responsibilityKind}`
    if (overridesByRecipientAndResponsibility.has(overrideKey)) {
        return overridesByRecipientAndResponsibility.get(overrideKey) === true
    }

    return defaultEnabled
}

function toNotificationItem(row: RawNotificationRow | RawNotificationBaseRow, actorsById?: Map<string, NotificationActor>, tasksById?: Map<string, NotificationTask>) {
    const actorFromJoin = "actor" in row ? toSingleRow((row as RawNotificationRow).actor) : null
    const taskFromJoin = "task" in row ? toSingleRow((row as RawNotificationRow).task) : null

    return {
        id: row.id,
        recipient_user_id: row.recipient_user_id,
        actor_user_id: row.actor_user_id,
        task_id: row.task_id,
        task_comment_id: row.task_comment_id,
        type: row.type,
        domain: (row.domain ?? (row.type === "INTERNAL_CHAT_MESSAGE" ? "CHAT" : "TASK")) as NotificationDomain,
        event_key: row.event_key ?? null,
        sector: row.sector ?? null,
        responsibility_kind: row.responsibility_kind ?? null,
        entity_type: row.entity_type ?? null,
        entity_id: row.entity_id ?? null,
        dedupe_key: row.dedupe_key ?? null,
        is_mandatory: row.is_mandatory === true,
        title: row.title,
        message: row.message,
        metadata: row.metadata ?? {},
        is_read: row.is_read,
        read_at: row.read_at,
        created_at: row.created_at,
        actor:
            actorFromJoin
            ?? (row.actor_user_id ? (actorsById?.get(row.actor_user_id) ?? null) : null),
        task:
            taskFromJoin
            ?? (row.task_id ? (tasksById?.get(row.task_id) ?? null) : null),
    } satisfies NotificationItem
}

async function revalidateNotificationRelatedPaths(paths?: string[]) {
    const uniquePaths = Array.from(new Set(["/admin/notificacoes", ...(paths ?? [])]))
    uniquePaths.forEach((path) => revalidatePath(path))
}

export async function dispatchNotificationEvent(input: NotificationDispatchInput) {
    if (!input.title.trim() || !input.message.trim()) {
        return { inserted: 0 }
    }

    const dedupeKey = input.dedupeKey?.trim() || fallbackDedupeKey(input)
    const recipients = input.recipients
        .map((recipient) => ({
            userId: recipient.userId?.trim(),
            responsibilityKind: recipient.responsibilityKind,
            isMandatory: recipient.isMandatory === true,
        }))
        .filter((recipient) => Boolean(recipient.userId)) as Array<{
        userId: string
        responsibilityKind: NotificationResponsibilityKind
        isMandatory: boolean
    }>

    if (recipients.length === 0) {
        return { inserted: 0 }
    }

    const groupedRecipients = new Map<string, {
        responsibilities: Set<NotificationResponsibilityKind>
        isMandatory: boolean
    }>()

    for (const recipient of recipients) {
        if (input.actorUserId && recipient.userId === input.actorUserId) continue

        const current = groupedRecipients.get(recipient.userId) ?? {
            responsibilities: new Set<NotificationResponsibilityKind>(),
            isMandatory: false,
        }

        current.responsibilities.add(recipient.responsibilityKind)
        current.isMandatory = current.isMandatory || recipient.isMandatory
        groupedRecipients.set(recipient.userId, current)
    }

    if (groupedRecipients.size === 0) {
        return { inserted: 0 }
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for dispatchNotificationEvent:", error)
        return { inserted: 0 }
    }

    const recipientIds = Array.from(groupedRecipients.keys())
    const uniqueResponsibilities = Array.from(
        new Set(
            Array.from(groupedRecipients.values()).flatMap((group) => Array.from(group.responsibilities))
        )
    ) as NotificationResponsibilityKind[]

    const [recipientUsersResult, rulesResult] = await Promise.all([
        supabaseAdmin
            .from("users")
            .select("id, role, status, department")
            .in("id", recipientIds),
        readDispatchRules({
            supabaseAdmin,
            eventKey: input.eventKey,
            sector: resolveNotificationSector(input, null),
            userIds: recipientIds,
            responsibilities: uniqueResponsibilities,
        }),
    ])

    if (recipientUsersResult.error) {
        console.error("Error loading notification recipients:", recipientUsersResult.error)
        return { inserted: 0 }
    }

    const catalog = rulesResult.catalog
    const resolvedSector = resolveNotificationSector(input, catalog?.sector ?? null)

    const secondRulesPass = await readDispatchRules({
        supabaseAdmin,
        eventKey: input.eventKey,
        sector: resolvedSector,
        userIds: recipientIds,
        responsibilities: uniqueResponsibilities,
    })

    const effectiveCatalog = secondRulesPass.catalog ?? catalog

    const defaultsByResponsibility = new Map<NotificationResponsibilityKind, boolean>()
    ;(secondRulesPass.defaults.length > 0 ? secondRulesPass.defaults : rulesResult.defaults).forEach((row) => {
        defaultsByResponsibility.set(row.responsibility_kind, row.enabled)
    })

    const overridesByRecipientAndResponsibility = new Map<string, boolean>()
    ;(secondRulesPass.overrides.length > 0 ? secondRulesPass.overrides : rulesResult.overrides).forEach((row) => {
        overridesByRecipientAndResponsibility.set(`${row.user_id}::${row.responsibility_kind}`, row.enabled)
    })

    const recipientUsersById = new Map<string, NotificationRecipientUser>()
    ;((recipientUsersResult.data ?? []) as NotificationRecipientUser[]).forEach((row) => {
        recipientUsersById.set(row.id, row)
    })

    const payload: Array<Record<string, unknown>> = []

    for (const [recipientUserId, grouped] of groupedRecipients.entries()) {
        const recipientUser = recipientUsersById.get(recipientUserId)
        if (!recipientUser) continue
        if (isUserInactiveStatus(recipientUser.status)) continue
        if (isInvestidorRole(recipientUser.role)) continue

        const enabledResponsibilities = Array.from(grouped.responsibilities).filter((responsibilityKind) => {
            return applyRuleForRecipient({
                catalog: effectiveCatalog,
                defaultsByResponsibility,
                overridesByRecipientAndResponsibility,
                recipientUserId,
                responsibilityKind,
                forceMandatory: grouped.isMandatory,
            })
        })

        if (enabledResponsibilities.length === 0) {
            continue
        }

        const primaryResponsibility = pickPrimaryResponsibility(enabledResponsibilities)
        const notificationType = resolveLegacyTypeFromEvent({
            eventKey: input.eventKey,
            domain: input.domain,
            explicitType: input.type,
        })

        const metadata = mergeMetadata(input.metadata, {
            target_path: input.targetPath ?? null,
            event_key: input.eventKey,
            domain: input.domain,
            sector: resolvedSector,
            responsibility_kinds: enabledResponsibilities,
            entity_type: input.entityType,
            entity_id: input.entityId,
        })

        payload.push({
            recipient_user_id: recipientUserId,
            actor_user_id: input.actorUserId ?? null,
            task_id: input.taskId ?? null,
            task_comment_id: input.taskCommentId ?? null,
            type: notificationType,
            title: input.title,
            message: input.message,
            metadata,
            domain: input.domain,
            event_key: input.eventKey,
            sector: resolvedSector,
            responsibility_kind: primaryResponsibility,
            entity_type: input.entityType,
            entity_id: input.entityId,
            dedupe_key: dedupeKey,
            is_mandatory: grouped.isMandatory || input.isMandatory === true,
        })
    }

    if (payload.length === 0) {
        return { inserted: 0 }
    }

    const { error: insertError, data: insertedData } = await supabaseAdmin
        .from("notifications")
        .upsert(payload, {
            onConflict: "recipient_user_id,dedupe_key",
            ignoreDuplicates: true,
        })
        .select("id")

    if (insertError) {
        console.error("Error dispatching notification event:", insertError)
        return { inserted: 0 }
    }

    await revalidateNotificationRelatedPaths(input.revalidatePaths)

    return { inserted: (insertedData ?? []).length }
}

export async function getMyNotifications(options?: {
    includeRead?: boolean
    limit?: number
    domains?: NotificationDomain[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return [] as NotificationItem[]

    const limit = Math.min(Math.max(options?.limit ?? 120, 1), 300)
    const domains = (options?.domains ?? [])
        .map((domain) => domain?.trim())
        .filter((domain): domain is NotificationDomain => Boolean(domain))

    let query = supabase
        .from("notifications")
        .select(`
            id,
            recipient_user_id,
            actor_user_id,
            task_id,
            task_comment_id,
            type,
            title,
            message,
            metadata,
            is_read,
            read_at,
            created_at,
            domain,
            event_key,
            sector,
            responsibility_kind,
            entity_type,
            entity_id,
            dedupe_key,
            is_mandatory,
            actor:users!notifications_actor_user_id_fkey(id, name, email),
            task:tasks!notifications_task_id_fkey(id, title, status)
        `)
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (!options?.includeRead) {
        query = query.eq("is_read", false)
    }

    if (domains.length > 0) {
        query = query.in("domain", domains)
    }

    const { data, error } = await query

    if (!error) {
        return ((data ?? []) as RawNotificationRow[]).map((row) => toNotificationItem(row))
    }

    const missingDomainColumn = parseMissingColumnError(error.message)
    if (!missingDomainColumn || missingDomainColumn.table !== "notifications") {
        console.error("Error fetching notifications with joins, using fallback:", error)
    }

    let fallbackQuery = supabase
        .from("notifications")
        .select(`
            id,
            recipient_user_id,
            actor_user_id,
            task_id,
            task_comment_id,
            type,
            title,
            message,
            metadata,
            is_read,
            read_at,
            created_at
        `)
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (!options?.includeRead) {
        fallbackQuery = fallbackQuery.eq("is_read", false)
    }

    const { data: fallbackRows, error: fallbackError } = await fallbackQuery
    if (fallbackError) {
        console.error("Error fetching notifications fallback:", fallbackError)
        return [] as NotificationItem[]
    }

    const rows = (fallbackRows ?? []) as RawNotificationBaseRow[]
    if (rows.length === 0) return [] as NotificationItem[]

    const actorIds = Array.from(
        new Set(rows.map((row) => row.actor_user_id).filter((value): value is string => Boolean(value)))
    )
    const taskIds = Array.from(
        new Set(rows.map((row) => row.task_id).filter((value): value is string => Boolean(value)))
    )

    const [actorsResult, tasksResult] = await Promise.all([
        actorIds.length > 0
            ? supabase
                .from("users")
                .select("id, name, email")
                .in("id", actorIds)
            : Promise.resolve({ data: [], error: null }),
        taskIds.length > 0
            ? supabase
                .from("tasks")
                .select("id, title, status")
                .in("id", taskIds)
            : Promise.resolve({ data: [], error: null }),
    ])

    if (actorsResult.error) {
        console.error("Error loading notification actors fallback:", actorsResult.error)
    }

    if (tasksResult.error) {
        console.error("Error loading notification tasks fallback:", tasksResult.error)
    }

    const actorsById = new Map<string, NotificationActor>()
    ;((actorsResult.data ?? []) as NotificationActor[]).forEach((actor) => {
        actorsById.set(actor.id, actor)
    })

    const tasksById = new Map<string, NotificationTask>()
    ;((tasksResult.data ?? []) as NotificationTask[]).forEach((task) => {
        tasksById.set(task.id, task)
    })

    const mapped = rows.map((row) => toNotificationItem(row, actorsById, tasksById))

    if (domains.length === 0) {
        return mapped
    }

    return mapped.filter((row) => domains.includes(row.domain))
}

export async function getUnreadNotificationsCount(options?: {
    domains?: NotificationDomain[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return 0

    const domains = (options?.domains ?? [])
        .map((domain) => domain?.trim())
        .filter((domain): domain is NotificationDomain => Boolean(domain))

    let query = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("is_read", false)

    if (domains.length > 0) {
        query = query.in("domain", domains)
    }

    const { count, error } = await query

    if (error) {
        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn?.table !== "notifications" || missingColumn.column !== "domain") {
            console.error("Error counting unread notifications:", error)
        }

        if (domains.length > 0) {
            const fallback = await supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("recipient_user_id", user.id)
                .eq("is_read", false)

            if (fallback.error) {
                console.error("Error counting unread notifications fallback:", fallback.error)
                return 0
            }

            return fallback.count ?? 0
        }

        return 0
    }

    return count ?? 0
}

export async function markNotificationAsRead(notificationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from("notifications")
        .update({
            is_read: true,
            read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .eq("recipient_user_id", user.id)

    if (error) {
        return { error: error.message }
    }

    revalidatePath("/admin/notificacoes")
    return { success: true }
}

export async function markAllNotificationsAsRead() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from("notifications")
        .update({
            is_read: true,
            read_at: new Date().toISOString(),
        })
        .eq("recipient_user_id", user.id)
        .eq("is_read", false)

    if (error) {
        return { error: error.message }
    }

    revalidatePath("/admin/notificacoes")
    return { success: true }
}

export async function getMyNotificationRules(): Promise<NotificationRulesResponse> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return {
            sector: null,
            canManageDefaults: false,
            rules: [],
        }
    }

    const profile = await getProfile(supabase as any, user.id)
    const sector = normalizeSector(profile?.department)
    const canManageDefaults = profile?.role === "adm_mestre"

    if (!sector) {
        return {
            sector: null,
            canManageDefaults,
            rules: [],
        }
    }

    const [catalogResult, defaultsResult, overrideResult] = await Promise.all([
        supabase
            .from("notification_event_catalog")
            .select("event_key, domain, label, sector, default_enabled, allow_user_disable, is_mandatory")
            .order("domain", { ascending: true })
            .order("event_key", { ascending: true }),
        supabase
            .from("notification_default_rules")
            .select("sector, event_key, responsibility_kind, enabled")
            .eq("sector", sector)
            .order("event_key", { ascending: true }),
        supabase
            .from("notification_user_rule_overrides")
            .select("user_id, event_key, responsibility_kind, enabled")
            .eq("user_id", user.id),
    ])

    if (catalogResult.error) {
        console.error("Error loading notification event catalog for user rules:", catalogResult.error)
    }

    if (defaultsResult.error) {
        console.error("Error loading notification default rules for user rules:", defaultsResult.error)
    }

    if (overrideResult.error) {
        console.error("Error loading notification user overrides for user rules:", overrideResult.error)
    }

    const catalogRows = (catalogResult.data ?? []) as NotificationEventCatalogRow[]
    const defaultRows = (defaultsResult.data ?? []) as NotificationDefaultRuleRow[]
    const generatedTaskDefaults = buildDefaultTaskSectorRulesFromCatalogRows(catalogRows, sector)
    const mergedDefaults = [...defaultRows, ...generatedTaskDefaults]
    const overrides = (overrideResult.data ?? []) as NotificationOverrideRow[]

    const catalogByEvent = new Map<string, NotificationEventCatalogRow>()
    catalogRows.forEach((row) => catalogByEvent.set(row.event_key, row))

    const overrideByKey = new Map<string, NotificationOverrideRow>()
    overrides.forEach((row) => {
        overrideByKey.set(`${row.event_key}::${row.responsibility_kind}`, row)
    })

    const dedupedDefaultByKey = new Map<string, NotificationDefaultRuleRow>()
    mergedDefaults.forEach((row) => {
        const key = `${row.event_key}::${row.responsibility_kind}`
        if (!dedupedDefaultByKey.has(key)) {
            dedupedDefaultByKey.set(key, row)
        }
    })

    const rules: NotificationRuleItem[] = Array.from(dedupedDefaultByKey.values())
        .map((defaultRow) => {
            const catalogRow = catalogByEvent.get(defaultRow.event_key)
            const overrideKey = `${defaultRow.event_key}::${defaultRow.responsibility_kind}`
            const override = overrideByKey.get(overrideKey)

            const enabled = override
                ? override.enabled
                : defaultRow.enabled

            return {
                sector,
                eventKey: defaultRow.event_key,
                eventLabel: catalogRow?.label ?? defaultRow.event_key,
                domain: (catalogRow?.domain ?? "SYSTEM") as NotificationDomain,
                responsibilityKind: defaultRow.responsibility_kind,
                defaultEnabled: defaultRow.enabled,
                enabled: catalogRow?.is_mandatory ? true : enabled,
                source: override ? "override" : "default",
                allowUserDisable: catalogRow?.allow_user_disable ?? true,
                isMandatory: catalogRow?.is_mandatory ?? false,
            } satisfies NotificationRuleItem
        })
        .sort((a, b) => {
            if (a.domain !== b.domain) return a.domain.localeCompare(b.domain)
            if (a.eventLabel !== b.eventLabel) return a.eventLabel.localeCompare(b.eventLabel)
            return priorityForResponsibility(a.responsibilityKind) - priorityForResponsibility(b.responsibilityKind)
        })

    return {
        sector,
        canManageDefaults,
        rules,
    }
}

export async function upsertMyNotificationRule(params: {
    eventKey: string
    responsibilityKind: NotificationResponsibilityKind
    enabled: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const profile = await getProfile(supabase as any, user.id)
    const sector = normalizeSector(profile?.department)
    if (!sector) return { error: "Setor do usuário não configurado." }

    const [catalogResult, defaultRuleResult] = await Promise.all([
        supabase
            .from("notification_event_catalog")
            .select("event_key, allow_user_disable, is_mandatory")
            .eq("event_key", params.eventKey)
            .maybeSingle(),
        supabase
            .from("notification_default_rules")
            .select("id")
            .eq("event_key", params.eventKey)
            .eq("sector", sector)
            .eq("responsibility_kind", params.responsibilityKind)
            .maybeSingle(),
    ])

    if (catalogResult.error || !catalogResult.data) {
        return { error: catalogResult.error?.message ?? "Evento de notificação não encontrado." }
    }

    if (catalogResult.data.is_mandatory) {
        return { error: "Este evento é obrigatório e não pode ser desativado." }
    }

    if (!catalogResult.data.allow_user_disable) {
        return { error: "Este evento não permite override por usuário." }
    }

    if (defaultRuleResult.error || !defaultRuleResult.data) {
        return { error: "Regra padrão não encontrada para o seu setor." }
    }

    const { error } = await supabase
        .from("notification_user_rule_overrides")
        .upsert(
            {
                user_id: user.id,
                event_key: params.eventKey,
                responsibility_kind: params.responsibilityKind,
                enabled: params.enabled,
            },
            {
                onConflict: "user_id,event_key,responsibility_kind",
            }
        )

    if (error) {
        return { error: error.message }
    }

    revalidatePath("/admin/notificacoes")
    return { success: true }
}

export async function getDefaultRulesBySector(sector?: string | null) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return [] as Array<Record<string, unknown>>

    const profile = await getProfile(supabase as any, user.id)
    if (profile?.role !== "adm_mestre") {
        return [] as Array<Record<string, unknown>>
    }

    const normalizedSector = normalizeSector(sector)

    let query = supabase
        .from("notification_default_rules")
        .select(`
            id,
            sector,
            event_key,
            responsibility_kind,
            enabled,
            updated_at,
            event:notification_event_catalog(domain, label, allow_user_disable, is_mandatory)
        `)
        .order("sector", { ascending: true })
        .order("event_key", { ascending: true })
        .order("responsibility_kind", { ascending: true })

    if (normalizedSector) {
        query = query.eq("sector", normalizedSector)
    }

    const { data, error } = await query

    if (error) {
        console.error("Error loading default notification rules by sector:", error)
        return [] as Array<Record<string, unknown>>
    }

    return (data ?? []) as Array<Record<string, unknown>>
}

export async function upsertDefaultRule(params: {
    sector: string
    eventKey: string
    responsibilityKind: NotificationResponsibilityKind
    enabled: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const profile = await getProfile(supabase as any, user.id)
    if (profile?.role !== "adm_mestre") {
        return { error: "Apenas adm_mestre pode atualizar regras globais." }
    }

    const normalizedSector = normalizeSector(params.sector)
    if (!normalizedSector) return { error: "Setor inválido." }

    const { error } = await supabase
        .from("notification_default_rules")
        .upsert(
            {
                sector: normalizedSector,
                event_key: params.eventKey,
                responsibility_kind: params.responsibilityKind,
                enabled: params.enabled,
                created_by: user.id,
            },
            {
                onConflict: "sector,event_key,responsibility_kind",
            }
        )

    if (error) {
        return { error: error.message }
    }

    revalidatePath("/admin/notificacoes")
    return { success: true }
}

function buildNotificationTitleFromActor(actorDisplay: string, kind: "comment" | "mention" | "reply") {
    if (kind === "mention") {
        return `${actorDisplay} mencionou você em uma tarefa`
    }

    if (kind === "reply") {
        return `${actorDisplay} respondeu em uma tarefa que você acompanha`
    }

    return `${actorDisplay} comentou em uma tarefa que você acompanha`
}

async function resolveTaskRecipients(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    taskId: string
    includeSectorMembers?: boolean
}) {
    const loadTaskData = async (
        client: ReturnType<typeof createSupabaseServiceClient> | Awaited<ReturnType<typeof createClient>>
    ) => {
        const taskResult = await client
            .from("tasks")
            .select("id, title, assignee_id, creator_id, department, visibility_scope")
            .eq("id", params.taskId)
            .maybeSingle()

        if (!taskResult.error && taskResult.data) {
            return {
                data: taskResult.data as TaskRecipientTaskData,
                error: null,
            }
        }

        const missingTaskColumn = parseMissingColumnError(taskResult.error?.message)
        if (missingTaskColumn?.table === "tasks" && missingTaskColumn.column === "visibility_scope") {
            const fallbackTaskResult = await client
                .from("tasks")
                .select("id, title, assignee_id, creator_id, department")
                .eq("id", params.taskId)
                .maybeSingle()

            if (!fallbackTaskResult.error && fallbackTaskResult.data) {
                return {
                    data: {
                        ...(fallbackTaskResult.data as Omit<TaskRecipientTaskData, "visibility_scope">),
                        visibility_scope: "TEAM",
                    } satisfies TaskRecipientTaskData,
                    error: null,
                }
            }

            return {
                data: null,
                error: fallbackTaskResult.error,
            }
        }

        return {
            data: null,
            error: taskResult.error,
        }
    }

    const loadTaskObservers = async (
        client: ReturnType<typeof createSupabaseServiceClient> | Awaited<ReturnType<typeof createClient>>
    ) => {
        const observersResult = await client
            .from("task_observers")
            .select("user_id")
            .eq("task_id", params.taskId)

        if (!observersResult.error) {
            return {
                rows: (observersResult.data ?? []) as Array<{ user_id: string | null }>,
                error: null,
            }
        }

        return {
            rows: [] as Array<{ user_id: string | null }>,
            error: observersResult.error,
        }
    }

    const loadChecklistResponsibleUserIds = async (
        client: ReturnType<typeof createSupabaseServiceClient> | Awaited<ReturnType<typeof createClient>>
    ) => {
        const checklistResult = await client
            .from("task_checklists")
            .select("responsible_user_id")
            .eq("task_id", params.taskId)
            .not("responsible_user_id", "is", null)

        if (!checklistResult.error) {
            return {
                userIds: Array.from(
                    new Set(
                        ((checklistResult.data ?? []) as Array<{ responsible_user_id: string | null }>)
                            .map((row) => row.responsible_user_id)
                            .filter((value): value is string => Boolean(value))
                    )
                ),
                error: null,
            }
        }

        return {
            userIds: [] as string[],
            error: checklistResult.error,
        }
    }

    let taskData: TaskRecipientTaskData | null = null
    let taskLoadResult = await loadTaskData(params.supabaseAdmin)
    if (taskLoadResult.data) {
        taskData = taskLoadResult.data
    } else if (isPermissionDeniedError(taskLoadResult.error)) {
        try {
            const supabaseUser = await createClient()
            taskLoadResult = await loadTaskData(supabaseUser)
            taskData = taskLoadResult.data
        } catch (fallbackError) {
            console.error("Error creating fallback client to resolve task recipients:", fallbackError)
        }
    }

    if (!taskData) {
        return {
            task: null,
            recipients: [] as NotificationDispatchRecipient[],
            error: taskLoadResult.error,
        }
    }

    let observerRows: Array<{ user_id: string | null }> = []
    let observerLoadResult = await loadTaskObservers(params.supabaseAdmin)
    if (!observerLoadResult.error) {
        observerRows = observerLoadResult.rows
    } else if (isPermissionDeniedError(observerLoadResult.error)) {
        try {
            const supabaseUser = await createClient()
            observerLoadResult = await loadTaskObservers(supabaseUser)
            if (!observerLoadResult.error) {
                observerRows = observerLoadResult.rows
            }
        } catch (fallbackError) {
            console.error("Error creating fallback client to resolve task observers:", fallbackError)
        }
    }

    if (observerLoadResult.error && observerRows.length === 0) {
        const missingObserverColumn = parseMissingColumnError(observerLoadResult.error.message)
        const observersUnavailable =
            (missingObserverColumn?.table === "task_observers")
            || isMissingRelationError(observerLoadResult.error, "task_observers")

        if (observersUnavailable) {
            console.warn("Task observers unavailable for notifications; continuing without observers.", {
                taskId: params.taskId,
                error: observerLoadResult.error,
            })
        } else {
            console.error("Error loading task observers for notifications; continuing without observers.", observerLoadResult.error)
        }
    }

    let checklistResponsibleIds: string[] = []
    let checklistResponsibleLoad = await loadChecklistResponsibleUserIds(params.supabaseAdmin)
    if (!checklistResponsibleLoad.error) {
        checklistResponsibleIds = checklistResponsibleLoad.userIds
    } else if (isPermissionDeniedError(checklistResponsibleLoad.error)) {
        try {
            const supabaseUser = await createClient()
            checklistResponsibleLoad = await loadChecklistResponsibleUserIds(supabaseUser)
            if (!checklistResponsibleLoad.error) {
                checklistResponsibleIds = checklistResponsibleLoad.userIds
            }
        } catch (fallbackError) {
            console.error("Error creating fallback client to resolve checklist responsible users:", fallbackError)
        }
    }

    if (checklistResponsibleLoad.error && checklistResponsibleIds.length === 0) {
        const missingChecklistColumn = parseMissingColumnError(checklistResponsibleLoad.error.message)
        const checklistUnavailable =
            (missingChecklistColumn?.table === "task_checklists" && missingChecklistColumn.column === "responsible_user_id")
            || isMissingRelationError(checklistResponsibleLoad.error, "task_checklists")

        if (checklistUnavailable) {
            console.warn("Task checklist responsible users unavailable for notifications; continuing without them.", {
                taskId: params.taskId,
                error: checklistResponsibleLoad.error,
            })
        } else {
            console.error("Error loading checklist responsible users for notifications; continuing without them.", checklistResponsibleLoad.error)
        }
    }

    const recipients: NotificationDispatchRecipient[] = []

    if (taskData.assignee_id) {
        recipients.push({
            userId: taskData.assignee_id,
            responsibilityKind: "ASSIGNEE",
        })
    }

    if (taskData.creator_id) {
        recipients.push({
            userId: taskData.creator_id,
            responsibilityKind: "CREATOR",
        })
    }

    observerRows.forEach((observer) => {
        if (!observer.user_id) return
        recipients.push({
            userId: observer.user_id,
            responsibilityKind: "OBSERVER",
        })
    })

    checklistResponsibleIds.forEach((userId) => {
        recipients.push({
            userId,
            responsibilityKind: "OBSERVER",
        })
    })

    if (params.includeSectorMembers) {
        const sectorMembers = await getActiveUsersByDepartment(params.supabaseAdmin, taskData.department)
        sectorMembers.forEach((member) => {
            recipients.push({
                userId: member.id,
                responsibilityKind: "SECTOR_MEMBER",
            })
        })
    }

    return {
        task: taskData,
        recipients,
        error: null,
    }
}

export async function createTaskCommentNotifications(params: {
    taskId: string
    commentId: string
    actorUserId: string
    content: string
    parentCommentId?: string | null
    mentionUserIds?: string[]
}) {
    if (!params.taskId || !params.commentId || !params.actorUserId) {
        return
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for notifications:", error)
        return
    }

    const mentionUserIds = await resolveMentionUserIdsFromContent({
        supabaseAdmin,
        content: params.content,
        explicitMentionUserIds: params.mentionUserIds,
    })

    const [taskRecipientsResult, actorResult, parentResult] = await Promise.all([
        resolveTaskRecipients({
            supabaseAdmin,
            taskId: params.taskId,
            includeSectorMembers: false,
        }),
        supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", params.actorUserId)
            .maybeSingle(),
        params.parentCommentId
            ? supabaseAdmin
                .from("task_comments")
                .select("id, user_id")
                .eq("id", params.parentCommentId)
                .eq("task_id", params.taskId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ])

    if (taskRecipientsResult.error || !taskRecipientsResult.task) {
        console.error("Error loading task recipients for comment notifications:", taskRecipientsResult.error)
        return
    }

    if (actorResult.error) {
        console.error("Error loading actor for comment notifications:", actorResult.error)
    }

    if (parentResult.error) {
        console.error("Error loading parent comment for notifications:", parentResult.error)
    }

    if (taskRecipientsResult.task.visibility_scope === "RESTRICTED" && mentionUserIds.length > 0) {
        const mentionObserverPayload = mentionUserIds.map((mentionedUserId) => ({
            task_id: params.taskId,
            user_id: mentionedUserId,
        }))

        const { error: observerUpsertError } = await supabaseAdmin
            .from("task_observers")
            .upsert(mentionObserverPayload, { onConflict: "task_id,user_id", ignoreDuplicates: true })

        if (observerUpsertError) {
            console.error("Error adding mentioned users as observers:", observerUpsertError)
        }
    }

    const actor = actorResult.data as { id: string; name: string | null; email: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const taskTitle = (taskRecipientsResult.task.title ?? "Tarefa sem título").trim() || "Tarefa sem título"
    const preview = sanitizePreview(params.content)

    const baseRecipientsByUser = new Map<string, Set<NotificationResponsibilityKind>>()
    taskRecipientsResult.recipients.forEach((recipient) => {
        const current = baseRecipientsByUser.get(recipient.userId) ?? new Set<NotificationResponsibilityKind>()
        current.add(recipient.responsibilityKind)
        baseRecipientsByUser.set(recipient.userId, current)
    })

    const mentionedSet = new Set(mentionUserIds)
    const parentAuthorId = (parentResult.data as { user_id?: string | null } | null)?.user_id ?? null
    const replyTargetSet = new Set<string>()
    if (parentAuthorId) replyTargetSet.add(parentAuthorId)

    const commonMetadata = {
        task_title: taskTitle,
        parent_comment_id: params.parentCommentId ?? null,
        task_id: params.taskId,
        task_comment_id: params.commentId,
        target_path: `/admin/tarefas?openTask=${params.taskId}`,
    }

    if (mentionedSet.size > 0) {
        const mentionRecipients: NotificationDispatchRecipient[] = []
        mentionedSet.forEach((userId) => {
            mentionRecipients.push({
                userId,
                responsibilityKind: "MENTION",
            })

            if (taskRecipientsResult.task?.visibility_scope === "RESTRICTED") {
                mentionRecipients.push({
                    userId,
                    responsibilityKind: "OBSERVER",
                })
            }
        })

        await dispatchNotificationEvent({
            domain: "TASK",
            eventKey: "TASK_COMMENT_MENTION",
            sector: taskRecipientsResult.task.department,
            actorUserId: params.actorUserId,
            entityType: "TASK_COMMENT",
            entityId: params.commentId,
            taskId: params.taskId,
            taskCommentId: params.commentId,
            title: buildNotificationTitleFromActor(actorDisplay, "mention"),
            message: preview ? `Tarefa: ${taskTitle} • ${preview}` : `Tarefa: ${taskTitle}`,
            metadata: commonMetadata,
            recipients: mentionRecipients,
            dedupeKey: `TASK_COMMENT_MENTION:${params.commentId}`,
            targetPath: `/admin/tarefas?openTask=${params.taskId}`,
        })
    }

    const shouldSendReply = Boolean(params.parentCommentId)
    if (shouldSendReply) {
        const replyRecipients: NotificationDispatchRecipient[] = []

        for (const [userId, responsibilities] of baseRecipientsByUser.entries()) {
            if (mentionedSet.has(userId)) continue
            responsibilities.forEach((responsibility) => {
                replyRecipients.push({
                    userId,
                    responsibilityKind: responsibility,
                })
            })
        }

        replyTargetSet.forEach((userId) => {
            if (mentionedSet.has(userId)) return
            replyRecipients.push({
                userId,
                responsibilityKind: "REPLY_TARGET",
            })
        })

        await dispatchNotificationEvent({
            domain: "TASK",
            eventKey: "TASK_COMMENT_REPLY",
            sector: taskRecipientsResult.task.department,
            actorUserId: params.actorUserId,
            entityType: "TASK_COMMENT",
            entityId: params.commentId,
            taskId: params.taskId,
            taskCommentId: params.commentId,
            title: buildNotificationTitleFromActor(actorDisplay, "reply"),
            message: preview ? `Tarefa: ${taskTitle} • ${preview}` : `Tarefa: ${taskTitle}`,
            metadata: commonMetadata,
            recipients: replyRecipients,
            dedupeKey: `TASK_COMMENT_REPLY:${params.commentId}`,
            targetPath: `/admin/tarefas?openTask=${params.taskId}`,
        })

        return
    }

    const commentRecipients: NotificationDispatchRecipient[] = []
    for (const [userId, responsibilities] of baseRecipientsByUser.entries()) {
        if (mentionedSet.has(userId)) continue

        responsibilities.forEach((responsibility) => {
            commentRecipients.push({
                userId,
                responsibilityKind: responsibility,
            })
        })
    }

    await dispatchNotificationEvent({
        domain: "TASK",
        eventKey: "TASK_COMMENT_CREATED",
        sector: taskRecipientsResult.task.department,
        actorUserId: params.actorUserId,
        entityType: "TASK_COMMENT",
        entityId: params.commentId,
        taskId: params.taskId,
        taskCommentId: params.commentId,
        title: buildNotificationTitleFromActor(actorDisplay, "comment"),
        message: preview ? `Tarefa: ${taskTitle} • ${preview}` : `Tarefa: ${taskTitle}`,
        metadata: commonMetadata,
        recipients: commentRecipients,
        dedupeKey: `TASK_COMMENT_CREATED:${params.commentId}`,
        targetPath: `/admin/tarefas?openTask=${params.taskId}`,
    })
}

export async function createTaskChecklistNotifications(params: {
    taskId: string
    checklistItemId: string
    checklistTitle: string
    isDone: boolean
    actorUserId: string
    responsibleUserId?: string | null
    action?: "TOGGLED" | "CREATED"
}) {
    if (!params.taskId || !params.checklistItemId || !params.actorUserId) {
        return
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for checklist notifications:", error)
        return
    }

    const [taskRecipientsResult, actorResult] = await Promise.all([
        resolveTaskRecipients({
            supabaseAdmin,
            taskId: params.taskId,
            includeSectorMembers: true,
        }),
        supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", params.actorUserId)
            .maybeSingle(),
    ])

    if (taskRecipientsResult.error || !taskRecipientsResult.task) {
        console.error("Error loading task recipients for checklist notifications:", taskRecipientsResult.error)
        return
    }

    if (actorResult.error) {
        console.error("Error loading actor for checklist notifications:", actorResult.error)
    }

    const actor = actorResult.data as { id: string; name: string | null; email: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const taskTitle = (taskRecipientsResult.task.title ?? "Tarefa sem título").trim() || "Tarefa sem título"
    const checklistTitle = (params.checklistTitle ?? "").trim() || "Checklist sem título"
    const action = params.action ?? "TOGGLED"
    const actionLabel = action === "CREATED" ? "adicionou" : (params.isDone ? "concluiu" : "reabriu")

    const recipients = [...taskRecipientsResult.recipients]
    if (params.responsibleUserId?.trim()) {
        recipients.push({
            userId: params.responsibleUserId.trim(),
            responsibilityKind: "OBSERVER",
        })
    }

    const message =
        action === "CREATED"
            ? `${actorDisplay} adicionou "${checklistTitle}" em "${taskTitle}".`
            : `${actorDisplay} ${actionLabel} "${checklistTitle}" em "${taskTitle}".`

    await dispatchNotificationEvent({
        domain: "TASK",
        eventKey: "TASK_CHECKLIST_UPDATED",
        sector: taskRecipientsResult.task.department,
        actorUserId: params.actorUserId,
        entityType: "TASK",
        entityId: params.taskId,
        taskId: params.taskId,
        title: `${actorDisplay} ${actionLabel} um checklist da tarefa`,
        message,
        metadata: {
            checklist_item_id: params.checklistItemId,
            checklist_title: checklistTitle,
            checklist_is_done: params.isDone,
            checklist_action: action,
            checklist_responsible_user_id: params.responsibleUserId?.trim() || null,
            task_title: taskTitle,
            task_id: params.taskId,
            target_path: `/admin/tarefas?openTask=${params.taskId}`,
        },
        recipients,
        dedupeKey:
            action === "CREATED"
                ? `TASK_CHECKLIST_UPDATED:${params.checklistItemId}:CREATED`
                : `TASK_CHECKLIST_UPDATED:${params.checklistItemId}:${params.isDone ? "DONE" : "TODO"}`,
        targetPath: `/admin/tarefas?openTask=${params.taskId}`,
    })
}

export async function createTaskStatusChangedNotifications(params: {
    taskId: string
    actorUserId: string
    oldStatus?: string | null
    newStatus: string
    dedupeToken?: string | null
}) {
    if (!params.taskId || !params.actorUserId || !params.newStatus) {
        return
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for task status notifications:", error)
        return
    }

    const [taskRecipientsResult, actorResult] = await Promise.all([
        resolveTaskRecipients({
            supabaseAdmin,
            taskId: params.taskId,
            includeSectorMembers: true,
        }),
        supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", params.actorUserId)
            .maybeSingle(),
    ])

    if (taskRecipientsResult.error || !taskRecipientsResult.task) {
        console.error("Error loading task recipients for status notifications:", taskRecipientsResult.error)
        return
    }

    if (actorResult.error) {
        console.error("Error loading actor for task status notifications:", actorResult.error)
    }

    const actor = actorResult.data as { id: string; name: string | null; email: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const taskTitle = (taskRecipientsResult.task.title ?? "Tarefa sem título").trim() || "Tarefa sem título"

    const oldStatus = params.oldStatus?.trim() || "status anterior"
    const newStatus = params.newStatus.trim()

    await dispatchNotificationEvent({
        domain: "TASK",
        eventKey: "TASK_STATUS_CHANGED",
        sector: taskRecipientsResult.task.department,
        actorUserId: params.actorUserId,
        entityType: "TASK",
        entityId: params.taskId,
        taskId: params.taskId,
        title: `${actorDisplay} alterou o status de uma tarefa`,
        message: `"${taskTitle}" mudou de ${oldStatus} para ${newStatus}.`,
        metadata: {
            task_title: taskTitle,
            old_status: params.oldStatus ?? null,
            new_status: params.newStatus,
            task_id: params.taskId,
            target_path: `/admin/tarefas?openTask=${params.taskId}`,
        },
        recipients: taskRecipientsResult.recipients,
        dedupeKey: `TASK_STATUS_CHANGED:${params.taskId}:${params.newStatus}:${params.dedupeToken?.trim() || "default"}`,
        targetPath: `/admin/tarefas?openTask=${params.taskId}`,
    })
}

function inferIndicationSectorFromEvent(eventKey: NotificationEventKey) {
    if (eventKey === "INDICATION_DOC_VALIDATION_CHANGED") return "cadastro"
    if (eventKey === "INDICATION_ENERGISA_LOG_ADDED") return "energia"
    if (eventKey === "INDICATION_CONTRACT_MILESTONE") return "financeiro"
    return "vendas"
}

function inferIndicationEntityType(eventKey: NotificationEventKey): NotificationEntityType {
    if (eventKey === "INDICATION_INTERACTION_COMMENT") return "INDICACAO_INTERACTION"
    if (eventKey === "INDICATION_ENERGISA_LOG_ADDED") return "ENERGISA_LOG"
    return "INDICACAO"
}

export async function createIndicationNotificationEvent(params: {
    eventKey: Extract<NotificationEventKey,
        | "INDICATION_CREATED"
        | "INDICATION_STATUS_CHANGED"
        | "INDICATION_DOC_VALIDATION_CHANGED"
        | "INDICATION_INTERACTION_COMMENT"
        | "INDICATION_ENERGISA_LOG_ADDED"
        | "INDICATION_CONTRACT_MILESTONE"
    >
    indicacaoId: string
    actorUserId: string
    title: string
    message: string
    dedupeToken?: string | null
    sector?: string | null
    entityType?: NotificationEntityType
    entityId?: string | null
    metadata?: Record<string, unknown>
}) {
    if (!params.indicacaoId || !params.actorUserId) return

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for indication notifications:", error)
        return
    }

    const { data: indication, error: indicationError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, nome, user_id, created_by_supervisor_id")
        .eq("id", params.indicacaoId)
        .maybeSingle()

    if (indicationError || !indication) {
        console.error("Error loading indication for notifications:", indicationError)
        return
    }

    const sector = normalizeSector(params.sector) ?? inferIndicationSectorFromEvent(params.eventKey)
    const recipients: NotificationDispatchRecipient[] = []

    const ownerId = (indication as { user_id?: string | null }).user_id ?? null
    const creatorId = (indication as { created_by_supervisor_id?: string | null }).created_by_supervisor_id ?? ownerId

    if (ownerId) {
        recipients.push({
            userId: ownerId,
            responsibilityKind: "OWNER",
        })
    }

    if (creatorId) {
        recipients.push({
            userId: creatorId,
            responsibilityKind: "CREATOR",
        })
    }

    const [sectorMembers, mandatoryAdminIds] = await Promise.all([
        getActiveUsersByDepartment(supabaseAdmin, sector),
        getMandatoryAdmMestreUserIds(supabaseAdmin),
    ])

    sectorMembers.forEach((member) => {
        recipients.push({
            userId: member.id,
            responsibilityKind: "SECTOR_MEMBER",
        })
    })

    mandatoryAdminIds.forEach((adminId) => {
        recipients.push({
            userId: adminId,
            responsibilityKind: "SYSTEM",
            isMandatory: true,
        })
    })

    await dispatchNotificationEvent({
        domain: "INDICACAO",
        eventKey: params.eventKey,
        sector,
        actorUserId: params.actorUserId,
        entityType: params.entityType ?? inferIndicationEntityType(params.eventKey),
        entityId: params.entityId?.trim() || params.indicacaoId,
        title: params.title,
        message: params.message,
        metadata: {
            ...(params.metadata ?? {}),
            indicacao_id: params.indicacaoId,
            indication_name: (indication as { nome?: string | null }).nome ?? null,
            target_path: `/admin/indicacoes?openIndicacao=${params.indicacaoId}`,
        },
        recipients,
        dedupeKey: `${params.eventKey}:${params.indicacaoId}:${params.dedupeToken?.trim() || "default"}`,
        targetPath: `/admin/indicacoes?openIndicacao=${params.indicacaoId}`,
    })
}

async function resolveWorkLinkedTaskParticipants(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    taskIds: string[]
}) {
    const participants: NotificationDispatchRecipient[] = []

    if (params.taskIds.length === 0) {
        return participants
    }

    const uniqueTaskIds = Array.from(new Set(params.taskIds.filter(Boolean)))
    if (uniqueTaskIds.length === 0) return participants

    const [taskRowsResult, observersResult] = await Promise.all([
        params.supabaseAdmin
            .from("tasks")
            .select("id, assignee_id, creator_id")
            .in("id", uniqueTaskIds),
        params.supabaseAdmin
            .from("task_observers")
            .select("task_id, user_id")
            .in("task_id", uniqueTaskIds),
    ])

    if (taskRowsResult.error) {
        console.error("Error loading tasks for work notifications:", taskRowsResult.error)
    }

    if (observersResult.error) {
        console.error("Error loading task observers for work notifications:", observersResult.error)
    }

    ;((taskRowsResult.data ?? []) as Array<{ id: string; assignee_id: string | null; creator_id: string | null }>).forEach((row) => {
        if (row.assignee_id) {
            participants.push({
                userId: row.assignee_id,
                responsibilityKind: "LINKED_TASK_PARTICIPANT",
            })
        }

        if (row.creator_id) {
            participants.push({
                userId: row.creator_id,
                responsibilityKind: "LINKED_TASK_PARTICIPANT",
            })
        }
    })

    ;((observersResult.data ?? []) as Array<{ task_id: string; user_id: string }>).forEach((row) => {
        if (!row.user_id) return
        participants.push({
            userId: row.user_id,
            responsibilityKind: "LINKED_TASK_PARTICIPANT",
        })
    })

    return participants
}

export async function createWorkCommentNotifications(params: {
    workId: string
    commentId: string
    actorUserId: string
    content: string
    commentType?: string | null
}) {
    if (!params.workId || !params.commentId || !params.actorUserId) return

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for work comment notifications:", error)
        return
    }

    const [workResult, linkedTaskResult, actorResult, sectorMembers] = await Promise.all([
        supabaseAdmin
            .from("obra_cards" as any)
            .select("id, title, created_by")
            .eq("id", params.workId)
            .maybeSingle(),
        supabaseAdmin
            .from("obra_process_items" as any)
            .select("linked_task_id")
            .eq("obra_id", params.workId)
            .not("linked_task_id", "is", null),
        supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", params.actorUserId)
            .maybeSingle(),
        getActiveUsersByDepartment(supabaseAdmin, "obras"),
    ])

    if (workResult.error || !workResult.data) {
        console.error("Error loading work for work comment notifications:", workResult.error)
        return
    }

    if (linkedTaskResult.error) {
        console.error("Error loading linked tasks for work comment notifications:", linkedTaskResult.error)
    }

    if (actorResult.error) {
        console.error("Error loading actor for work comment notifications:", actorResult.error)
    }

    const linkedTaskIds = Array.from(
        new Set(
            ((linkedTaskResult.data ?? []) as Array<{ linked_task_id: string | null }>)
                .map((row) => row.linked_task_id)
                .filter((value): value is string => Boolean(value))
        )
    )

    const linkedTaskParticipants = await resolveWorkLinkedTaskParticipants({
        supabaseAdmin,
        taskIds: linkedTaskIds,
    })

    const recipients: NotificationDispatchRecipient[] = []

    const creatorId = (workResult.data as { created_by?: string | null }).created_by ?? null
    if (creatorId) {
        recipients.push({
            userId: creatorId,
            responsibilityKind: "CREATOR",
        })
    }

    recipients.push(...linkedTaskParticipants)

    sectorMembers.forEach((member) => {
        recipients.push({
            userId: member.id,
            responsibilityKind: "SECTOR_MEMBER",
        })
    })

    const actor = actorResult.data as { name?: string | null; email?: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const workTitle = ((workResult.data as { title?: string | null }).title ?? "Obra sem título").trim() || "Obra sem título"
    const preview = sanitizePreview(params.content)

    const baseTitle = params.commentType === "ENERGISA_RESPOSTA"
        ? `${actorDisplay} registrou atualização da Energisa em uma obra`
        : `${actorDisplay} comentou em uma obra`

    await dispatchNotificationEvent({
        domain: "OBRA",
        eventKey: "WORK_COMMENT_CREATED",
        sector: "obras",
        actorUserId: params.actorUserId,
        entityType: "OBRA_COMMENT",
        entityId: params.commentId,
        title: baseTitle,
        message: preview
            ? `Obra: ${workTitle} • ${preview}`
            : `Obra: ${workTitle}`,
        metadata: {
            work_id: params.workId,
            work_title: workTitle,
            comment_id: params.commentId,
            comment_type: params.commentType ?? "GERAL",
            target_path: `/admin/obras?openWork=${params.workId}`,
        },
        recipients,
        dedupeKey: `WORK_COMMENT_CREATED:${params.commentId}`,
        targetPath: `/admin/obras?openWork=${params.workId}`,
    })
}

export async function createWorkProcessStatusChangedNotifications(params: {
    workId: string
    processItemId: string
    actorUserId: string
    processTitle: string
    oldStatus?: string | null
    newStatus: string
    linkedTaskId?: string | null
    dedupeToken?: string | null
}) {
    if (!params.workId || !params.processItemId || !params.actorUserId || !params.newStatus) {
        return
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for work process notifications:", error)
        return
    }

    const [workResult, actorResult, sectorMembers] = await Promise.all([
        supabaseAdmin
            .from("obra_cards" as any)
            .select("id, title, created_by")
            .eq("id", params.workId)
            .maybeSingle(),
        supabaseAdmin
            .from("users")
            .select("id, name, email")
            .eq("id", params.actorUserId)
            .maybeSingle(),
        getActiveUsersByDepartment(supabaseAdmin, "obras"),
    ])

    if (workResult.error || !workResult.data) {
        console.error("Error loading work for work process notifications:", workResult.error)
        return
    }

    if (actorResult.error) {
        console.error("Error loading actor for work process notifications:", actorResult.error)
    }

    const linkedTaskParticipants = await resolveWorkLinkedTaskParticipants({
        supabaseAdmin,
        taskIds: params.linkedTaskId ? [params.linkedTaskId] : [],
    })

    const recipients: NotificationDispatchRecipient[] = []

    const creatorId = (workResult.data as { created_by?: string | null }).created_by ?? null
    if (creatorId) {
        recipients.push({
            userId: creatorId,
            responsibilityKind: "CREATOR",
        })
    }

    recipients.push(...linkedTaskParticipants)

    sectorMembers.forEach((member) => {
        recipients.push({
            userId: member.id,
            responsibilityKind: "SECTOR_MEMBER",
        })
    })

    const actor = actorResult.data as { name?: string | null; email?: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const workTitle = ((workResult.data as { title?: string | null }).title ?? "Obra sem título").trim() || "Obra sem título"

    await dispatchNotificationEvent({
        domain: "OBRA",
        eventKey: "WORK_PROCESS_STATUS_CHANGED",
        sector: "obras",
        actorUserId: params.actorUserId,
        entityType: "OBRA_PROCESS_ITEM",
        entityId: params.processItemId,
        title: `${actorDisplay} alterou o status de uma etapa da obra`,
        message: `Obra: ${workTitle} • Etapa: ${params.processTitle} • ${params.oldStatus ?? "status anterior"} -> ${params.newStatus}`,
        metadata: {
            work_id: params.workId,
            work_title: workTitle,
            process_item_id: params.processItemId,
            process_title: params.processTitle,
            old_status: params.oldStatus ?? null,
            new_status: params.newStatus,
            linked_task_id: params.linkedTaskId ?? null,
            target_path: `/admin/obras?openWork=${params.workId}`,
        },
        recipients,
        dedupeKey: `WORK_PROCESS_STATUS_CHANGED:${params.processItemId}:${params.newStatus}:${params.dedupeToken?.trim() || "default"}`,
        targetPath: `/admin/obras?openWork=${params.workId}`,
    })
}

export async function createChatNotificationEvent(params: {
    conversationId: string
    senderUserId: string
    recipientUserId: string
    title: string
    message: string
    metadata?: Record<string, unknown>
    dedupeToken?: string | null
}) {
    if (!params.conversationId || !params.senderUserId || !params.recipientUserId) {
        return
    }

    await dispatchNotificationEvent({
        domain: "CHAT",
        eventKey: "INTERNAL_CHAT_MESSAGE",
        sector: "legacy",
        actorUserId: params.senderUserId,
        entityType: "CHAT_CONVERSATION",
        entityId: params.conversationId,
        type: "INTERNAL_CHAT_MESSAGE",
        title: params.title,
        message: params.message,
        metadata: mergeMetadata(params.metadata, {
            conversation_id: params.conversationId,
            target_path: `/admin/chat?conversation=${params.conversationId}`,
        }),
        recipients: [
            {
                userId: params.recipientUserId,
                responsibilityKind: "DIRECT",
            },
        ],
        dedupeKey: `INTERNAL_CHAT_MESSAGE:${params.conversationId}:${params.dedupeToken?.trim() || Date.now().toString()}`,
        targetPath: `/admin/chat?conversation=${params.conversationId}`,
    })
}

export async function getDefaultNotificationSectors() {
    return DEFAULT_TASK_SECTORS.slice()
}

export async function getNotificationRuleDetailsForCurrentUser() {
    return getMyNotificationRules()
}

export async function getMyNotificationTargetPath(notification: NotificationItem) {
    const metadataTarget = getMetadataString(notification.metadata, "target_path")
    if (metadataTarget?.startsWith("/")) {
        return metadataTarget
    }

    if (notification.domain === "CHAT") {
        const conversationId = getMetadataString(notification.metadata, "conversation_id")
        if (conversationId) {
            return `/admin/chat?conversation=${conversationId}`
        }
    }

    if (notification.domain === "TASK" && notification.task_id) {
        return `/admin/tarefas?openTask=${notification.task_id}`
    }

    if (notification.domain === "INDICACAO") {
        const indicationId = getMetadataString(notification.metadata, "indicacao_id") ?? notification.entity_id
        if (indicationId) {
            return `/admin/indicacoes?openIndicacao=${indicationId}`
        }
    }

    if (notification.domain === "OBRA") {
        const workId = getMetadataString(notification.metadata, "work_id") ?? notification.entity_id
        if (workId) {
            return `/admin/obras?openWork=${workId}`
        }
    }

    return null
}
