"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import {
    Loader2,
    MessageSquareText,
    Plus,
    RefreshCcw,
    Send,
    TriangleAlert,
    UserRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useDebounce } from "@/hooks/use-debounce"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
    getConversationMessages,
    getOrCreateDirectConversation,
    listChatUsers,
    listMyConversations,
    markConversationAsRead,
    sendMessage,
    type InternalChatConversationListItem,
    type InternalChatMessage,
    type InternalChatUser,
} from "@/services/internal-chat-service"

type InternalChatInboxProps = {
    currentUserId: string
    initialConversations: InternalChatConversationListItem[]
    initialConversationId?: string
    initialLoadError?: string | null
}

function formatRelativeDate(value: string | null | undefined) {
    if (!value) return ""

    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value))
    } catch {
        return ""
    }
}

function formatMessageTime(value: string | null | undefined) {
    if (!value) return ""

    try {
        return new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value))
    } catch {
        return ""
    }
}

function getUserLabel(user: InternalChatUser | null | undefined) {
    if (!user) return "Usuário"
    return user.name?.trim() || user.email?.trim() || "Usuário"
}

export function InternalChatInbox({
    currentUserId,
    initialConversations,
    initialConversationId,
    initialLoadError,
}: InternalChatInboxProps) {
    const { showToast } = useToast()

    const [conversations, setConversations] = useState<InternalChatConversationListItem[]>(initialConversations)
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
        initialConversationId
        ?? initialConversations.find((conversation) => conversation.unread_count > 0)?.id
        ?? initialConversations[0]?.id
        ?? null
    )
    const [messages, setMessages] = useState<InternalChatMessage[]>([])
    const [draft, setDraft] = useState("")

    const [conversationSearch, setConversationSearch] = useState("")
    const [isLoadingConversations, setIsLoadingConversations] = useState(false)
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [isSending, setIsSending] = useState(false)

    const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)
    const [userSearch, setUserSearch] = useState("")
    const [availableUsers, setAvailableUsers] = useState<InternalChatUser[]>([])
    const [isLoadingUsers, setIsLoadingUsers] = useState(false)
    const [creatingConversationUserId, setCreatingConversationUserId] = useState<string | null>(null)

    const [participantsRealtimeAvailable, setParticipantsRealtimeAvailable] = useState(true)
    const [messagesRealtimeAvailable, setMessagesRealtimeAvailable] = useState(true)

    const debouncedConversationSearch = useDebounce(conversationSearch, 300)
    const debouncedUserSearch = useDebounce(userSearch, 250)
    const selectedConversationIdRef = useRef<string | null>(selectedConversationId)
    const conversationSearchRef = useRef("")
    const messagesEndRef = useRef<HTMLDivElement | null>(null)

    const selectedConversation = useMemo(
        () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
        [conversations, selectedConversationId]
    )

    const totalUnread = useMemo(
        () => conversations.reduce((sum, conversation) => sum + Math.max(conversation.unread_count, 0), 0),
        [conversations]
    )

    const isRealtimeHealthy = participantsRealtimeAvailable && (
        selectedConversationId ? messagesRealtimeAvailable : true
    )

    useEffect(() => {
        selectedConversationIdRef.current = selectedConversationId
    }, [selectedConversationId])

    useEffect(() => {
        conversationSearchRef.current = debouncedConversationSearch
    }, [debouncedConversationSearch])

    useEffect(() => {
        if (!initialLoadError) return
        showToast({
            variant: "error",
            title: "Falha ao carregar chat",
            description: initialLoadError,
        })
    }, [initialLoadError, showToast])

    const loadConversations = useCallback(
        async (options?: { preserveSelection?: boolean; search?: string; silent?: boolean }) => {
            setIsLoadingConversations(true)
            const result = await listMyConversations(options?.search)
            setIsLoadingConversations(false)

            if (!result.success) {
                if (!options?.silent) {
                    showToast({
                        variant: "error",
                        title: "Falha ao carregar conversas",
                        description: result.error,
                    })
                }
                return
            }

            setConversations(result.data)

            setSelectedConversationId((previousSelectedId) => {
                const preferredId = options?.preserveSelection
                    ? previousSelectedId ?? selectedConversationIdRef.current
                    : null

                if (preferredId && result.data.some((conversation) => conversation.id === preferredId)) {
                    return preferredId
                }

                if (initialConversationId && result.data.some((conversation) => conversation.id === initialConversationId)) {
                    return initialConversationId
                }

                return result.data[0]?.id ?? null
            })
        },
        [initialConversationId, showToast]
    )

    const loadMessages = useCallback(
        async (conversationId: string, options?: { silent?: boolean }) => {
            setIsLoadingMessages(true)
            const result = await getConversationMessages(conversationId, 120)
            setIsLoadingMessages(false)

            if (!result.success) {
                if (!options?.silent) {
                    showToast({
                        variant: "error",
                        title: "Falha ao carregar mensagens",
                        description: result.error,
                    })
                }
                return
            }

            setMessages(result.data.messages)
        },
        [showToast]
    )

    const markSelectedConversationAsRead = useCallback(
        async (conversationId: string) => {
            setConversations((prev) =>
                prev.map((conversation) =>
                    conversation.id === conversationId
                        ? { ...conversation, unread_count: 0 }
                        : conversation
                )
            )

            const result = await markConversationAsRead(conversationId)
            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Falha ao marcar leitura",
                    description: result.error,
                })
            }
        },
        [showToast]
    )

    const loadAvailableUsers = useCallback(
        async (searchTerm: string, options?: { silent?: boolean }) => {
            setIsLoadingUsers(true)
            const result = await listChatUsers(searchTerm)
            setIsLoadingUsers(false)

            if (!result.success) {
                if (!options?.silent) {
                    showToast({
                        variant: "error",
                        title: "Falha ao carregar funcionários",
                        description: result.error,
                    })
                }
                return
            }

            setAvailableUsers(result.data)
        },
        [showToast]
    )

    const refreshCurrentView = useCallback(async () => {
        await loadConversations({
            preserveSelection: true,
            search: conversationSearchRef.current,
            silent: true,
        })

        const activeConversationId = selectedConversationIdRef.current
        if (activeConversationId) {
            await loadMessages(activeConversationId, { silent: true })
        }
    }, [loadConversations, loadMessages])

    useEffect(() => {
        void loadConversations({
            preserveSelection: true,
            search: debouncedConversationSearch,
            silent: true,
        })
    }, [debouncedConversationSearch, loadConversations])

    useEffect(() => {
        if (!selectedConversationId) {
            setMessages([])
            return
        }

        void loadMessages(selectedConversationId, { silent: true })
        void markSelectedConversationAsRead(selectedConversationId)
    }, [loadMessages, markSelectedConversationAsRead, selectedConversationId])

    useEffect(() => {
        if (!isNewConversationOpen) return
        void loadAvailableUsers(debouncedUserSearch, { silent: true })
    }, [debouncedUserSearch, isNewConversationOpen, loadAvailableUsers])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, selectedConversationId])

    useEffect(() => {
        const participantsChannel = supabase
            .channel(`internal-chat-participants-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "internal_chat_participants",
                    filter: `user_id=eq.${currentUserId}`,
                },
                () => {
                    void loadConversations({
                        preserveSelection: true,
                        search: conversationSearchRef.current,
                        silent: true,
                    })
                }
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    setParticipantsRealtimeAvailable(true)
                    return
                }

                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setParticipantsRealtimeAvailable(false)
                }
            })

        return () => {
            void supabase.removeChannel(participantsChannel)
        }
    }, [currentUserId, loadConversations])

    useEffect(() => {
        if (!selectedConversationId) {
            setMessagesRealtimeAvailable(true)
            return
        }

        const conversationId = selectedConversationId
        const messagesChannel = supabase
            .channel(`internal-chat-messages-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "internal_chat_messages",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                () => {
                    const activeConversationId = selectedConversationIdRef.current
                    if (!activeConversationId) return

                    void loadMessages(activeConversationId, { silent: true })
                    void loadConversations({
                        preserveSelection: true,
                        search: conversationSearchRef.current,
                        silent: true,
                    })
                }
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    setMessagesRealtimeAvailable(true)
                    return
                }

                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setMessagesRealtimeAvailable(false)
                }
            })

        return () => {
            void supabase.removeChannel(messagesChannel)
        }
    }, [loadConversations, loadMessages, selectedConversationId])

    const handleStartConversation = useCallback(
        async (otherUserId: string) => {
            if (creatingConversationUserId) return
            setCreatingConversationUserId(otherUserId)

            const result = await getOrCreateDirectConversation(otherUserId)
            setCreatingConversationUserId(null)

            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Falha ao abrir conversa",
                    description: result.error,
                })
                return
            }

            setConversationSearch("")
            conversationSearchRef.current = ""
            await loadConversations({
                preserveSelection: true,
                search: "",
                silent: true,
            })
            setSelectedConversationId(result.data)
            setIsNewConversationOpen(false)
            setUserSearch("")
            setAvailableUsers([])
        },
        [creatingConversationUserId, loadConversations, showToast]
    )

    const handleSendMessage = useCallback(async () => {
        const conversationId = selectedConversationIdRef.current
        if (!conversationId || isSending) return

        const messageText = draft.trim()
        if (!messageText) return

        if (messageText.length > 2000) {
            showToast({
                variant: "error",
                title: "Mensagem muito longa",
                description: "Limite de 2.000 caracteres por mensagem.",
            })
            return
        }

        setIsSending(true)
        const result = await sendMessage(conversationId, messageText)
        setIsSending(false)

        if (!result.success) {
            showToast({
                variant: "error",
                title: "Falha ao enviar mensagem",
                description: result.error,
            })
            return
        }

        setDraft("")
        setMessages((prev) => [...prev, result.data])
        await loadConversations({
            preserveSelection: true,
            search: conversationSearchRef.current,
            silent: true,
        })
    }, [draft, isSending, loadConversations, showToast])

    const handleComposerKeyDown = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void handleSendMessage()
            }
        },
        [handleSendMessage]
    )

    return (
        <div className="grid min-h-[72vh] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <section className="rounded-xl border bg-white">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">Conversas</h2>
                        <Badge variant="secondary">{totalUnread} não lidas</Badge>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant={isNewConversationOpen ? "outline" : "default"}
                        onClick={() => setIsNewConversationOpen((prev) => !prev)}
                    >
                        <Plus className="mr-1 h-4 w-4" />
                        Nova
                    </Button>
                </div>

                <div className="border-b px-4 py-3">
                    <Input
                        value={conversationSearch}
                        onChange={(event) => setConversationSearch(event.target.value)}
                        placeholder="Buscar conversa..."
                    />
                </div>

                {isNewConversationOpen && (
                    <div className="space-y-2 border-b bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Iniciar conversa
                        </p>
                        <Input
                            value={userSearch}
                            onChange={(event) => setUserSearch(event.target.value)}
                            placeholder="Buscar funcionário..."
                        />
                        <ScrollArea className="h-32 rounded-md border bg-white">
                            <div className="space-y-1 p-2">
                                {isLoadingUsers && (
                                    <p className="text-xs text-muted-foreground">Carregando usuários...</p>
                                )}

                                {!isLoadingUsers && availableUsers.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Nenhum usuário encontrado.
                                    </p>
                                )}

                                {availableUsers.map((user) => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                                        onClick={() => void handleStartConversation(user.id)}
                                        disabled={creatingConversationUserId === user.id}
                                    >
                                        <div>
                                            <p className="font-medium text-slate-900">{getUserLabel(user)}</p>
                                            {user.email && (
                                                <p className="text-xs text-muted-foreground">{user.email}</p>
                                            )}
                                        </div>
                                        {creatingConversationUserId === user.id && (
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                <ScrollArea className="h-[56vh]">
                    <div className="space-y-1 p-2">
                        {conversations.map((conversation) => {
                            const isActive = conversation.id === selectedConversationId
                            const previewBody = conversation.last_message?.body?.trim() ?? ""
                            const preview = previewBody
                                ? `${conversation.last_message?.sender_user_id === currentUserId ? "Você: " : ""}${previewBody}`
                                : "Sem mensagens"

                            return (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() => setSelectedConversationId(conversation.id)}
                                    className={cn(
                                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                                        isActive
                                            ? "border-primary bg-primary/5"
                                            : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-900">
                                                {getUserLabel(conversation.other_user)}
                                            </p>
                                            {conversation.other_user.email && (
                                                <p className="truncate text-[11px] text-muted-foreground">
                                                    {conversation.other_user.email}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-end gap-1">
                                            {conversation.last_message_at && (
                                                <p className="text-[10px] text-muted-foreground">
                                                    {formatRelativeDate(conversation.last_message_at)}
                                                </p>
                                            )}
                                            {conversation.unread_count > 0 && (
                                                <Badge className="h-5 px-1.5 text-[10px]">
                                                    {conversation.unread_count}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                        {preview}
                                    </p>
                                </button>
                            )
                        })}

                        {!isLoadingConversations && conversations.length === 0 && (
                            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                                Nenhuma conversa encontrada.
                            </p>
                        )}

                        {isLoadingConversations && (
                            <p className="text-center text-xs text-muted-foreground">
                                Atualizando conversas...
                            </p>
                        )}
                    </div>
                </ScrollArea>
            </section>

            <section className="rounded-xl border bg-white">
                {!selectedConversation ? (
                    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                        <MessageSquareText className="h-8 w-8 text-muted-foreground/70" />
                        <p>Selecione uma conversa para iniciar o atendimento interno.</p>
                    </div>
                ) : (
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between px-5 py-4">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                    {getUserLabel(selectedConversation.other_user)}
                                </p>
                                {selectedConversation.other_user.email && (
                                    <p className="truncate text-xs text-muted-foreground">
                                        {selectedConversation.other_user.email}
                                    </p>
                                )}
                            </div>

                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void refreshCurrentView()}
                                disabled={isLoadingMessages || isLoadingConversations}
                            >
                                <RefreshCcw className="mr-1 h-4 w-4" />
                                Atualizar
                            </Button>
                        </div>

                        {!isRealtimeHealthy && (
                            <div className="mx-5 mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <div className="flex items-center gap-2">
                                    <TriangleAlert className="h-4 w-4" />
                                    <span>Realtime indisponível no momento. Use Atualizar para sincronizar.</span>
                                </div>
                            </div>
                        )}

                        <Separator />

                        <ScrollArea className="h-[52vh] bg-slate-50/40 px-4 py-4">
                            <div className="space-y-3">
                                {isLoadingMessages && (
                                    <p className="text-center text-xs text-muted-foreground">
                                        Carregando mensagens...
                                    </p>
                                )}

                                {!isLoadingMessages && messages.length === 0 && (
                                    <div className="rounded-md border border-dashed bg-white px-4 py-8 text-center text-sm text-muted-foreground">
                                        Nenhuma mensagem nesta conversa ainda.
                                    </div>
                                )}

                                {messages.map((message) => {
                                    const isMine = message.sender_user_id === currentUserId
                                    return (
                                        <div
                                            key={message.id}
                                            className={cn("flex", isMine ? "justify-end" : "justify-start")}
                                        >
                                            <div
                                                className={cn(
                                                    "max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                                                    isMine
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-white text-slate-900 border"
                                                )}
                                            >
                                                <p className="whitespace-pre-wrap break-words">
                                                    {message.body}
                                                </p>
                                                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] opacity-80">
                                                    <span className="truncate">
                                                        {isMine ? "Você" : getUserLabel(message.sender)}
                                                    </span>
                                                    <span>{formatMessageTime(message.created_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}

                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>

                        <Separator />

                        <div className="space-y-2 p-4">
                            <Textarea
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={handleComposerKeyDown}
                                maxLength={2000}
                                rows={3}
                                placeholder="Digite sua mensagem... (Enter envia, Shift+Enter quebra linha)"
                            />

                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    {draft.length}/2000 caracteres
                                </p>

                                <Button
                                    type="button"
                                    onClick={() => void handleSendMessage()}
                                    disabled={isSending || draft.trim().length === 0}
                                >
                                    {isSending ? (
                                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-1 h-4 w-4" />
                                    )}
                                    Enviar
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {!selectedConversation && !isLoadingConversations && conversations.length > 0 && (
                    <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <UserRound className="h-3.5 w-3.5" />
                            <span>Escolha uma conversa para visualizar o histórico.</span>
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
}
