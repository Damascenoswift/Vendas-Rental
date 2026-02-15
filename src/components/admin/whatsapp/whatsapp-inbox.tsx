"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Clock3, MessageCircle, RefreshCcw, Send, UserRound } from "lucide-react"

import {
  assignWhatsAppConversation,
  closeWhatsAppConversation,
  getWhatsAppConversationMessages,
  listWhatsAppConversations,
  reopenWhatsAppConversation,
  sendWhatsAppTextMessage,
  setWhatsAppConversationBrand,
  type WhatsAppAgent,
  type WhatsAppConversationListItem,
  type WhatsAppMessage,
} from "@/app/actions/whatsapp"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useDebounce } from "@/hooks/use-debounce"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

type WhatsAppInboxProps = {
  currentUserId: string
  initialAgents: WhatsAppAgent[]
}

type StatusFilter = "all" | "PENDING_BRAND" | "OPEN" | "CLOSED"
type BrandFilter = "all" | "rental" | "dorata"

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "Todos",
  PENDING_BRAND: "Pendente de marca",
  OPEN: "Aberta",
  CLOSED: "Fechada",
}

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  received: "Recebida",
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return "-"
  }
}

function isWindowOpen(windowExpiresAt: string | null) {
  if (!windowExpiresAt) return false
  const expiresAt = new Date(windowExpiresAt).getTime()
  if (Number.isNaN(expiresAt)) return false
  return expiresAt > Date.now()
}

function conversationDisplayName(conversation: WhatsAppConversationListItem) {
  return (
    conversation.contact_name ||
    conversation.customer_name ||
    conversation.contact_whatsapp ||
    conversation.customer_wa_id
  )
}

