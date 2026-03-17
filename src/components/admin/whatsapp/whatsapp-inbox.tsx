"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import {
  AudioLines,
  Clock3,
  FileImage,
  FileText,
  MessageCircle,
  Paperclip,
  Plus,
  RefreshCcw,
  Send,
  UserRound,
  X,
} from "lucide-react"

import {
  assignWhatsAppConversation,
  closeWhatsAppConversation,
  getWhatsAppConversationMessages,
  listWhatsAppConversations,
  searchWhatsAppContacts,
  reopenWhatsAppConversation,
  sendWhatsAppMediaMessage,
  sendWhatsAppTextMessage,
  startWhatsAppConversationFromContact,
  setWhatsAppConversationBrand,
  type WhatsAppAgent,
  type WhatsAppContactOption,
  type WhatsAppConversationListItem,
  type WhatsAppMessage,
} from "@/app/actions/whatsapp"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useDebounce } from "@/hooks/use-debounce"
import { useToast } from "@/hooks/use-toast"
import {
  WHATSAPP_OUTBOUND_MEDIA_BUCKET,
  buildWhatsAppOutboundMediaStoragePath,
  resolveWhatsAppOutboundMediaType,
  sanitizeWhatsAppOutboundMediaFileName,
  validateWhatsAppOutboundMediaFile,
  type WhatsAppOutboundMediaType,
} from "@/lib/whatsapp-media"
import { supabase } from "@/lib/supabase"

type WhatsAppInboxProps = {
  currentUserId: string
  initialAgents: WhatsAppAgent[]
}

type StatusFilter = "all" | "PENDING_BRAND" | "OPEN" | "CLOSED"
type ConversationBrand = "rental" | "dorata" | "funcionario" | "diversos"
type BrandFilter = "all" | ConversationBrand
type MediaPickerKind = "image" | "document" | "audio"

type PendingOutgoingMedia = {
  mediaType: WhatsAppOutboundMediaType
  storagePath: string
  fileName: string
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "Todos",
  PENDING_BRAND: "Pendente de marca",
  OPEN: "Aberta",
  CLOSED: "Fechada",
}

const BRAND_LABELS: Record<ConversationBrand, string> = {
  rental: "Rental",
  dorata: "Dorata",
  funcionario: "Funcionário",
  diversos: "Diversos",
}

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  received: "Recebida",
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
}

