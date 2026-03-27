"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasInternalChatAccess } from "@/lib/internal-chat-access"
import {
    INTERNAL_CHAT_ATTACHMENTS_BUCKET,
    MAX_INTERNAL_CHAT_ATTACHMENT_BYTES,
    MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE,
    isInternalChatAttachmentRetentionPolicy,
    type InternalChatAttachmentRetentionPolicy,
} from "@/lib/internal-chat-attachment-config"
import { createChatNotificationEvent } from "@/services/notification-service"

const INTERNAL_CHAT_MAX_CONVERSATIONS = 120
const INTERNAL_CHAT_MAX_MESSAGE_LENGTH = 2000
const INTERNAL_CHAT_DEFAULT_MESSAGES_LIMIT = 60
const INTERNAL_CHAT_MAX_MESSAGES_LIMIT = 200
const INTERNAL_CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 10
const INTERNAL_CHAT_ATTACHMENTS_CLEANUP_BATCH_SIZE = 200

export type InternalChatConversationKind = "direct"

export interface InternalChatUser {
    id: string
    name: string | null
    email: string | null
}

export interface InternalChatMessage {
    id: string
    conversation_id: string
    sender_user_id: string
    body: string
    created_at: string
    sender: InternalChatUser | null
    attachments: InternalChatAttachment[]
}

export interface InternalChatAttachment {
    id: string
    message_id: string
    conversation_id: string
    uploaded_by_user_id: string
    storage_path: string
    original_name: string
    content_type: string | null
    size_bytes: number
    retention_policy: InternalChatAttachmentRetentionPolicy
    first_downloaded_at: string | null
    expires_at: string | null
    download_count: number
    created_at: string
}

export interface InternalChatConversationListItem {
    id: string
    kind: InternalChatConversationKind
    last_message_at: string
    created_at: string
    updated_at: string
    unread_count: number
    last_message: {
        id: string
        body: string
        created_at: string
        sender_user_id: string
        sender_name: string | null
    } | null
    other_user: InternalChatUser
}

export interface InternalChatMessagesPage {
    messages: InternalChatMessage[]
    nextCursor: string | null
}

export type InternalChatActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string }

export interface InternalChatMessageAttachmentInput {
    path: string
    original_name: string
    content_type: string | null
    size_bytes: number
    retention_policy: InternalChatAttachmentRetentionPolicy
}

type CurrentInternalChatUser = {
    id: string
    name: string | null
    email: string | null
    role: string | null
    department?: string | null
    status: string | null
    internal_chat_access?: boolean | null
}

type ConversationRow = {
    id: string
    kind: InternalChatConversationKind
    direct_user_a_id: string
    direct_user_b_id: string
    last_message_at: string
    created_at: string
    updated_at: string
}

type ParticipantRow = {
    conversation_id: string
    user_id: string
    unread_count: number
    last_read_at: string | null
    joined_at: string
}

type MessageRow = {
    id: string
    conversation_id: string
    sender_user_id: string
    body: string
    created_at: string
}

type MessageAttachmentRow = {
    id: string
    message_id: string
    conversation_id: string
    uploaded_by_user_id: string
    storage_path: string
    original_name: string
    content_type: string | null
    size_bytes: number
    retention_policy: InternalChatAttachmentRetentionPolicy
    first_downloaded_at: string | null
    expires_at: string | null
    download_count: number
    created_at: string
}

type BasicUserRow = {
    id: string
    name: string | null
    email: string | null
}

type RecipientRow = {
    user_id: string
}

type AttachmentLinkMessageRow = {
    id: string
    conversation_id: string
    sender_user_id: string
}

type UnreadCountRow = {
    unread_count: number | null
}

type ChatUsersLookupRow = BasicUserRow & {
    role: string | null
    department?: string | null
    status: string | null
    internal_chat_access?: boolean | null
}

type ChatSessionSuccess = {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    user: { id: string }
    currentUser: CurrentInternalChatUser
}

type ChatSessionFailure = {
    error: string
}

function success<T>(data: T): InternalChatActionResult<T> {
    return { success: true, data }
}

function failure<T>(error: string): InternalChatActionResult<T> {
    return { success: false, error }
}

