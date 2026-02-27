"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
    AtSign,
    Bell,
    CheckCheck,
    MessageCircle,
    MessageSquare,
    Reply,
    Wrench,
    Building2,
    BriefcaseBusiness,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
    getMyNotifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
    type NotificationDomain,
    type NotificationItem,
    type NotificationRuleItem,
    upsertDefaultRule,
    upsertMyNotificationRule,
} from "@/services/notification-service"

type DomainFilter = "ALL" | NotificationDomain

type NotificationsCenterProps = {
    currentUserId: string
    initialNotifications: NotificationItem[]
    initialSelectedId?: string | null
    initialRules: NotificationRuleItem[]
    userSector: string | null
    canManageDefaults: boolean
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

function getDomainLabel(domain: NotificationDomain) {
    if (domain === "TASK") return "Tarefas"
    if (domain === "INDICACAO") return "Indicações"
    if (domain === "OBRA") return "Obras"
    if (domain === "CHAT") return "Chat"
    return "Sistema"
}

function getNotificationTypeLabel(notification: NotificationItem) {
    if (notification.domain === "CHAT") return "Mensagem interna"
    if (notification.event_key === "TASK_COMMENT_MENTION") return "Menção"
    if (notification.event_key === "TASK_COMMENT_REPLY") return "Resposta"
    if (notification.event_key === "TASK_COMMENT_CREATED") return "Comentário"
    if (notification.domain === "INDICACAO") return "Movimentação da indicação"
    if (notification.domain === "OBRA") return "Movimentação da obra"
    return "Sistema"
}

function NotificationDomainIcon({ notification }: { notification: NotificationItem }) {
    if (notification.domain === "CHAT") {
        return <MessageSquare className="h-4 w-4" />
    }

    if (notification.domain === "INDICACAO") {
        return <BriefcaseBusiness className="h-4 w-4" />
    }

    if (notification.domain === "OBRA") {
        return <Building2 className="h-4 w-4" />
    }

    if (notification.event_key === "TASK_COMMENT_MENTION") {
        return <AtSign className="h-4 w-4" />
    }

    if (notification.event_key === "TASK_COMMENT_REPLY") {
        return <Reply className="h-4 w-4" />
    }

    if (notification.event_key === "TASK_COMMENT_CREATED") {
        return <MessageCircle className="h-4 w-4" />
    }

    if (notification.event_key === "TASK_CHECKLIST_UPDATED" || notification.event_key === "TASK_STATUS_CHANGED") {
        return <Wrench className="h-4 w-4" />
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

    if (notification.domain === "TASK") {
        const metadataTaskId = getMetadataString(notification.metadata, "task_id")
        if (metadataTaskId) {
            return `/admin/tarefas?openTask=${metadataTaskId}`
        }

        if (notification.task_id) {
            return `/admin/tarefas?openTask=${notification.task_id}`
        }
    }

    if (notification.domain === "INDICACAO") {
        const indicationId =
            getMetadataString(notification.metadata, "indicacao_id")
            ?? notification.entity_id
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

    if (notification.domain === "CHAT") {
        const conversationId = getMetadataString(notification.metadata, "conversation_id")
        if (conversationId) {
            return `/admin/chat?conversation=${conversationId}`
        }
    }

    return null
}

function getNotificationActionLabel(notification: NotificationItem, targetPath: string | null) {
    if (!targetPath) return "Sem destino"
    if (notification.domain === "CHAT") return "Ir para conversa"
    if (notification.domain === "TASK") return "Ir para tarefa"
    if (notification.domain === "INDICACAO") return "Ir para indicação"
    if (notification.domain === "OBRA") return "Ir para obra"
    return "Abrir"
}

function getResponsibilityLabel(kind: NotificationRuleItem["responsibilityKind"]) {
    if (kind === "ASSIGNEE") return "Responsável"
    if (kind === "OBSERVER") return "Observador"
    if (kind === "CREATOR") return "Criador"
    if (kind === "MENTION") return "Menção"
    if (kind === "REPLY_TARGET") return "Resposta"
    if (kind === "OWNER") return "Dono da indicação"
    if (kind === "SECTOR_MEMBER") return "Membro do setor"
    if (kind === "LINKED_TASK_PARTICIPANT") return "Participante de tarefa"
    if (kind === "DIRECT") return "Direto"
    return "Sistema"
}

export function NotificationsCenter({
    currentUserId,
    initialNotifications,
    initialSelectedId,
    initialRules,
    userSector,
    canManageDefaults,
}: NotificationsCenterProps) {
    const [activeTab, setActiveTab] = useState<"inbox" | "preferences">("inbox")
    const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
    const [rules, setRules] = useState<NotificationRuleItem[]>(initialRules)
    const [selectedId, setSelectedId] = useState<string | null>(
        initialSelectedId
        ?? initialNotifications.find((notification) => !notification.is_read)?.id
        ?? initialNotifications[0]?.id
        ?? null
    )
    const [showUnreadOnly, setShowUnreadOnly] = useState(false)
    const [domainFilter, setDomainFilter] = useState<DomainFilter>("ALL")
    const [isMarkingAll, startMarkAllTransition] = useTransition()
    const [isSelecting, startSelectTransition] = useTransition()
    const [isUpdatingRule, startRuleUpdateTransition] = useTransition()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isRealtimeAvailable, setIsRealtimeAvailable] = useState(true)
    const [savingRuleKey, setSavingRuleKey] = useState<string | null>(null)
    const [savingDefaultRuleKey, setSavingDefaultRuleKey] = useState<string | null>(null)
    const { showToast } = useToast()

    useEffect(() => {
        setNotifications(initialNotifications)
    }, [initialNotifications])

    useEffect(() => {
        setRules(initialRules)
    }, [initialRules])

    useEffect(() => {
        if (!initialSelectedId) return
        if (!notifications.some((notification) => notification.id === initialSelectedId)) return
        setSelectedId(initialSelectedId)
    }, [initialSelectedId, notifications])

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

    const domainCounts = useMemo(() => {
        const counts: Record<DomainFilter, number> = {
            ALL: notifications.length,
            TASK: 0,
            INDICACAO: 0,
            OBRA: 0,
            CHAT: 0,
            SYSTEM: 0,
        }

        notifications.forEach((notification) => {
            if (notification.domain in counts) {
                counts[notification.domain as DomainFilter] += 1
            }
        })

        return counts
    }, [notifications])

    const unreadCount = useMemo(
        () => notifications.filter((notification) => !notification.is_read).length,
        [notifications]
    )

    const visibleNotifications = useMemo(() => {
        return notifications.filter((notification) => {
            if (showUnreadOnly && notification.is_read) return false
            if (domainFilter !== "ALL" && notification.domain !== domainFilter) return false
            return true
        })
    }, [notifications, showUnreadOnly, domainFilter])

    useEffect(() => {
        if (!selectedId) {
            setSelectedId(visibleNotifications[0]?.id ?? null)
            return
        }

        if (visibleNotifications.some((notification) => notification.id === selectedId)) return
        setSelectedId(visibleNotifications[0]?.id ?? null)
    }, [visibleNotifications, selectedId])

    const selectedNotification = useMemo(() => {
        if (!selectedId) return visibleNotifications[0] ?? null
        return visibleNotifications.find((notification) => notification.id === selectedId) ?? visibleNotifications[0] ?? null
    }, [selectedId, visibleNotifications])

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

    const groupedRules = useMemo(() => {
        const map = new Map<string, {
            eventKey: string
            eventLabel: string
            domain: NotificationDomain
            items: NotificationRuleItem[]
        }>()

        rules.forEach((rule) => {
            const current = map.get(rule.eventKey)
            if (current) {
                current.items.push(rule)
                return
            }

            map.set(rule.eventKey, {
                eventKey: rule.eventKey,
                eventLabel: rule.eventLabel,
                domain: rule.domain,
                items: [rule],
            })
        })

        return Array.from(map.values())
            .map((group) => ({
                ...group,
                items: group.items
                    .slice()
                    .sort((a, b) => getResponsibilityLabel(a.responsibilityKind).localeCompare(getResponsibilityLabel(b.responsibilityKind))),
            }))
            .sort((a, b) => {
                if (a.domain !== b.domain) return a.domain.localeCompare(b.domain)
                return a.eventLabel.localeCompare(b.eventLabel)
            })
    }, [rules])

    const handleToggleRule = (rule: NotificationRuleItem) => {
        if (rule.isMandatory || !rule.allowUserDisable || isUpdatingRule) return

        const nextEnabled = !rule.enabled
        const ruleKey = `${rule.eventKey}::${rule.responsibilityKind}`
        setSavingRuleKey(ruleKey)

        startRuleUpdateTransition(async () => {
            const result = await upsertMyNotificationRule({
                eventKey: rule.eventKey,
                responsibilityKind: rule.responsibilityKind,
                enabled: nextEnabled,
            })

            if (result?.error) {
                showToast({
                    title: "Erro ao atualizar preferência",
                    description: result.error,
                    variant: "error",
                })
                setSavingRuleKey(null)
                return
            }

            setRules((prev) => prev.map((item) => {
                if (item.eventKey !== rule.eventKey || item.responsibilityKind !== rule.responsibilityKind) {
                    return item
                }

                return {
                    ...item,
                    enabled: nextEnabled,
                    source: "override",
                }
            }))

            showToast({
                title: "Preferência atualizada",
                description: `${rule.eventLabel} (${getResponsibilityLabel(rule.responsibilityKind)}) ${nextEnabled ? "ativada" : "desativada"}.`,
                variant: "success",
            })
            setSavingRuleKey(null)
        })
    }

    const handleToggleDefaultRule = (rule: NotificationRuleItem) => {
        if (!canManageDefaults || !userSector || rule.isMandatory || isUpdatingRule) return

        const nextDefaultEnabled = !rule.defaultEnabled
        const ruleKey = `${rule.eventKey}::${rule.responsibilityKind}`
        setSavingDefaultRuleKey(ruleKey)

        startRuleUpdateTransition(async () => {
            const result = await upsertDefaultRule({
                sector: userSector,
                eventKey: rule.eventKey,
                responsibilityKind: rule.responsibilityKind,
                enabled: nextDefaultEnabled,
            })

            if (result?.error) {
                showToast({
                    title: "Erro ao atualizar padrão",
                    description: result.error,
                    variant: "error",
                })
                setSavingDefaultRuleKey(null)
                return
            }

            setRules((prev) => prev.map((item) => {
                if (item.eventKey !== rule.eventKey || item.responsibilityKind !== rule.responsibilityKind) {
                    return item
                }

                const nextItem: NotificationRuleItem = {
                    ...item,
                    defaultEnabled: nextDefaultEnabled,
                }

                if (item.source === "default") {
                    nextItem.enabled = nextDefaultEnabled
                }

                return nextItem
            }))

            showToast({
                title: "Padrão global atualizado",
                description: `${rule.eventLabel} (${getResponsibilityLabel(rule.responsibilityKind)}) padrão ${nextDefaultEnabled ? "ativado" : "desativado"} para ${userSector}.`,
                variant: "success",
            })
            setSavingDefaultRuleKey(null)
        })
    }

    return (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "inbox" | "preferences")} className="space-y-4">
            <TabsList>
                <TabsTrigger value="inbox">Caixa de entrada</TabsTrigger>
                <TabsTrigger value="preferences">Preferências</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="m-0">
                <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
                    <section className="rounded-xl border bg-white">
                        <div className="space-y-3 border-b px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-sm font-semibold tracking-tight whitespace-nowrap">
                                    Caixa de entrada
                                </h2>
                                <Badge
                                    variant="secondary"
                                    className="whitespace-nowrap px-2.5 py-0.5 text-xs font-medium"
                                >
                                    {unreadCount} não lidas
                                </Badge>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
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

                        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
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

                        <div className="flex flex-wrap gap-2 border-b px-4 py-2">
                            {["ALL", "TASK", "INDICACAO", "OBRA", "CHAT"].map((filter) => (
                                <Button
                                    key={filter}
                                    type="button"
                                    size="sm"
                                    variant={domainFilter === filter ? "default" : "outline"}
                                    onClick={() => setDomainFilter(filter as DomainFilter)}
                                >
                                    {filter === "ALL" ? "Todos" : getDomainLabel(filter as NotificationDomain)}
                                    <span className="ml-1 text-[11px] opacity-80">
                                        ({domainCounts[filter as DomainFilter] ?? 0})
                                    </span>
                                </Button>
                            ))}
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
                                                        <NotificationDomainIcon notification={notification} />
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">{getDomainLabel(selectedNotification.domain)}</Badge>
                                        <Badge variant="outline">{getNotificationTypeLabel(selectedNotification)}</Badge>
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
            </TabsContent>

            <TabsContent value="preferences" className="m-0">
                <section className="rounded-xl border bg-white p-4">
                    <div className="mb-4 space-y-1">
                        <h2 className="text-base font-semibold">Preferências de notificação</h2>
                        <p className="text-sm text-muted-foreground">
                            {userSector
                                ? `Setor configurável: ${userSector}. Ajuste os eventos e responsabilidades que deseja receber.`
                                : "Seu setor não está configurado. Não é possível editar preferências."}
                        </p>
                        {canManageDefaults && (
                            <p className="text-xs text-muted-foreground">
                                Perfil `adm_mestre`: você também pode ajustar padrões globais via APIs de regras padrão.
                            </p>
                        )}
                    </div>

                    {groupedRules.length === 0 ? (
                        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            Nenhuma regra encontrada para o seu setor.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {groupedRules.map((group) => (
                                <div key={group.eventKey} className="rounded-lg border p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">{group.eventLabel}</p>
                                        <Badge variant="outline">{getDomainLabel(group.domain)}</Badge>
                                    </div>

                                    <div className="space-y-2">
                                        {group.items.map((rule) => {
                                            const ruleKey = `${rule.eventKey}::${rule.responsibilityKind}`
                                            const isSavingThisRule = savingRuleKey === ruleKey
                                            const isLocked = rule.isMandatory || !rule.allowUserDisable

                                            return (
                                                <div
                                                    key={ruleKey}
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                                                >
                                                    <div className="space-y-0.5">
                                                        <p className="text-sm font-medium">
                                                            {getResponsibilityLabel(rule.responsibilityKind)}
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Padrão: {rule.defaultEnabled ? "Ativado" : "Desativado"} • Fonte: {rule.source}
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={rule.enabled ? "default" : "secondary"}>
                                                            {rule.enabled ? "Ativado" : "Desativado"}
                                                        </Badge>
                                                        {canManageDefaults && userSector && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={rule.isMandatory || savingDefaultRuleKey === ruleKey || isUpdatingRule}
                                                                onClick={() => handleToggleDefaultRule(rule)}
                                                            >
                                                                {savingDefaultRuleKey === ruleKey
                                                                    ? "Salvando padrão..."
                                                                    : rule.defaultEnabled
                                                                        ? "Padrão ON"
                                                                        : "Padrão OFF"}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant={rule.enabled ? "outline" : "default"}
                                                            disabled={isLocked || isSavingThisRule || isUpdatingRule}
                                                            onClick={() => handleToggleRule(rule)}
                                                        >
                                                            {rule.isMandatory
                                                                ? "Obrigatório"
                                                                : !rule.allowUserDisable
                                                                    ? "Fixo"
                                                                    : isSavingThisRule
                                                                        ? "Salvando..."
                                                                        : rule.enabled
                                                                            ? "Desativar"
                                                                            : "Ativar"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </TabsContent>
        </Tabs>
    )
}
