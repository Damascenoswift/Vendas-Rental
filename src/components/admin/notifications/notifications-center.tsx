"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AtSign, Bell, CheckCheck, MessageCircle, MessageSquare, Reply } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
    getMyNotifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    type NotificationItem,
} from "@/services/notification-service"

type NotificationsCenterProps = {
    currentUserId: string
    initialNotifications: NotificationItem[]
    initialSelectedId?: string | null
}

function formatRelativeDate(value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "Agora"

    return formatDistanceToNow(parsed, {
        addSuffix: true,
        locale: ptBR,
    })
}

function formatAbsoluteDate(value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""

    return format(parsed, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function getNotificationTypeLabel(type: NotificationItem["type"]) {
    if (type === "INTERNAL_CHAT_MESSAGE") return "Mensagem interna"
    if (type === "TASK_MENTION") return "Menção"
    if (type === "TASK_REPLY") return "Resposta"
    if (type === "TASK_COMMENT") return "Comentário"
    return "Sistema"
}

function NotificationTypeIcon({ type }: { type: NotificationItem["type"] }) {
    if (type === "INTERNAL_CHAT_MESSAGE") {
        return <MessageSquare className="h-4 w-4" />
    }

    if (type === "TASK_MENTION") {
        return <AtSign className="h-4 w-4" />
    }

    if (type === "TASK_REPLY") {
        return <Reply className="h-4 w-4" />
    }

    if (type === "TASK_COMMENT") {
        return <MessageCircle className="h-4 w-4" />
    }

    return <Bell className="h-4 w-4" />
}

function getMetadataString(metadata: NotificationItem["metadata"], key: string) {
    const value = metadata?.[key]
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function getNotificationTargetPath(notification: NotificationItem) {
    const metadataTarget = getMetadataString(notification.metadata, "target_path")
    if (metadataTarget?.startsWith("/")) {
        return metadataTarget
    }

    const conversationId = getMetadataString(notification.metadata, "conversation_id")
    if (notification.type === "INTERNAL_CHAT_MESSAGE" && conversationId) {
        return `/admin/chat?conversation=${conversationId}`
    }

    if (notification.task_id) {
        return `/admin/tarefas?openTask=${notification.task_id}`
    }

    return null
}

function getNotificationActionLabel(notification: NotificationItem, targetPath: string | null) {
    if (!targetPath) return "Sem destino"
    if (notification.type === "INTERNAL_CHAT_MESSAGE") return "Ir para conversa"
    if (notification.task_id) return "Ir para tarefa"
    return "Abrir"
}

export function NotificationsCenter({
    currentUserId,
    initialNotifications,
    initialSelectedId,
}: NotificationsCenterProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
    const [selectedId, setSelectedId] = useState<string | null>(
        initialSelectedId
        ?? initialNotifications.find((notification) => !notification.is_read)?.id
        ?? initialNotifications[0]?.id
        ?? null
    )
    const [showUnreadOnly, setShowUnreadOnly] = useState(false)
    const [isMarkingAll, startMarkAllTransition] = useTransition()
    const [isSelecting, startSelectTransition] = useTransition()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isRealtimeAvailable, setIsRealtimeAvailable] = useState(true)
    const { showToast } = useToast()

    useEffect(() => {
        setNotifications(initialNotifications)
    }, [initialNotifications])

    useEffect(() => {
        if (!initialSelectedId) return
        if (!notifications.some((notification) => notification.id === initialSelectedId)) return
        setSelectedId(initialSelectedId)
    }, [initialSelectedId, notifications])

    useEffect(() => {
        if (!selectedId) return
        if (notifications.some((notification) => notification.id === selectedId)) return
        setSelectedId(notifications[0]?.id ?? null)
    }, [notifications, selectedId])

    const refreshNotifications = useCallback(async () => {
        setIsRefreshing(true)
        const next = await getMyNotifications({
            includeRead: true,
            limit: 200,
        })
        setNotifications(next)
        setIsRefreshing(false)
    }, [])

    useEffect(() => {
        const channel = supabase
            .channel(`notifications-center-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "notifications",
                    filter: `recipient_user_id=eq.${currentUserId}`,
                },
                () => {
                    void refreshNotifications()
                }
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    setIsRealtimeAvailable(true)
                    return
                }

                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setIsRealtimeAvailable(false)
                }
            })

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [currentUserId, refreshNotifications])

    const unreadCount = useMemo(
        () => notifications.filter((notification) => !notification.is_read).length,
        [notifications]
    )

    const visibleNotifications = useMemo(() => {
        if (!showUnreadOnly) return notifications
        return notifications.filter((notification) => !notification.is_read)
    }, [notifications, showUnreadOnly])

    const selectedNotification = useMemo(() => {
        if (!selectedId) return visibleNotifications[0] ?? null
        return notifications.find((notification) => notification.id === selectedId) ?? null
    }, [notifications, selectedId, visibleNotifications])

    const selectedNotificationTargetPath = useMemo(
        () => (selectedNotification ? getNotificationTargetPath(selectedNotification) : null),
        [selectedNotification]
    )

    const markReadLocally = (notificationId: string) => {
        const nowIso = new Date().toISOString()
        setNotifications((prev) =>
            prev.map((notification) =>
                notification.id === notificationId
                    ? {
                        ...notification,
                        is_read: true,
                        read_at: nowIso,
                    }
                    : notification
            )
        )
    }

    const handleSelectNotification = (notification: NotificationItem) => {
        setSelectedId(notification.id)

        if (notification.is_read) return

        markReadLocally(notification.id)

        startSelectTransition(async () => {
            const result = await markNotificationAsRead(notification.id)
            if (result?.error) {
                showToast({
                    title: "Erro ao marcar notificação",
                    description: result.error,
                    variant: "error",
                })
            }
        })
    }

    const handleMarkAllAsRead = () => {
        if (unreadCount === 0) return

        const nowIso = new Date().toISOString()
        setNotifications((prev) =>
            prev.map((notification) => ({
                ...notification,
                is_read: true,
                read_at: notification.read_at ?? nowIso,
            }))
        )

        startMarkAllTransition(async () => {
            const result = await markAllNotificationsAsRead()
            if (result?.error) {
                showToast({
                    title: "Erro ao atualizar notificações",
                    description: result.error,
                    variant: "error",
                })
                return
            }

            showToast({
                title: "Notificações atualizadas",
                description: "Todas foram marcadas como lidas.",
                variant: "success",
            })

            await refreshNotifications()
        })
    }

    return (
        <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <section className="rounded-xl border bg-white">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">Caixa de entrada</h2>
                        <Badge variant="secondary">{unreadCount} não lidas</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isRefreshing}
                            onClick={() => void refreshNotifications()}
                        >
                            Atualizar
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={unreadCount === 0 || isMarkingAll}
                            onClick={handleMarkAllAsRead}
                        >
                            <CheckCheck className="mr-1 h-4 w-4" />
                            Marcar tudo
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-b px-4 py-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={showUnreadOnly ? "outline" : "default"}
                        onClick={() => setShowUnreadOnly(false)}
                    >
                        Todas
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={showUnreadOnly ? "default" : "outline"}
                        onClick={() => setShowUnreadOnly(true)}
                    >
                        Não lidas
                    </Button>
                </div>

                {!isRealtimeAvailable && (
                    <p className="border-b px-4 py-2 text-xs text-amber-700">
                        Atualização em tempo real indisponível. Use o botão Atualizar.
                    </p>
                )}

                <ScrollArea className="h-[58vh]">
                    <div className="space-y-1 p-2">
                        {visibleNotifications.map((notification) => {
                            const isActive = notification.id === selectedNotification?.id

                            return (
                                <button
                                    key={notification.id}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                                        isActive
                                            ? "border-primary bg-primary/5"
                                            : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                                        !notification.is_read && "bg-blue-50/50"
                                    )}
                                    onClick={() => handleSelectNotification(notification)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="rounded-md bg-slate-100 p-1 text-slate-700">
                                                <NotificationTypeIcon type={notification.type} />
                                            </span>
                                            <p className="truncate text-xs font-medium text-slate-800">
                                                {notification.title}
                                            </p>
                                        </div>
                                        {!notification.is_read && (
                                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                                        )}
                                    </div>

                                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                        {notification.message}
                                    </p>

                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                        {formatRelativeDate(notification.created_at)}
                                    </p>
                                </button>
                            )
                        })}

                        {visibleNotifications.length === 0 && (
                            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                                Nenhuma notificação encontrada.
                            </p>
                        )}
                    </div>
                </ScrollArea>
            </section>

            <section className="rounded-xl border bg-white">
                {!selectedNotification ? (
                    <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        Selecione uma notificação para ver os detalhes.
                    </div>
                ) : (
                    <div className="flex h-full flex-col">
                        <div className="space-y-3 px-6 py-5">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{getNotificationTypeLabel(selectedNotification.type)}</Badge>
                                <Badge variant={selectedNotification.is_read ? "secondary" : "default"}>
                                    {selectedNotification.is_read ? "Lida" : "Não lida"}
                                </Badge>
                            </div>

                            <h3 className="text-lg font-semibold text-slate-900">
                                {selectedNotification.title}
                            </h3>

                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                                {selectedNotification.message}
                            </p>

                            <div className="text-xs text-muted-foreground">
                                <p>{formatAbsoluteDate(selectedNotification.created_at)}</p>
                                {selectedNotification.actor && (
                                    <p>
                                        Por {selectedNotification.actor.name || selectedNotification.actor.email || "Usuário"}
                                    </p>
                                )}
                                {selectedNotification.task?.title && (
                                    <p>Tarefa: {selectedNotification.task.title}</p>
                                )}
                            </div>
                        </div>

                        <Separator />

                        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
                            {selectedNotificationTargetPath ? (
                                <Button asChild>
                                    <Link href={selectedNotificationTargetPath}>
                                        {getNotificationActionLabel(selectedNotification, selectedNotificationTargetPath)}
                                    </Link>
                                </Button>
                            ) : (
                                <Button type="button" variant="outline" disabled>
                                    Sem vínculo de destino
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {isSelecting && (
                    <p className="px-6 pb-4 text-xs text-muted-foreground">
                        Atualizando status de leitura...
                    </p>
                )}
            </section>
        </div>
    )
}