function sanitizeSearchTerm(value?: string | null) {
    if (!value) return ""
    return value
        .replace(/[,%()]/g, " ")
        .replace(/'/g, "")
        .trim()
}

function sanitizeMessageBody(value: string) {
    const normalized = value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim()

    if (!normalized) return null
    if (normalized.length > INTERNAL_CHAT_MAX_MESSAGE_LENGTH) return null
    return normalized
}

function normalizeStoragePath(value: string) {
    return value
        .trim()
        .replace(/^\/+/, "")
}

function normalizeAttachmentFileName(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return "anexo"

    return trimmed
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .slice(0, 255)
}

function resolveMessageBodyValue(inputBody: string, hasAttachments: boolean) {
    const sanitizedBody = sanitizeMessageBody(inputBody)
    if (sanitizedBody) return sanitizedBody
    if (hasAttachments) return "Anexo enviado."
    return null
}

function isAttachmentExpired(expiresAt: string | null | undefined, nowMs = Date.now()) {
    if (!expiresAt) return false
    const expiresMs = Date.parse(expiresAt)
    if (Number.isNaN(expiresMs)) return false
    return expiresMs <= nowMs
}

function getAttachmentExpiryFromPolicy(
    retentionPolicy: InternalChatAttachmentRetentionPolicy,
    baseDate = new Date()
) {
    if (retentionPolicy === "download_24h") {
        return new Date(baseDate.getTime() + (24 * 60 * 60 * 1000)).toISOString()
    }

    if (retentionPolicy === "download_30d") {
        return new Date(baseDate.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()
    }

    return null
}

function sanitizeMessageAttachmentInput(
    input: InternalChatMessageAttachmentInput
): InternalChatMessageAttachmentInput | null {
    const path = normalizeStoragePath(input.path)
    if (!path) return null

    const originalName = normalizeAttachmentFileName(input.original_name)
    if (!originalName) return null

    const sizeBytes = Number(input.size_bytes)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_INTERNAL_CHAT_ATTACHMENT_BYTES) {
        return null
    }

    if (!isInternalChatAttachmentRetentionPolicy(input.retention_policy)) {
        return null
    }

    const contentType = typeof input.content_type === "string" && input.content_type.trim()
        ? input.content_type.trim()
        : null

    return {
        path,
        original_name: originalName,
        content_type: contentType,
        size_bytes: Math.trunc(sizeBytes),
        retention_policy: input.retention_policy,
    }
}

function sanitizeMessageAttachmentsInput(
    attachmentsInput: InternalChatMessageAttachmentInput[] | null | undefined
) {
    const inputList = Array.isArray(attachmentsInput) ? attachmentsInput : []
    if (inputList.length === 0) return [] as InternalChatMessageAttachmentInput[]
    if (inputList.length > MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE) return null

    const sanitized = inputList
        .map((item) => sanitizeMessageAttachmentInput(item))
        .filter((item): item is InternalChatMessageAttachmentInput => Boolean(item))

    if (sanitized.length !== inputList.length) return null

    const pathSet = new Set<string>()
    for (const item of sanitized) {
        if (pathSet.has(item.path)) return null
        pathSet.add(item.path)
    }

    return sanitized
}

function sanitizeNotificationPreview(content: string, maxLength = 160) {
    const cleaned = content.replace(/\s+/g, " ").trim()
    if (!cleaned) return ""
    if (cleaned.length <= maxLength) return cleaned
    return `${cleaned.slice(0, maxLength - 3)}...`
}

function normalizeDirectPair(userA: string, userB: string) {
    return userA < userB ? [userA, userB] : [userB, userA]
}

function userDisplayName(user: Pick<InternalChatUser, "name" | "email"> | null | undefined) {
    if (!user) return "Usuário"
    return user.name?.trim() || user.email?.trim() || "Usuário"
}

function isMissingInternalChatAccessColumnError(error?: { message?: string | null } | null) {
    return /could not find the 'internal_chat_access' column/i.test(error?.message ?? "")
}

function isInactiveStatus(status: string | null | undefined) {
    const normalized = (status ?? "").trim().toLowerCase()
    return normalized === "inativo" || normalized === "inactive" || normalized === "suspended"
}

async function requireChatSession(): Promise<ChatSessionSuccess | ChatSessionFailure> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Usuário não autenticado." } as const
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for internal chat:", error)
        return { error: "Falha ao inicializar chat interno." } as const
    }

    let { data: currentUserRow, error: currentUserError } = await supabaseAdmin
        .from("users")
        .select("id, name, email, role, department, status, internal_chat_access")
        .eq("id", user.id)
        .maybeSingle()

    if (currentUserError && isMissingInternalChatAccessColumnError(currentUserError)) {
        const fallback = await supabaseAdmin
            .from("users")
            .select("id, name, email, role, department, status")
            .eq("id", user.id)
            .maybeSingle()

        currentUserRow = fallback.data as typeof currentUserRow
        currentUserError = fallback.error as typeof currentUserError
    }

    if (currentUserError || !currentUserRow) {
        console.error("Error loading internal chat current user:", currentUserError)
        return { error: "Não foi possível validar seu acesso ao chat." } as const
    }

    const currentUser = currentUserRow as CurrentInternalChatUser
    if (!hasInternalChatAccess(currentUser)) {
        return { error: "Seu perfil não possui acesso ao chat interno." } as const
    }

    if (isInactiveStatus(currentUser.status)) {
        return { error: "Seu usuário está inativo no chat interno." } as const
    }

    return {
        supabaseAdmin,
        user: { id: user.id },
        currentUser,
    } as const
}

async function ensureParticipant(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    conversationId: string,
    userId: string
) {
    const { data, error } = await supabaseAdmin
        .from("internal_chat_participants")
        .select("conversation_id, user_id, unread_count, last_read_at, joined_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .maybeSingle()

    if (error || !data) {
        return null
    }

    return data as ParticipantRow
}

async function fetchConversationById(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    conversationId: string
) {
    const { data, error } = await supabaseAdmin
        .from("internal_chat_conversations")
        .select("id, kind, direct_user_a_id, direct_user_b_id, last_message_at, created_at, updated_at")
        .eq("id", conversationId)
        .maybeSingle()

    if (error || !data) {
        return null
    }

    return data as ConversationRow
}

async function fetchLatestMessage(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    conversationId: string
) {
    const { data, error } = await supabaseAdmin
        .from("internal_chat_messages")
        .select("id, conversation_id, sender_user_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error("Error loading latest internal chat message:", {
            error,
            conversationId,
        })
        return null
    }

    return (data ?? null) as MessageRow | null
}

