"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"

export type NotificationType =
    | "TASK_COMMENT"
    | "TASK_MENTION"
    | "TASK_REPLY"
    | "TASK_SYSTEM"
    | "INTERNAL_CHAT_MESSAGE"

type NotificationReason = "ASSIGNEE" | "OBSERVER" | "REPLY" | "MENTION"

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

export interface NotificationItem {
    id: string
    recipient_user_id: string
    actor_user_id: string | null
    task_id: string | null
    task_comment_id: string | null
    type: NotificationType
    title: string
    message: string
    metadata: Record<string, unknown>
    is_read: boolean
    read_at: string | null
    created_at: string
    actor: NotificationActor | null
    task: NotificationTask | null
}

function toSingleRow<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
}

function sanitizePreview(content: string, maxLength = 180) {
    const cleaned = content.replace(/\s+/g, " ").trim()
    if (!cleaned) return ""
    if (cleaned.length <= maxLength) return cleaned
    return `${cleaned.slice(0, maxLength - 3)}...`
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

function collectReason(
    recipientMap: Map<string, Set<NotificationReason>>,
    userId: string | null | undefined,
    reason: NotificationReason
) {
    if (!userId) return

    const current = recipientMap.get(userId) ?? new Set<NotificationReason>()
    current.add(reason)
    recipientMap.set(userId, current)
}

function buildNotificationTitle(actorDisplay: string, reasons: Set<NotificationReason>) {
    if (reasons.has("MENTION")) {
        return `${actorDisplay} mencionou você em uma tarefa`
    }

    if (reasons.has("REPLY")) {
        return `${actorDisplay} respondeu seu comentário`
    }

    return `${actorDisplay} comentou em uma tarefa que você acompanha`
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
    actor: NotificationActor | NotificationActor[] | null
    task: NotificationTask | NotificationTask[] | null
}

export async function getMyNotifications(options?: {
    includeRead?: boolean
    limit?: number
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const limit = Math.min(Math.max(options?.limit ?? 120, 1), 300)

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
            actor:users!notifications_actor_user_id_fkey(id, name, email),
            task:tasks!notifications_task_id_fkey(id, title, status)
        `)
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (!options?.includeRead) {
        query = query.eq("is_read", false)
    }

    const { data, error } = await query

    if (error) {
        console.error("Error fetching notifications:", error)
        return []
    }

    return ((data ?? []) as RawNotificationRow[]).map((row) => ({
        id: row.id,
        recipient_user_id: row.recipient_user_id,
        actor_user_id: row.actor_user_id,
        task_id: row.task_id,
        task_comment_id: row.task_comment_id,
        type: row.type,
        title: row.title,
        message: row.message,
        metadata: row.metadata ?? {},
        is_read: row.is_read,
        read_at: row.read_at,
        created_at: row.created_at,
        actor: toSingleRow(row.actor),
        task: toSingleRow(row.task),
    })) as NotificationItem[]
}

export async function getUnreadNotificationsCount() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return 0

    const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("is_read", false)

    if (error) {
        console.error("Error counting unread notifications:", error)
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

    const mentionUserIds = normalizeMentionUserIds(params.mentionUserIds)

    const [taskResult, observersResult, actorResult, parentResult] = await Promise.all([
        supabaseAdmin
            .from("tasks")
            .select("id, title, assignee_id, visibility_scope")
            .eq("id", params.taskId)
            .maybeSingle(),
        supabaseAdmin
            .from("task_observers")
            .select("user_id")
            .eq("task_id", params.taskId),
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

    if (taskResult.error || !taskResult.data) {
        console.error("Error loading task for notifications:", taskResult.error)
        return
    }

    if (observersResult.error) {
        console.error("Error loading observers for notifications:", observersResult.error)
        return
    }

    if (actorResult.error) {
        console.error("Error loading actor for notifications:", actorResult.error)
    }

    if (parentResult.error) {
        console.error("Error loading parent comment for notifications:", parentResult.error)
    }

    if (taskResult.data.visibility_scope === "RESTRICTED" && mentionUserIds.length > 0) {
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

    const recipientReasons = new Map<string, Set<NotificationReason>>()

    collectReason(recipientReasons, taskResult.data.assignee_id, "ASSIGNEE")

    ;(observersResult.data ?? []).forEach((observer) => {
        collectReason(recipientReasons, observer.user_id, "OBSERVER")
    })

    const parentAuthorId = (parentResult.data as { user_id?: string | null } | null)?.user_id ?? null
    collectReason(recipientReasons, parentAuthorId, "REPLY")

    mentionUserIds.forEach((mentionedUserId) => {
        collectReason(recipientReasons, mentionedUserId, "MENTION")
    })

    recipientReasons.delete(params.actorUserId)

    if (recipientReasons.size === 0) {
        return
    }

    const actor = actorResult.data as { id: string; name: string | null; email: string | null } | null
    const actorDisplay = actor?.name?.trim() || actor?.email || "Alguém"
    const taskTitle = (taskResult.data.title ?? "Tarefa sem título").trim() || "Tarefa sem título"
    const preview = sanitizePreview(params.content)

    const payload = Array.from(recipientReasons.entries()).map(([recipientUserId, reasons]) => ({
        recipient_user_id: recipientUserId,
        actor_user_id: params.actorUserId,
        task_id: params.taskId,
        task_comment_id: params.commentId,
        type: reasons.has("MENTION")
            ? "TASK_MENTION"
            : reasons.has("REPLY")
                ? "TASK_REPLY"
                : "TASK_COMMENT",
        title: buildNotificationTitle(actorDisplay, reasons),
        message: preview ? `Tarefa: ${taskTitle} • ${preview}` : `Tarefa: ${taskTitle}`,
        metadata: {
            reasons: Array.from(reasons),
            task_title: taskTitle,
            parent_comment_id: params.parentCommentId ?? null,
        },
    }))

    const { error: insertError } = await supabaseAdmin
        .from("notifications")
        .upsert(payload, { onConflict: "recipient_user_id,task_comment_id" })

    if (insertError) {
        console.error("Error creating notifications from task comment:", insertError)
        return
    }

    revalidatePath("/admin/notificacoes")
}