export function WhatsAppInbox({ currentUserId, initialAgents }: WhatsAppInboxProps) {
  const { showToast } = useToast()
  const selectedConversationIdRef = useRef<string | null>(null)

  const [conversations, setConversations] = useState<WhatsAppConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all")
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const [draft, setDraft] = useState("")

  const debouncedSearch = useDebounce(search, 350)

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  )

  const loadConversations = useCallback(
    async (params?: { preserveSelection?: boolean }) => {
      setLoadingConversations(true)

      const result = await listWhatsAppConversations({
        search: debouncedSearch,
        status: statusFilter,
        brand: brandFilter,
        unassignedOnly,
      })

      setLoadingConversations(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao carregar conversas",
          description: result.error || "Não foi possível listar conversas da inbox.",
        })
        return
      }

      setConversations(result.data)

      if (!params?.preserveSelection) {
        const firstConversationId = result.data[0]?.id ?? null
        setSelectedConversationId(firstConversationId)
        return
      }

      if (!selectedConversationIdRef.current) {
        setSelectedConversationId(result.data[0]?.id ?? null)
        return
      }

      const stillExists = result.data.some((item) => item.id === selectedConversationIdRef.current)
      if (!stillExists) {
        setSelectedConversationId(result.data[0]?.id ?? null)
      }
    },
    [brandFilter, debouncedSearch, showToast, statusFilter, unassignedOnly]
  )

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true)
      const result = await getWhatsAppConversationMessages(conversationId)
      setLoadingMessages(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao carregar mensagens",
          description: result.error || "Não foi possível carregar mensagens da conversa.",
        })
        return
      }

      setMessages(result.data.messages)
    },
    [showToast]
  )

  const refreshAll = useCallback(async () => {
    await loadConversations({ preserveSelection: true })

    if (selectedConversationIdRef.current) {
      await loadMessages(selectedConversationIdRef.current)
    }
  }, [loadConversations, loadMessages])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    void loadConversations({ preserveSelection: true })
  }, [loadConversations])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }

    void loadMessages(selectedConversationId)
  }, [loadMessages, selectedConversationId])

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-inbox-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          void loadConversations({ preserveSelection: true })
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as { conversation_id?: string }
          const selectedId = selectedConversationIdRef.current

          if (selectedId && row.conversation_id === selectedId) {
            void loadMessages(selectedId)
          }

          void loadConversations({ preserveSelection: true })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadConversations, loadMessages])

  const withAction = useCallback(
    async (callback: () => Promise<void>) => {
      if (actionLoading) return
      setActionLoading(true)

      try {
        await callback()
      } finally {
        setActionLoading(false)
      }
    },
    [actionLoading]
  )

  const handleAssign = useCallback(
    async (assigneeId: string | null) => {
      if (!selectedConversation) return

      await withAction(async () => {
        const result = await assignWhatsAppConversation(selectedConversation.id, assigneeId)

        if (!result.success) {
          showToast({
            variant: "error",
            title: "Falha ao atualizar responsável",
            description: result.error,
          })
          return
        }

        await loadConversations({ preserveSelection: true })
      })
    },
    [loadConversations, selectedConversation, showToast, withAction]
  )

  const handleSetBrand = useCallback(
    async (brand: "rental" | "dorata") => {
      if (!selectedConversation) return

      await withAction(async () => {
        const result = await setWhatsAppConversationBrand(selectedConversation.id, brand)
        if (!result.success) {
          showToast({
            variant: "error",
            title: "Falha ao definir marca",
            description: result.error,
          })
          return
        }

        await loadConversations({ preserveSelection: true })
      })
    },
    [loadConversations, selectedConversation, showToast, withAction]
  )

  const handleCloseOrReopen = useCallback(async () => {
    if (!selectedConversation) return

    await withAction(async () => {
      const result =
        selectedConversation.status === "CLOSED"
          ? await reopenWhatsAppConversation(selectedConversation.id)
          : await closeWhatsAppConversation(selectedConversation.id)

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao atualizar status",
          description: result.error,
        })
        return
      }

      await loadConversations({ preserveSelection: true })
    })
  }, [loadConversations, selectedConversation, showToast, withAction])

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversation) return

    const message = draft.trim()
    if (!message) return

    await withAction(async () => {
      const result = await sendWhatsAppTextMessage(selectedConversation.id, message)

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao enviar mensagem",
          description: result.error,
        })
        return
      }

      setDraft("")
      await loadConversations({ preserveSelection: true })
      await loadMessages(selectedConversation.id)
    })
  }, [draft, loadConversations, loadMessages, selectedConversation, showToast, withAction])

  const canSend = useMemo(() => {
    if (!selectedConversation) {
      return { allowed: false, reason: "Selecione uma conversa." }
    }

    if (!selectedConversation.brand) {
      return { allowed: false, reason: "Defina a marca da conversa antes do envio." }
    }

    if (selectedConversation.status === "CLOSED") {
      return { allowed: false, reason: "Conversa fechada. Reabra para enviar mensagens." }
    }

    if (!isWindowOpen(selectedConversation.window_expires_at)) {
      return {
        allowed: false,
        reason: "Janela de 24h encerrada. Texto livre bloqueado nesta fase.",
      }
    }

    return { allowed: true, reason: null as string | null }
  }, [selectedConversation])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Inbox WhatsApp</h1>
        <p className="text-muted-foreground">
          Atendimento 1:1 oficial via WhatsApp Cloud API (fase inicial sem templates automáticos).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-md border bg-white">
          <div className="border-b p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Conversas</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void refreshAll()
                }}
                disabled={loadingConversations || loadingMessages || actionLoading}
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>

            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou telefone"
            />

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{STATUS_LABELS.all}</SelectItem>
                  <SelectItem value="PENDING_BRAND">{STATUS_LABELS.PENDING_BRAND}</SelectItem>
                  <SelectItem value="OPEN">{STATUS_LABELS.OPEN}</SelectItem>
                  <SelectItem value="CLOSED">{STATUS_LABELS.CLOSED}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={brandFilter} onValueChange={(value) => setBrandFilter(value as BrandFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as marcas</SelectItem>
                  <SelectItem value="rental">Rental</SelectItem>
                  <SelectItem value="dorata">Dorata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={unassignedOnly}
                onChange={(event) => setUnassignedOnly(event.target.checked)}
              />
              Somente não atribuídas
            </label>
          </div>

          <ScrollArea className="h-[64vh]">
            <div className="divide-y">
              {conversations.map((conversation) => {
                const isSelected = conversation.id === selectedConversationId
                const windowOpen = isWindowOpen(conversation.window_expires_at)

                return (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full text-left p-3 transition-colors ${
                      isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{conversationDisplayName(conversation)}</p>
                        <p className="text-xs text-muted-foreground truncate">{conversation.customer_wa_id}</p>
                      </div>
                      {conversation.unread_count > 0 ? (
                        <Badge variant="default">{conversation.unread_count}</Badge>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="outline">{conversation.status}</Badge>
                      <Badge variant={conversation.brand ? "secondary" : "outline"}>
                        {conversation.brand || "Sem marca"}
                      </Badge>
                      <Badge variant={windowOpen ? "secondary" : "destructive"}>
                        {windowOpen ? "Janela 24h ativa" : "Janela 24h encerrada"}
                      </Badge>
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      <p>Responsável: {conversation.assigned_user_name || "Não atribuído"}</p>
                      <p>Última atividade: {formatDateTime(conversation.last_message_at)}</p>
                    </div>
                  </button>
                )
              })}

              {conversations.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-md border bg-white min-h-[70vh] flex flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{conversationDisplayName(selectedConversation)}</p>
                    <p className="text-sm text-muted-foreground">{selectedConversation.customer_wa_id}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => {
                        void handleAssign(
                          selectedConversation.assigned_user_id === currentUserId ? null : currentUserId
                        )
                      }}
                    >
                      <UserRound className="h-4 w-4" />
                      {selectedConversation.assigned_user_id === currentUserId ? "Liberar" : "Assumir"}
                    </Button>

                    <Button
                      variant={selectedConversation.status === "CLOSED" ? "default" : "outline"}
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => {
                        void handleCloseOrReopen()
                      }}
                    >
                      {selectedConversation.status === "CLOSED" ? "Reabrir" : "Fechar"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[220px_220px_minmax(0,1fr)]">
                  <Select
                    value={selectedConversation.brand || "__none"}
                    onValueChange={(value) => {
                      if (value === "__none") return
                      void handleSetBrand(value as "rental" | "dorata")
                    }}
                    disabled={actionLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Marca da conversa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem marca</SelectItem>
                      <SelectItem value="rental">Rental</SelectItem>
                      <SelectItem value="dorata">Dorata</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedConversation.assigned_user_id || "__none"}
                    onValueChange={(value) => {
                      void handleAssign(value === "__none" ? null : value)
                    }}
                    disabled={actionLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem responsável</SelectItem>
                      {initialAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name || agent.email || agent.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />
                    <span>Janela até: {formatDateTime(selectedConversation.window_expires_at)}</span>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4 bg-slate-50/40">
                <div className="space-y-3">
                  {messages.map((message) => {
                    const isOutbound = message.direction === "OUTBOUND"

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-md border px-3 py-2 text-sm ${
                            isOutbound ? "bg-blue-600 text-white border-blue-600" : "bg-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.body_text || "(sem conteúdo)"}</p>
                          <div
                            className={`mt-2 flex items-center justify-between gap-2 text-xs ${
                              isOutbound ? "text-blue-100" : "text-muted-foreground"
                            }`}
                          >
                            <span>{formatDateTime(message.created_at)}</span>
                            {isOutbound ? (
                              <span>{MESSAGE_STATUS_LABELS[message.status] || message.status}</span>
                            ) : (
                              <span>{message.message_type}</span>
                            )}
                          </div>
                          {message.error_message ? (
                            <p className="mt-1 text-xs text-red-200">{message.error_message}</p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}

                  {loadingMessages ? (
                    <div className="text-sm text-muted-foreground">Carregando mensagens...</div>
                  ) : null}

                  {!loadingMessages && messages.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sem mensagens nesta conversa.</div>
                  ) : null}
                </div>
              </ScrollArea>

              <div className="border-t p-4 space-y-2">
                {!canSend.allowed ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {canSend.reason}
                  </div>
                ) : null}

                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Digite a resposta para o cliente"
                  rows={4}
                />

                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      void handleSendMessage()
                    }}
                    disabled={actionLoading || !canSend.allowed || !draft.trim()}
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10" />
              <p>Selecione uma conversa para começar o atendimento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