async function cleanupExpiredChatAttachments(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    options?: { conversationId?: string; batchSize?: number }
) {
    const nowIso = new Date().toISOString()
    const batchSize = Math.min(Math.max(options?.batchSize ?? INTERNAL_CHAT_ATTACHMENTS_CLEANUP_BATCH_SIZE, 1), 500)
    let query = supabaseAdmin
        .from("internal_chat_message_attachments")
        .select("id, storage_path")
        .lt("expires_at", nowIso)
        .order("expires_at", { ascending: true })
        .limit(batchSize)

    if (options?.conversationId) {
        query = query.eq("conversation_id", options.conversationId)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) {
        if (error) {
            console.error("Error listing expired internal chat attachments:", {
                error,
                conversationId: options?.conversationId ?? null,
            })
        }
        return
    }

    const rows = (data as Array<{ id: string; storage_path: string }>)
        .filter((row) => typeof row.id === "string" && typeof row.storage_path === "string")
        .map((row) => ({ id: row.id, storage_path: normalizeStoragePath(row.storage_path) }))
        .filter((row) => row.id.length > 0 && row.storage_path.length > 0)

    if (rows.length === 0) return

    const storagePaths = rows.map((row) => row.storage_path)
    const { error: storageError } = await supabaseAdmin.storage
        .from(INTERNAL_CHAT_ATTACHMENTS_BUCKET)
        .remove(storagePaths)

    if (storageError) {
        console.error("Error deleting expired internal chat attachment files:", {
            error: storageError,
            count: storagePaths.length,
        })
    }

    const attachmentIds = rows.map((row) => row.id)
    const { error: deleteError } = await supabaseAdmin
        .from("internal_chat_message_attachments")
        .delete()
        .in("id", attachmentIds)

    if (deleteError) {
        console.error("Error deleting expired internal chat attachment rows:", {
            error: deleteError,
            count: attachmentIds.length,
        })
    }
}

async function listMessageAttachments(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    conversationId: string,
    messageIds: string[]
) {
    if (messageIds.length === 0) {
        return [] as MessageAttachmentRow[]
    }

    const { data, error } = await supabaseAdmin
        .from("internal_chat_message_attachments")
        .select(`
            id,
            message_id,
            conversation_id,
            uploaded_by_user_id,
            storage_path,
            original_name,
            content_type,
            size_bytes,
            retention_policy,
            first_downloaded_at,
            expires_at,
            download_count,
            created_at
        `)
        .eq("conversation_id", conversationId)
        .in("message_id", messageIds)
        .order("created_at", { ascending: true })

    if (error) {
        console.error("Error loading internal chat message attachments:", {
            error,
            conversationId,
            messageIdsCount: messageIds.length,
        })
        return [] as MessageAttachmentRow[]
    }

    const nowMs = Date.now()
    return ((data ?? []) as MessageAttachmentRow[]).filter((row) => !isAttachmentExpired(row.expires_at, nowMs))
}

async function loadAttachmentWithMessageContext(
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
    attachmentId: string
) {
    const { data: attachmentData, error: attachmentError } = await supabaseAdmin
        .from("internal_chat_message_attachments")
        .select(
            `
                id,
                message_id,
                conversation_id,
                uploaded_by_user_id,
                storage_path,
                original_name,
                content_type,
                size_bytes,
                retention_policy,
                first_downloaded_at,
                expires_at,
                download_count,
                created_at
            `
        )
        .eq("id", attachmentId)
        .maybeSingle()

    if (attachmentError || !attachmentData) {
        return null
    }

    const row = attachmentData as MessageAttachmentRow

    const { data: messageData, error: messageError } = await supabaseAdmin
        .from("internal_chat_messages")
        .select("id, conversation_id, sender_user_id")
        .eq("id", row.message_id)
        .maybeSingle()

    if (messageError || !messageData) {
        return null
    }

    const message = messageData as AttachmentLinkMessageRow

    return {
        attachment: row,
        message,
    } as const
}