const MEDIA_PICKER_ACCEPT: Record<MediaPickerKind, string> = {
  image: "image/jpeg,image/png,image/webp",
  document: "application/pdf,.pdf",
  audio: "audio/*,.mp3,.ogg,.wav,.m4a,.aac,.webm",
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

function formatRecordingDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
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
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [conversations, setConversations] = useState<WhatsAppConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [nextBeforeCursor, setNextBeforeCursor] = useState<string | null>(null)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState("")
  const [contactOptions, setContactOptions] = useState<WhatsAppContactOption[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [startingConversation, setStartingConversation] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all")
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const [draft, setDraft] = useState("")
  const [pendingMedia, setPendingMedia] = useState<PendingOutgoingMedia | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const debouncedSearch = useDebounce(search, 350)
  const debouncedContactSearch = useDebounce(contactSearch, 300)

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
    async (
      conversationId: string,
      options: { before?: string | null; appendOlder?: boolean } = {}
    ) => {
      const isLoadingOlder = Boolean(options.before)
      if (isLoadingOlder) setLoadingOlderMessages(true)
      else setLoadingMessages(true)

      try {
        const result = await getWhatsAppConversationMessages(conversationId, {
          before: options.before ?? null,
        })

        if (!result.success || !result.data) {
          showToast({
            variant: "error",
            title: "Falha ao carregar mensagens",
            description: result.error || "Não foi possível carregar mensagens da conversa.",
          })
          return
        }

        setHasMoreMessages(result.data.has_more)
        setNextBeforeCursor(result.data.next_before)

        if (options.appendOlder) {
          setMessages((current) => {
            const seen = new Set<string>()
            const merged = [...result.data.messages, ...current]

            return merged.filter((message) => {
              if (seen.has(message.id)) {
                return false
              }

              seen.add(message.id)
              return true
            })
          })
          return
        }

        setMessages(result.data.messages)
      } catch {
        showToast({
          variant: "error",
          title: "Falha ao carregar mensagens",
          description: "Não foi possível carregar mensagens da conversa.",
        })
      } finally {
        if (isLoadingOlder) setLoadingOlderMessages(false)
        else setLoadingMessages(false)
      }
    },
    [showToast]
  )

  const refreshAll = useCallback(async () => {
    await loadConversations({ preserveSelection: true })

    if (selectedConversationIdRef.current) {
      await loadMessages(selectedConversationIdRef.current)
    }
  }, [loadConversations, loadMessages])

  const loadContactOptions = useCallback(
    async (term: string) => {
      setLoadingContacts(true)
      const result = await searchWhatsAppContacts(term)
      setLoadingContacts(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao buscar contatos",
          description: result.error || "Não foi possível buscar contatos para nova conversa.",
        })
        return
      }

      setContactOptions(result.data)
    },
    [showToast]
  )

  const handleStartConversation = useCallback(
    async (contactId: string) => {
      if (startingConversation) return
      setStartingConversation(true)

      const result = await startWhatsAppConversationFromContact(contactId)
      setStartingConversation(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao iniciar conversa",
          description: result.error || "Não foi possível iniciar conversa para este contato.",
        })
        return
      }

      const conversationId = result.data.conversation_id
      setContactDialogOpen(false)
      setContactSearch("")
      await loadConversations({ preserveSelection: true })
      setSelectedConversationId(conversationId)
      await loadMessages(conversationId)
    },
    [loadConversations, loadMessages, showToast, startingConversation]
  )

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    if (!pendingMedia) return
    if (!selectedConversationId || !pendingMedia.storagePath.startsWith(`${selectedConversationId}/`)) {
      const previousPath = pendingMedia.storagePath
      setPendingMedia(null)
      void supabase.storage.from(WHATSAPP_OUTBOUND_MEDIA_BUCKET).remove([previousPath])
    }
  }, [pendingMedia, selectedConversationId])

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null
        recorder.stop()
      }
      mediaRecorderRef.current = null
      audioChunksRef.current = []

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void loadConversations({ preserveSelection: true })
  }, [loadConversations])

  useEffect(() => {
    if (!contactDialogOpen) return
    void loadContactOptions(debouncedContactSearch)
  }, [contactDialogOpen, debouncedContactSearch, loadContactOptions])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      setHasMoreMessages(false)
      setNextBeforeCursor(null)
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
    async (brand: ConversationBrand) => {
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

  const uploadPendingMediaFile = useCallback(
    async (file: File) => {
      if (!selectedConversation) {
        showToast({
          variant: "error",
          title: "Selecione uma conversa",
          description: "Escolha uma conversa antes de anexar arquivos.",
        })
        return
      }

      const validationError = validateWhatsAppOutboundMediaFile({
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      })

      if (validationError) {
        showToast({
          variant: "error",
          title: "Arquivo inválido",
          description: validationError,
        })
        return
      }

      const mediaType = resolveWhatsAppOutboundMediaType({
        fileName: file.name,
        mimeType: file.type,
      })

      if (!mediaType) {
        showToast({
          variant: "error",
          title: "Formato não suportado",
          description: "Use foto, PDF ou áudio.",
        })
        return
      }

      const safeFileName = sanitizeWhatsAppOutboundMediaFileName({
        fileName: file.name,
        mediaType,
      })

      const storagePath = buildWhatsAppOutboundMediaStoragePath({
        conversationId: selectedConversation.id,
        safeFileName,
      })

      setUploadingMedia(true)
      const { error } = await supabase.storage.from(WHATSAPP_OUTBOUND_MEDIA_BUCKET).upload(storagePath, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || undefined,
      })
      setUploadingMedia(false)

      if (error) {
        showToast({
          variant: "error",
          title: "Falha no upload",
          description: error.message,
        })
        return
      }

      if (pendingMedia?.storagePath) {
        void supabase.storage.from(WHATSAPP_OUTBOUND_MEDIA_BUCKET).remove([pendingMedia.storagePath])
      }

      setPendingMedia({
        mediaType,
        storagePath,
        fileName: safeFileName,
      })
    },
    [pendingMedia?.storagePath, selectedConversation, showToast]
  )

  const stopRecordingTimer = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
  }, [])

  const stopRecordingTracks = useCallback(() => {
    if (!mediaStreamRef.current) return
    mediaStreamRef.current.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const stopAudioRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current

    if (!recorder || recorder.state === "inactive") {
      setRecordingAudio(false)
      setRecordingSeconds(0)
      stopRecordingTimer()
      stopRecordingTracks()
      return
    }

    recorder.stop()
    setRecordingAudio(false)
    setRecordingSeconds(0)
    stopRecordingTimer()
  }, [stopRecordingTimer, stopRecordingTracks])

  const startAudioRecording = useCallback(async () => {
    if (!selectedConversation) {
      showToast({
        variant: "error",
        title: "Selecione uma conversa",
        description: "Escolha uma conversa antes de gravar áudio.",
      })
      return
    }

    if (recordingAudio || uploadingMedia || actionLoading) return

    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      showToast({
        variant: "error",
        title: "Gravação indisponível",
        description: "Seu navegador não suporta gravação de áudio.",
      })
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast({
        variant: "error",
        title: "Gravação indisponível",
        description: "Não foi possível acessar o microfone neste navegador.",
      })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ]

      const mimeType = preferredMimeTypes.find((item) => {
        try {
          return MediaRecorder.isTypeSupported(item)
        } catch {
          return false
        }
      })

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const effectiveType = recorder.mimeType || audioChunksRef.current[0]?.type || "audio/webm"
        const extension = effectiveType.includes("ogg")
          ? "ogg"
          : effectiveType.includes("mp4") || effectiveType.includes("m4a")
            ? "m4a"
            : "webm"

        const blob = new Blob(audioChunksRef.current, { type: effectiveType })
        audioChunksRef.current = []
        mediaRecorderRef.current = null
        stopRecordingTracks()

        if (blob.size <= 0) {
          showToast({
            variant: "error",
            title: "Áudio vazio",
            description: "Não foi possível capturar o áudio gravado.",
          })
          return
        }

        const file = new File([blob], `audio-${Date.now()}.${extension}`, {
          type: effectiveType,
        })

        void uploadPendingMediaFile(file)
      }

      recorder.onerror = () => {
        showToast({
          variant: "error",
          title: "Falha na gravação",
          description: "Não foi possível gravar o áudio.",
        })
        stopAudioRecording()
      }

      recorder.start(250)
      setRecordingAudio(true)
      setRecordingSeconds(0)
      stopRecordingTimer()
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      stopRecordingTracks()
      showToast({
        variant: "error",
        title: "Permissão negada",
        description:
          error instanceof Error
            ? error.message
            : "Autorize o uso do microfone para gravar e enviar áudios.",
      })
    }
  }, [
    actionLoading,
    recordingAudio,
    selectedConversation,
    showToast,
    stopAudioRecording,
    stopRecordingTimer,
    stopRecordingTracks,
    uploadPendingMediaFile,
    uploadingMedia,
  ])

  const openMediaPicker = useCallback(
    (kind: Exclude<MediaPickerKind, "audio">) => {
      if (!selectedConversation) {
        showToast({
          variant: "error",
          title: "Selecione uma conversa",
          description: "Escolha uma conversa antes de anexar arquivos.",
        })
        return
      }

      const input = mediaFileInputRef.current
      if (!input) return
      input.accept = MEDIA_PICKER_ACCEPT[kind]
      input.click()
    },
    [selectedConversation, showToast]
  )

  const handleAudioButtonClick = useCallback(() => {
    if (recordingAudio) {
      stopAudioRecording()
      return
    }
    void startAudioRecording()
  }, [recordingAudio, startAudioRecording, stopAudioRecording])

  const handleMediaInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ""
      if (!file) return

      await uploadPendingMediaFile(file)
    },
    [uploadPendingMediaFile]
  )

  const removePendingMedia = useCallback(async () => {
    if (!pendingMedia) return

    const path = pendingMedia.storagePath
    setPendingMedia(null)
    await supabase.storage.from(WHATSAPP_OUTBOUND_MEDIA_BUCKET).remove([path])
  }, [pendingMedia])

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversation) return

    const message = draft.trim()
    const hasPendingMedia = Boolean(pendingMedia)

    if (!message && !hasPendingMedia) return

    await withAction(async () => {
      const result = hasPendingMedia
        ? await sendWhatsAppMediaMessage(selectedConversation.id, {
            mediaType: pendingMedia.mediaType,
            storagePath: pendingMedia.storagePath,
            fileName: pendingMedia.fileName,
            caption: message || null,
          })
        : await sendWhatsAppTextMessage(selectedConversation.id, message)

      if (!result.success) {
        showToast({
          variant: "error",
          title: hasPendingMedia ? "Falha ao enviar mídia" : "Falha ao enviar mensagem",
          description: result.error,
        })
        return
      }

      setDraft("")
      setPendingMedia(null)
      await loadConversations({ preserveSelection: true })
      await loadMessages(selectedConversation.id)
    })
  }, [draft, loadConversations, loadMessages, pendingMedia, selectedConversation, showToast, withAction])

  const handleLoadOlderMessages = useCallback(async () => {
    const selectedId = selectedConversationIdRef.current
    if (!selectedId || !nextBeforeCursor || loadingOlderMessages) {
      return
    }

    await loadMessages(selectedId, {
      before: nextBeforeCursor,
      appendOlder: true,
    })
  }, [loadMessages, loadingOlderMessages, nextBeforeCursor])

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
        reason: "Janela de 24h encerrada. O envio de mensagens está bloqueado nesta fase.",
      }
    }

    return { allowed: true, reason: null as string | null }
  }, [selectedConversation])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Inbox WhatsApp</h1>
        <p className="text-muted-foreground">
          Atendimento 1:1 via provedor configurado (Meta Cloud API ou Z-API).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-md border bg-white">
          <div className="border-b p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Conversas</h2>
              <div className="flex items-center gap-2">
                <Dialog
                  open={contactDialogOpen}
                  onOpenChange={(open) => {
                    setContactDialogOpen(open)
                    if (!open) {
                      setContactSearch("")
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4" />
                      Nova
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Nova conversa</DialogTitle>
                      <DialogDescription>
                        Selecione um contato com WhatsApp para abrir atendimento.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                      <Input
                        value={contactSearch}
                        onChange={(event) => setContactSearch(event.target.value)}
                        placeholder="Buscar contato por nome ou telefone"
                      />

                      <ScrollArea className="h-[280px] rounded-md border p-2">
                        <div className="space-y-2">
                          {contactOptions.map((contact) => (
                            <button
                              type="button"
                              key={contact.id}
                              className="w-full rounded-md border bg-white p-3 text-left transition-colors hover:bg-slate-50"
                              onClick={() => {
                                void handleStartConversation(contact.id)
                              }}
                              disabled={startingConversation}
                            >
                              <p className="text-sm font-medium">{contact.name}</p>
                              <p className="text-xs text-muted-foreground">{contact.whatsapp}</p>
                            </button>
                          ))}

                          {loadingContacts ? (
                            <p className="text-sm text-muted-foreground">Buscando contatos...</p>
                          ) : null}

                          {!loadingContacts && contactOptions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nenhum contato com WhatsApp encontrado.
                            </p>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>

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
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Marcas</SelectLabel>
                    <SelectItem value="dorata">Dorata</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Outros</SelectLabel>
                    <SelectItem value="funcionario">Funcionário</SelectItem>
                    <SelectItem value="diversos">Diversos</SelectItem>
                  </SelectGroup>
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
                        {conversation.brand
                          ? BRAND_LABELS[conversation.brand as ConversationBrand]
                          : "Sem marca"}
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
                      void handleSetBrand(value as ConversationBrand)
                    }}
                    disabled={actionLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Marca da conversa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem marca</SelectItem>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Marcas</SelectLabel>
                        <SelectItem value="dorata">Dorata</SelectItem>
                        <SelectItem value="rental">Rental</SelectItem>
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Outros</SelectLabel>
                        <SelectItem value="funcionario">Funcionário</SelectItem>
                        <SelectItem value="diversos">Diversos</SelectItem>
                      </SelectGroup>
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
                  {hasMoreMessages ? (
                    <div className="flex justify-center pb-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void handleLoadOlderMessages()
                        }}
                        disabled={loadingMessages || loadingOlderMessages}
                      >
                        {loadingOlderMessages ? "Carregando..." : "Carregar mensagens anteriores"}
                      </Button>
                    </div>
                  ) : null}

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
                            <span>
                              {isOutbound ? `Por ${message.sender_user_name || "Atendente"} • ` : ""}
                              {formatDateTime(message.created_at)}
                            </span>
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

                <input
                  ref={mediaFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    void handleMediaInputChange(event)
                  }}
                />

                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Digite a resposta para o cliente"
                  rows={4}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      if (!actionLoading && !uploadingMedia && !recordingAudio && canSend.allowed) {
                        void handleSendMessage()
                      }
                    }
                  }}
                />

                {recordingAudio ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Gravando áudio... {formatRecordingDuration(recordingSeconds)}
                  </div>
                ) : null}

                {pendingMedia ? (
                  <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{pendingMedia.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {pendingMedia.mediaType === "image"
                          ? "Foto"
                          : pendingMedia.mediaType === "document"
                            ? "PDF"
                            : "Áudio"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        void removePendingMedia()
                      }}
                      disabled={actionLoading || uploadingMedia}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openMediaPicker("image")}
                      disabled={!canSend.allowed || actionLoading || uploadingMedia || recordingAudio}
                    >
                      <FileImage className="h-4 w-4" />
                      Foto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openMediaPicker("document")}
                      disabled={!canSend.allowed || actionLoading || uploadingMedia || recordingAudio}
                    >
                      <FileText className="h-4 w-4" />
                      PDF
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={recordingAudio ? "destructive" : "outline"}
                      onClick={() => handleAudioButtonClick()}
                      disabled={!canSend.allowed || actionLoading || uploadingMedia}
                    >
                      <AudioLines className="h-4 w-4" />
                      {recordingAudio ? "Parar" : "Áudio"}
                    </Button>
                  </div>

                  <Button
                    onClick={() => {
                      void handleSendMessage()
                    }}
                    disabled={
                      actionLoading ||
                      uploadingMedia ||
                      recordingAudio ||
                      !canSend.allowed ||
                      (!draft.trim() && !pendingMedia)
                    }
                  >
                    {uploadingMedia ? (
                      <>
                        <Paperclip className="h-4 w-4" />
                        Enviando arquivo...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar
                      </>
                    )}
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
