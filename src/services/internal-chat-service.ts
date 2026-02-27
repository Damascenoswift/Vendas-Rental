"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasInternalChatAccess } from "@/lib/internal-chat-access"
import { createChatNotificationEvent } from "@/services/notification-service"

const INTERNAL_CHAT_MAX_CONVERSATIONS = 120
const INTERNAL_CHAT_MAX_MESSAGE_LENGTH = 2000
const INTERNAL_CHAT_DEFAULT_MESSAGES_LIMIT = 60
const INTERNAL_CHAT_MAX_MESSAGES_LIMIT = 200

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

type BasicUserRow = {
    id: string
    name: string | null
    email: string | null
}

type RecipientRow = {
    user_id: string
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

export async function sendMessage(conversationId: string, body: string) {
    const session = await requireChatSession()
    if ("error" in session) {
        return failure<InternalChatMessage>(session.error)
    }

    const { supabaseAdmin, user, currentUser } = session
    const sanitizedConversationId = conversationId.trim()

    if (!sanitizedConversationId) {
        return failure<InternalChatMessage>("Conversa inválida.")
    }

    const sanitizedBody = sanitizeMessageBody(body)
    if (!sanitizedBody) {
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
            body: sanitizedBody,
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
                    body: sanitizedBody,
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
    } satisfies InternalChatMessage)
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