export async function getOrCreateDirectConversation(otherUserId: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<string>(session.error)
    }

    const { supabaseAdmin, user } = session
    const sanitizedOtherUserId = otherUserId.trim()

    if (!sanitizedOtherUserId) {
        return failure<string>("Selecione um usuário válido.")
    }

    if (sanitizedOtherUserId === user.id) {
        return failure<string>("Não é possível abrir conversa com você mesmo.")
    }

    let { data: otherUserRow, error: otherUserError } = await supabaseAdmin
        .from("users")
        .select("id, role, department, status, internal_chat_access")
        .eq("id", sanitizedOtherUserId)
        .maybeSingle()

    if (otherUserError && isMissingInternalChatAccessColumnError(otherUserError)) {
        const fallback = await supabaseAdmin
            .from("users")
            .select("id, role, department, status")
            .eq("id", sanitizedOtherUserId)
            .maybeSingle()

        otherUserRow = fallback.data as typeof otherUserRow
        otherUserError = fallback.error as typeof otherUserError
    }

    if (otherUserError || !otherUserRow) {
        return failure<string>("Usuário de destino não encontrado.")
    }

    const otherUser = otherUserRow as {
        id: string
        role?: string | null
        department?: string | null
        status?: string | null
        internal_chat_access?: boolean | null
    }

    if (!hasInternalChatAccess(otherUser) || isInactiveStatus(otherUser.status)) {
        return failure<string>("Usuário sem acesso ao chat interno.")
    }

    const [directUserAId, directUserBId] = normalizeDirectPair(user.id, sanitizedOtherUserId)

    const { data: existingConversation } = await supabaseAdmin
        .from("internal_chat_conversations")
        .select("id")
        .eq("direct_user_a_id", directUserAId)
        .eq("direct_user_b_id", directUserBId)
        .maybeSingle()

    if (existingConversation?.id) {
        return success(existingConversation.id as string)
    }

    const { data: insertedConversation, error: insertError } = await supabaseAdmin
        .from("internal_chat_conversations")
        .insert({
            kind: "direct",
            direct_user_a_id: directUserAId,
            direct_user_b_id: directUserBId,
        })
        .select("id")
        .maybeSingle()

    if (insertError) {
        if (insertError.code === "23505") {
            const { data: raceConversation, error: raceError } = await supabaseAdmin
                .from("internal_chat_conversations")
                .select("id")
                .eq("direct_user_a_id", directUserAId)
                .eq("direct_user_b_id", directUserBId)
                .maybeSingle()

            if (raceError || !raceConversation) {
                console.error("Error resolving race condition in direct conversation creation:", {
                    error: raceError,
                    userId: user.id,
                    otherUserId: sanitizedOtherUserId,
                })
                return failure<string>("Não foi possível abrir a conversa.")
            }

            return success(raceConversation.id as string)
        }

        console.error("Error creating internal direct conversation:", {
            error: insertError,
            userId: user.id,
            otherUserId: sanitizedOtherUserId,
        })
        return failure<string>("Não foi possível abrir a conversa.")
    }

    const createdConversationId = insertedConversation?.id as string | undefined
    if (!createdConversationId) {
        return failure<string>("Não foi possível abrir a conversa.")
    }

    revalidatePath("/admin/chat")
    return success(createdConversationId)
}

export async function listMyConversations(search?: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<InternalChatConversationListItem[]>(session.error)
    }

    const { supabaseAdmin, user, currentUser } = session
    const searchTerm = sanitizeSearchTerm(search).toLowerCase()

    const { data: participantRows, error: participantError } = await supabaseAdmin
        .from("internal_chat_participants")
        .select("conversation_id, user_id, unread_count, last_read_at, joined_at")
        .eq("user_id", user.id)
        .limit(INTERNAL_CHAT_MAX_CONVERSATIONS)

    if (participantError) {
        console.error("Error listing internal chat participants:", {
            error: participantError,
            userId: user.id,
        })
        return failure<InternalChatConversationListItem[]>("Falha ao carregar conversas do chat.")
    }

    const participants = (participantRows ?? []) as ParticipantRow[]
    if (participants.length === 0) {
        return success([])
    }

    const participantMap = new Map<string, ParticipantRow>()
    participants.forEach((participant) => {
        participantMap.set(participant.conversation_id, participant)
    })

    const conversationIds = participants.map((participant) => participant.conversation_id)

    const { data: conversationRows, error: conversationError } = await supabaseAdmin
        .from("internal_chat_conversations")
        .select("id, kind, direct_user_a_id, direct_user_b_id, last_message_at, created_at, updated_at")
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false })

    if (conversationError) {
        console.error("Error loading internal chat conversations:", {
            error: conversationError,
            userId: user.id,
        })
        return failure<InternalChatConversationListItem[]>("Falha ao carregar conversas do chat.")
    }

    const conversations = (conversationRows ?? []) as ConversationRow[]
    if (conversations.length === 0) {
        return success([])
    }

    const otherUserIds = Array.from(
        new Set(
            conversations
                .map((conversation) =>
                    conversation.direct_user_a_id === user.id
                        ? conversation.direct_user_b_id
                        : conversation.direct_user_a_id
                )
                .filter(Boolean)
        )
    )

    const { data: otherUsersRows, error: otherUsersError } = await supabaseAdmin
        .from("users")
        .select("id, name, email")
        .in("id", otherUserIds)

    if (otherUsersError) {
        console.error("Error loading internal chat participant users:", {
            error: otherUsersError,
            userId: user.id,
        })
        return failure<InternalChatConversationListItem[]>("Falha ao carregar participantes do chat.")
    }

    const usersById = new Map<string, InternalChatUser>()
    ;((otherUsersRows ?? []) as BasicUserRow[]).forEach((row) => {
        usersById.set(row.id, {
            id: row.id,
            name: row.name ?? null,
            email: row.email ?? null,
        })
    })
    usersById.set(user.id, {
        id: user.id,
        name: currentUser.name ?? null,
        email: currentUser.email ?? null,
    })

    const latestMessages = await Promise.all(
        conversations.map((conversation) => fetchLatestMessage(supabaseAdmin, conversation.id))
    )

    const latestMessageByConversation = new Map<string, MessageRow | null>()
    latestMessages.forEach((message, index) => {
        latestMessageByConversation.set(conversations[index].id, message)
    })

    const items = conversations
        .map((conversation) => {
            const participant = participantMap.get(conversation.id)
            if (!participant) return null

            const otherUserId =
                conversation.direct_user_a_id === user.id
                    ? conversation.direct_user_b_id
                    : conversation.direct_user_a_id

            const otherUser = usersById.get(otherUserId)
            if (!otherUser) return null

            const latestMessage = latestMessageByConversation.get(conversation.id) ?? null
            const senderName = latestMessage
                ? userDisplayName(usersById.get(latestMessage.sender_user_id) ?? null)
                : null

            return {
                id: conversation.id,
                kind: conversation.kind,
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                last_message_at: conversation.last_message_at,
                unread_count: participant.unread_count ?? 0,
                last_message: latestMessage
                    ? {
                        id: latestMessage.id,
                        body: latestMessage.body,
                        created_at: latestMessage.created_at,
                        sender_user_id: latestMessage.sender_user_id,
                        sender_name: senderName,
                    }
                    : null,
                other_user: otherUser,
            } satisfies InternalChatConversationListItem
        })
        .filter((item): item is InternalChatConversationListItem => Boolean(item))

    if (!searchTerm) {
        return success(items)
    }

    const filtered = items.filter((conversation) => {
        const otherName = conversation.other_user.name?.toLowerCase() ?? ""
        const otherEmail = conversation.other_user.email?.toLowerCase() ?? ""
        const lastBody = conversation.last_message?.body?.toLowerCase() ?? ""
        return (
            otherName.includes(searchTerm)
            || otherEmail.includes(searchTerm)
            || lastBody.includes(searchTerm)
        )
    })

    return success(filtered)
}

export async function getConversationMessages(
    conversationId: string,
    limit = INTERNAL_CHAT_DEFAULT_MESSAGES_LIMIT,
    cursor?: string
) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<InternalChatMessagesPage>(session.error)
    }

    const { supabaseAdmin, user } = session
    const sanitizedConversationId = conversationId.trim()
    const safeLimit = Math.min(Math.max(limit, 1), INTERNAL_CHAT_MAX_MESSAGES_LIMIT)

    if (!sanitizedConversationId) {
        return failure<InternalChatMessagesPage>("Conversa inválida.")
    }

    const hasAccess = await ensureParticipant(supabaseAdmin, sanitizedConversationId, user.id)
    if (!hasAccess) {
        return failure<InternalChatMessagesPage>("Você não tem acesso a esta conversa.")
    }

    await cleanupExpiredChatAttachments(supabaseAdmin, { conversationId: sanitizedConversationId })

    let query = supabaseAdmin
        .from("internal_chat_messages")
        .select("id, conversation_id, sender_user_id, body, created_at")
        .eq("conversation_id", sanitizedConversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(safeLimit + 1)

    const sanitizedCursor = cursor?.trim()
    if (sanitizedCursor) {
        query = query.lt("created_at", sanitizedCursor)
    }

    const { data: messageRows, error: messageError } = await query

    if (messageError) {
        console.error("Error loading internal chat messages:", {
            error: messageError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
        return failure<InternalChatMessagesPage>("Falha ao carregar mensagens do chat.")
    }

    const rows = (messageRows ?? []) as MessageRow[]
    const hasMore = rows.length > safeLimit
    const rowsToUse = hasMore ? rows.slice(0, safeLimit) : rows
    const nextCursor = hasMore ? rowsToUse[rowsToUse.length - 1]?.created_at ?? null : null
    const messageIds = rowsToUse.map((row) => row.id)

    const attachmentRows = await listMessageAttachments(
        supabaseAdmin,
        sanitizedConversationId,
        messageIds
    )
    const attachmentsByMessage = new Map<string, InternalChatAttachment[]>()
    attachmentRows.forEach((row) => {
        const existing = attachmentsByMessage.get(row.message_id) ?? []
        existing.push({
            id: row.id,
            message_id: row.message_id,
            conversation_id: row.conversation_id,
            uploaded_by_user_id: row.uploaded_by_user_id,
            storage_path: row.storage_path,
            original_name: row.original_name,
            content_type: row.content_type ?? null,
            size_bytes: row.size_bytes,
            retention_policy: row.retention_policy,
            first_downloaded_at: row.first_downloaded_at ?? null,
            expires_at: row.expires_at ?? null,
            download_count: row.download_count ?? 0,
            created_at: row.created_at,
        })
        attachmentsByMessage.set(row.message_id, existing)
    })

    const senderIds = Array.from(new Set(rowsToUse.map((row) => row.sender_user_id)))
    const { data: senderRows, error: senderError } = await supabaseAdmin
        .from("users")
        .select("id, name, email")
        .in("id", senderIds)

    if (senderError) {
        console.error("Error loading internal chat senders:", {
            error: senderError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
        return failure<InternalChatMessagesPage>("Falha ao carregar remetentes das mensagens.")
    }

    const sendersById = new Map<string, InternalChatUser>()
    ;((senderRows ?? []) as BasicUserRow[]).forEach((row) => {
        sendersById.set(row.id, {
            id: row.id,
            name: row.name ?? null,
            email: row.email ?? null,
        })
    })

    const messages = rowsToUse
        .slice()
        .reverse()
        .map((row) => ({
            id: row.id,
            conversation_id: row.conversation_id,
            sender_user_id: row.sender_user_id,
            body: row.body,
            created_at: row.created_at,
            sender: sendersById.get(row.sender_user_id) ?? null,
            attachments: attachmentsByMessage.get(row.id) ?? [],
        })) satisfies InternalChatMessage[]

    return success({
        messages,
        nextCursor,
    })
}

export async function createChatMessageNotification(params: {
    conversationId: string
    senderUserId: string
    recipientUserId: string
    body: string
    messageId?: string
}) {
    if (!params.conversationId || !params.senderUserId || !params.recipientUserId) {
        return
    }

    if (params.senderUserId === params.recipientUserId) {
        return
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error("Error creating service client for chat notifications:", error)
        return
    }

    const { data: senderRow, error: senderError } = await supabaseAdmin
        .from("users")
        .select("id, name, email")
        .eq("id", params.senderUserId)
        .maybeSingle()

    if (senderError) {
        console.error("Error loading sender for chat notification:", {
            error: senderError,
            conversationId: params.conversationId,
            senderUserId: params.senderUserId,
            recipientUserId: params.recipientUserId,
        })
    }

    const sender = (senderRow as { id: string; name?: string | null; email?: string | null } | null) ?? null
    const senderName = sender?.name?.trim() || sender?.email || "Alguém"
    const preview = sanitizeNotificationPreview(params.body)

    try {
        await createChatNotificationEvent({
            conversationId: params.conversationId,
            senderUserId: params.senderUserId,
            recipientUserId: params.recipientUserId,
            title: `Mensagem interna de ${senderName}`,
            message: preview || "Você recebeu uma nova mensagem interna.",
            dedupeToken: params.messageId?.trim() || `${Date.now()}`,
            metadata: {
                sender_name: senderName,
                message_id: params.messageId ?? null,
            },
        })
    } catch (notificationError) {
        console.error("Error creating internal chat notification:", {
            error: notificationError,
            conversationId: params.conversationId,
            senderUserId: params.senderUserId,
            recipientUserId: params.recipientUserId,
        })
    }
}

export async function sendMessage(
    conversationId: string,
    body: string,
    options?: { attachments?: InternalChatMessageAttachmentInput[] }
) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<InternalChatMessage>(session.error)
    }

    const { supabaseAdmin, user, currentUser } = session
    const sanitizedConversationId = conversationId.trim()

    if (!sanitizedConversationId) {
        return failure<InternalChatMessage>("Conversa inválida.")
    }

    const sanitizedAttachments = sanitizeMessageAttachmentsInput(options?.attachments)
    if (!sanitizedAttachments) {
        return failure<InternalChatMessage>(
            `Anexos inválidos. Envie até ${MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE} arquivo(s) de no máximo 100MB cada.`
        )
    }

    const isPathOutsideConversation = sanitizedAttachments.some(
        (attachment) => !attachment.path.startsWith(`${sanitizedConversationId}/`)
    )
    if (isPathOutsideConversation) {
        return failure<InternalChatMessage>("Anexo inválido para esta conversa.")
    }

    const hasAttachments = sanitizedAttachments.length > 0
    const messageBody = resolveMessageBodyValue(body, hasAttachments)
    if (!messageBody) {
        return failure<InternalChatMessage>(
            `A mensagem precisa ter entre 1 e ${INTERNAL_CHAT_MAX_MESSAGE_LENGTH} caracteres.`
        )
    }

    const hasAccess = await ensureParticipant(supabaseAdmin, sanitizedConversationId, user.id)
    if (!hasAccess) {
        return failure<InternalChatMessage>("Você não tem acesso a esta conversa.")
    }

    const conversation = await fetchConversationById(supabaseAdmin, sanitizedConversationId)
    if (!conversation) {
        return failure<InternalChatMessage>("Conversa não encontrada.")
    }

    const { data: insertedMessage, error: messageError } = await supabaseAdmin
        .from("internal_chat_messages")
        .insert({
            conversation_id: sanitizedConversationId,
            sender_user_id: user.id,
            body: messageBody,
        })
        .select("id, conversation_id, sender_user_id, body, created_at")
        .maybeSingle()

    if (messageError || !insertedMessage) {
        console.error("Error sending internal chat message:", {
            error: messageError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
        return failure<InternalChatMessage>("Falha ao enviar mensagem no chat.")
    }

    let messageAttachments: InternalChatAttachment[] = []
    if (sanitizedAttachments.length > 0) {
        const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
            .from("internal_chat_message_attachments")
            .insert(
                sanitizedAttachments.map((attachment) => ({
                    message_id: insertedMessage.id,
                    conversation_id: sanitizedConversationId,
                    uploaded_by_user_id: user.id,
                    storage_path: attachment.path,
                    original_name: attachment.original_name,
                    content_type: attachment.content_type,
                    size_bytes: attachment.size_bytes,
                    retention_policy: attachment.retention_policy,
                }))
            )
            .select(`
                id,
                message_id,
                conversation_id,
                uploaded_by_user_id,
                storage_path,
                original_name,
                content_type,
                size_bytes,
                retention_policy,
                first_downloaded_at,
                expires_at,
                download_count,
                created_at
            `)

        if (attachmentError) {
            console.error("Error linking internal chat attachments to message:", {
                error: attachmentError,
                conversationId: sanitizedConversationId,
                userId: user.id,
                messageId: insertedMessage.id,
                attachmentsCount: sanitizedAttachments.length,
            })
        } else {
            messageAttachments = ((attachmentRows ?? []) as MessageAttachmentRow[]).map((row) => ({
                id: row.id,
                message_id: row.message_id,
                conversation_id: row.conversation_id,
                uploaded_by_user_id: row.uploaded_by_user_id,
                storage_path: row.storage_path,
                original_name: row.original_name,
                content_type: row.content_type ?? null,
                size_bytes: row.size_bytes,
                retention_policy: row.retention_policy,
                first_downloaded_at: row.first_downloaded_at ?? null,
                expires_at: row.expires_at ?? null,
                download_count: row.download_count ?? 0,
                created_at: row.created_at,
            }))
        }
    }

    const { data: recipientRows, error: recipientError } = await supabaseAdmin
        .from("internal_chat_participants")
        .select("user_id")
        .eq("conversation_id", sanitizedConversationId)
        .neq("user_id", user.id)

    if (recipientError) {
        console.error("Error loading recipients for internal chat notification:", {
            error: recipientError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
    } else {
        await Promise.all(
            ((recipientRows ?? []) as RecipientRow[]).map((row) =>
                createChatMessageNotification({
                    conversationId: sanitizedConversationId,
                    senderUserId: user.id,
                    recipientUserId: row.user_id,
                    body: messageBody,
                    messageId: insertedMessage.id,
                })
            )
        )
    }

    revalidatePath("/admin/chat")
    revalidatePath("/admin/notificacoes")

    return success({
        id: insertedMessage.id,
        conversation_id: insertedMessage.conversation_id,
        sender_user_id: insertedMessage.sender_user_id,
        body: insertedMessage.body,
        created_at: insertedMessage.created_at,
        sender: {
            id: user.id,
            name: currentUser.name ?? null,
            email: currentUser.email ?? null,
        },
        attachments: messageAttachments,
    } satisfies InternalChatMessage)
}

export async function getAttachmentDownloadUrl(attachmentId: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<{ url: string }>(session.error)
    }

    const { supabaseAdmin, user } = session
    const sanitizedAttachmentId = attachmentId.trim()
    if (!sanitizedAttachmentId) {
        return failure<{ url: string }>("Anexo inválido.")
    }

    await cleanupExpiredChatAttachments(supabaseAdmin)

    const payload = await loadAttachmentWithMessageContext(supabaseAdmin, sanitizedAttachmentId)
    if (!payload) {
        return failure<{ url: string }>("Anexo não encontrado.")
    }

    const { attachment, message } = payload
    if (attachment.conversation_id !== message.conversation_id) {
        return failure<{ url: string }>("Anexo inconsistente.")
    }

    const hasAccess = await ensureParticipant(supabaseAdmin, attachment.conversation_id, user.id)
    if (!hasAccess) {
        return failure<{ url: string }>("Você não tem acesso a este anexo.")
    }

    if (isAttachmentExpired(attachment.expires_at)) {
        await cleanupExpiredChatAttachments(supabaseAdmin, {
            conversationId: attachment.conversation_id,
            batchSize: INTERNAL_CHAT_ATTACHMENTS_CLEANUP_BATCH_SIZE,
        })
        return failure<{ url: string }>("Este anexo expirou e foi removido.")
    }

    const signedUrlResult = await supabaseAdmin.storage
        .from(INTERNAL_CHAT_ATTACHMENTS_BUCKET)
        .createSignedUrl(
            attachment.storage_path,
            INTERNAL_CHAT_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
            { download: attachment.original_name }
        )

    if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
        return failure<{ url: string }>(signedUrlResult.error?.message ?? "Falha ao gerar link de download.")
    }

    const now = new Date()
    const updatePayload: {
        download_count: number
        first_downloaded_at?: string
        expires_at?: string | null
    } = {
        download_count: Math.max(attachment.download_count, 0) + 1,
    }

    if (!attachment.first_downloaded_at) {
        updatePayload.first_downloaded_at = now.toISOString()
        updatePayload.expires_at = getAttachmentExpiryFromPolicy(attachment.retention_policy, now)
    }

    const { error: updateError } = await supabaseAdmin
        .from("internal_chat_message_attachments")
        .update(updatePayload)
        .eq("id", attachment.id)

    if (updateError) {
        console.error("Error updating internal chat attachment download metadata:", {
            error: updateError,
            attachmentId: attachment.id,
        })
    }

    return success({
        url: signedUrlResult.data.signedUrl,
    })
}

export async function deleteMessageAttachment(attachmentId: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<true>(session.error)
    }

    const { supabaseAdmin, user, currentUser } = session
    const sanitizedAttachmentId = attachmentId.trim()
    if (!sanitizedAttachmentId) {
        return failure<true>("Anexo inválido.")
    }

    const payload = await loadAttachmentWithMessageContext(supabaseAdmin, sanitizedAttachmentId)
    if (!payload) {
        return failure<true>("Anexo não encontrado.")
    }

    const { attachment, message } = payload
    if (attachment.conversation_id !== message.conversation_id) {
        return failure<true>("Anexo inconsistente.")
    }

    const hasAccess = await ensureParticipant(supabaseAdmin, attachment.conversation_id, user.id)
    if (!hasAccess) {
        return failure<true>("Você não tem acesso a este anexo.")
    }

    const isAdminMaster = (currentUser.role ?? "").trim() === "adm_mestre"
    const canDelete = isAdminMaster
        || message.sender_user_id === user.id
        || attachment.uploaded_by_user_id === user.id

    if (!canDelete) {
        return failure<true>("Você não pode apagar este anexo.")
    }

    const { error: storageError } = await supabaseAdmin.storage
        .from(INTERNAL_CHAT_ATTACHMENTS_BUCKET)
        .remove([attachment.storage_path])

    if (storageError) {
        console.error("Error deleting internal chat attachment storage object:", {
            error: storageError,
            attachmentId: attachment.id,
            path: attachment.storage_path,
        })
    }

    const { error: deleteError } = await supabaseAdmin
        .from("internal_chat_message_attachments")
        .delete()
        .eq("id", attachment.id)

    if (deleteError) {
        console.error("Error deleting internal chat attachment row:", {
            error: deleteError,
            attachmentId: attachment.id,
        })
        return failure<true>("Falha ao apagar anexo.")
    }

    revalidatePath("/admin/chat")
    return success(true as const)
}

export async function markConversationAsRead(conversationId: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<true>(session.error)
    }

    const { supabaseAdmin, user } = session
    const sanitizedConversationId = conversationId.trim()

    if (!sanitizedConversationId) {
        return failure<true>("Conversa inválida.")
    }

    const hasAccess = await ensureParticipant(supabaseAdmin, sanitizedConversationId, user.id)
    if (!hasAccess) {
        return failure<true>("Você não tem acesso a esta conversa.")
    }

    const nowIso = new Date().toISOString()

    const { error: readError } = await supabaseAdmin
        .from("internal_chat_participants")
        .update({
            unread_count: 0,
            last_read_at: nowIso,
        })
        .eq("conversation_id", sanitizedConversationId)
        .eq("user_id", user.id)

    if (readError) {
        console.error("Error marking internal chat as read:", {
            error: readError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
        return failure<true>("Falha ao atualizar leitura da conversa.")
    }

    const { error: notificationReadError } = await supabaseAdmin
        .from("notifications")
        .update({
            is_read: true,
            read_at: nowIso,
        })
        .eq("recipient_user_id", user.id)
        .eq("type", "INTERNAL_CHAT_MESSAGE")
        .eq("is_read", false)
        .filter("metadata->>conversation_id", "eq", sanitizedConversationId)

    if (notificationReadError) {
        console.error("Error marking internal chat notifications as read:", {
            error: notificationReadError,
            conversationId: sanitizedConversationId,
            userId: user.id,
        })
    }

    revalidatePath("/admin/chat")
    revalidatePath("/admin/notificacoes")

    return success(true as const)
}

export async function listChatUsers(search?: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<InternalChatUser[]>(session.error)
    }

    const { supabaseAdmin, user } = session
    const searchTerm = sanitizeSearchTerm(search)

    let query = supabaseAdmin
        .from("users")
        .select("id, name, email, role, department, status, internal_chat_access")
        .neq("id", user.id)
        .order("name", { ascending: true })
        .limit(30)

    if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
    }

    let { data, error } = await query

    if (error && isMissingInternalChatAccessColumnError(error)) {
        let fallbackQuery = supabaseAdmin
            .from("users")
            .select("id, name, email, role, department, status")
            .neq("id", user.id)
            .order("name", { ascending: true })
            .limit(30)

        if (searchTerm) {
            fallbackQuery = fallbackQuery.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        }

        const fallback = await fallbackQuery
        data = fallback.data as typeof data
        error = fallback.error as typeof error
    }

    if (error) {
        console.error("Error listing internal chat users:", {
            error,
            userId: user.id,
        })
        return failure<InternalChatUser[]>("Falha ao carregar usuários do chat.")
    }

    const users = ((data ?? []) as ChatUsersLookupRow[])
        .filter((row) => !isInactiveStatus(row.status))
        .filter((row) => hasInternalChatAccess(row))
        .map((row) => ({
            id: row.id,
            name: row.name ?? null,
            email: row.email ?? null,
        })) satisfies InternalChatUser[]

    return success(users)
}

export async function getMyUnreadChatCount() {
    const session = await requireChatSession()
    if ("error" in session) {
        return 0
    }

    const { supabaseAdmin, user } = session

    const { data, error } = await supabaseAdmin
        .from("internal_chat_participants")
        .select("unread_count")
        .eq("user_id", user.id)

    if (error) {
        console.error("Error counting unread internal chat messages:", {
            error,
            userId: user.id,
        })
        return 0
    }

    return ((data ?? []) as UnreadCountRow[]).reduce((sum, row) => {
        const unread = typeof row.unread_count === "number" ? row.unread_count : 0
        return sum + Math.max(unread, 0)
    }, 0)
}
