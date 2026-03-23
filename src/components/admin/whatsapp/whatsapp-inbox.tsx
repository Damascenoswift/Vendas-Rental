"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileImage,
  FileText,
  Info,
  LayoutGrid,
  List,
  Lock,
  MessageCircle,
  Paperclip,
  PencilLine,
  Plus,
  RefreshCcw,
  Send,
  StickyNote,
  Trash2,
  Unlock,
  UserRound,
  X,
} from "lucide-react"

import {
  assignWhatsAppConversation,
  closeWhatsAppConversation,
  deleteWhatsAppConversation,
  ensureWhatsAppConversationContact,
  getWhatsAppConversationRestrictionSettings,
  getWhatsAppConversationMessages,
  listWhatsAppConversations,
  searchWhatsAppContacts,
  reopenWhatsAppConversation,
  sendWhatsAppMediaMessage,
  sendWhatsAppReactivationTemplate,
  startWhatsAppConversationFromPhone,
  sendWhatsAppTextMessage,
  setWhatsAppConversationRestriction,
  syncWhatsAppConversationContacts,
  startWhatsAppConversationFromContact,
  setWhatsAppConversationBrand,
  updateWhatsAppConversationContactName,
  type WhatsAppAgent,
  type WhatsAppContactOption,
  type WhatsAppConversationListItem,
  type WhatsAppMessage,
} from "@/app/actions/whatsapp"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
  DialogFooter,
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
  canManageConversationRestrictions: boolean
  allowOutsideWindowOnZApi: boolean
}

type StatusFilter = "all" | "PENDING_BRAND" | "OPEN" | "CLOSED"
type ConversationBrand = "rental" | "dorata" | "funcionario" | "diversos"
type BrandFilter = "all" | ConversationBrand
type MediaPickerKind = "image" | "document" | "audio"
type ConversationViewMode = "kanban" | "list"
type KanbanColumnKey = "PENDING_BRAND" | "funcionario" | "dorata" | "rental" | "diversos"

type PendingOutgoingMedia = {
  mediaType: WhatsAppOutboundMediaType
  storagePath: string
  fileName: string
}

type ConversationPinnedNote = {
  text: string
  targetUserId: string | null
  targetUserName: string | null
  updatedAt: string
}

type SendAvailabilityCode =
  | "no_conversation"
  | "missing_brand"
  | "closed"
  | "window_closed"
  | "unsafe_window_bypass"
  | "ready"

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
  audio: "audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.ogg,.wav,.m4a,.aac",
}

const KANBAN_BRAND_COLUMNS: KanbanColumnKey[] = [
  "PENDING_BRAND",
  "funcionario",
  "dorata",
  "rental",
  "diversos",
]

const KANBAN_COLUMN_LABELS: Record<KanbanColumnKey, string> = {
  PENDING_BRAND: "Pendente de marca",
  funcionario: "Funcionários",
  dorata: "Dorata",
  rental: "Rental",
  diversos: "Diversos",
}

const PINNED_NOTE_STORAGE_KEY = "whatsapp-inbox:pinned-notes:v1"

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

function normalizeLikelyWhatsAppPhone(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length < 10 || digits.length > 13) return ""
  if (digits.startsWith("0")) return ""
  return digits
}

function formatWhatsAppNumber(value: string | null | undefined) {
  const digits = normalizeLikelyWhatsAppPhone(value)
  if (!digits) return "-"
  if (digits.length <= 4) return digits
  if (digits.length <= 10) return `+${digits}`

  const ddi = digits.slice(0, 2)
  const ddd = digits.slice(2, 4)
  const number = digits.slice(4)

  if (number.length === 9) {
    return `+${ddi} (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
  }

  if (number.length === 8) {
    return `+${ddi} (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`
  }

  return `+${digits}`
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

function isAudioPlaceholderText(value: string | null | undefined) {
  const text = (value || "").trim().toLowerCase()
  return text === "[audio recebido no whatsapp]" || text === "[audio enviado no whatsapp]"
}

function conversationWhatsappNumber(conversation: WhatsAppConversationListItem) {
  return (
    normalizeLikelyWhatsAppPhone(conversation.contact_whatsapp) ||
    normalizeLikelyWhatsAppPhone(conversation.customer_wa_id)
  )
}

function conversationDisplayName(conversation: WhatsAppConversationListItem) {
  const whatsappNumber = conversationWhatsappNumber(conversation)

  return (
    conversation.contact_name ||
    conversation.customer_name ||
    (whatsappNumber ? formatWhatsAppNumber(whatsappNumber) : "Contato sem WhatsApp válido")
  )
}

function parsePinnedNote(value: unknown): ConversationPinnedNote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const payload = value as Record<string, unknown>
  const text = typeof payload.text === "string" ? payload.text.trim() : ""
  if (!text) return null

  const targetUserId =
    typeof payload.targetUserId === "string" && payload.targetUserId.trim()
      ? payload.targetUserId.trim()
      : null
  const targetUserName =
    typeof payload.targetUserName === "string" && payload.targetUserName.trim()
      ? payload.targetUserName.trim()
      : null
  const updatedAt =
    typeof payload.updatedAt === "string" && payload.updatedAt.trim()
      ? payload.updatedAt
      : new Date().toISOString()

  return {
    text,
    targetUserId,
    targetUserName,
    updatedAt,
  }
}

function readPinnedNotesFromStorage(): Record<string, ConversationPinnedNote> {
  if (typeof window === "undefined") return {}

  try {
    const rawValue = window.localStorage.getItem(PINNED_NOTE_STORAGE_KEY)
    if (!rawValue) return {}
    const parsed = JSON.parse(rawValue)

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const notes: Record<string, ConversationPinnedNote> = {}
    for (const [conversationId, value] of Object.entries(parsed)) {
      if (!conversationId.trim()) continue
      const note = parsePinnedNote(value)
      if (!note) continue
      notes[conversationId] = note
    }

    return notes
  } catch {
    return {}
  }
}

function persistPinnedNotesToStorage(notes: Record<string, ConversationPinnedNote>) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(PINNED_NOTE_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Ignore write errors to avoid blocking inbox usage.
  }
}

export function WhatsAppInbox({
  currentUserId,
  initialAgents,
  canManageConversationRestrictions,
  allowOutsideWindowOnZApi,
}: WhatsAppInboxProps) {
  const { showToast } = useToast()
  const searchParams = useSearchParams()
  const selectedConversationIdRef = useRef<string | null>(null)
  const autoStartRequestKeyRef = useRef<string | null>(null)
  const conversationPanelRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollAreaRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollMessagesToBottomRef = useRef(false)
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
  const [conversationViewMode, setConversationViewMode] = useState<ConversationViewMode>("kanban")
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false)
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false)
  const [contactNameDraft, setContactNameDraft] = useState("")
  const [savingContactName, setSavingContactName] = useState(false)
  const [restrictionDialogOpen, setRestrictionDialogOpen] = useState(false)
  const [loadingRestrictionSettings, setLoadingRestrictionSettings] = useState(false)
  const [savingRestrictionSettings, setSavingRestrictionSettings] = useState(false)
  const [restrictionDraftEnabled, setRestrictionDraftEnabled] = useState(false)
  const [restrictionDraftAllowedUserIds, setRestrictionDraftAllowedUserIds] = useState<string[]>([])
  const [pinnedNotesByConversationId, setPinnedNotesByConversationId] = useState<
    Record<string, ConversationPinnedNote>
  >({})
  const [hiddenPinnedNotesByConversationId, setHiddenPinnedNotesByConversationId] = useState<
    Record<string, boolean>
  >({})
  const [pinnedNoteEditorOpen, setPinnedNoteEditorOpen] = useState(false)
  const [pinnedNoteDraft, setPinnedNoteDraft] = useState("")
  const [pinnedNoteTargetUserId, setPinnedNoteTargetUserId] = useState("__none")
  const [transferNoteDraft, setTransferNoteDraft] = useState("")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all")
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [missingContactOnly, setMissingContactOnly] = useState(false)

  const [draft, setDraft] = useState("")
  const [pendingMedia, setPendingMedia] = useState<PendingOutgoingMedia | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [syncingConversationContacts, setSyncingConversationContacts] = useState(false)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const debouncedSearch = useDebounce(search, 350)
  const debouncedContactSearch = useDebounce(contactSearch, 300)

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  )
  const selectedConversationPinnedNote = useMemo(() => {
    if (!selectedConversationId) return null
    return pinnedNotesByConversationId[selectedConversationId] ?? null
  }, [pinnedNotesByConversationId, selectedConversationId])
  const isSelectedPinnedNoteHidden = useMemo(() => {
    if (!selectedConversationId) return false
    return Boolean(hiddenPinnedNotesByConversationId[selectedConversationId])
  }, [hiddenPinnedNotesByConversationId, selectedConversationId])
  const showFloatingPinnedNote = Boolean(selectedConversationPinnedNote && !isSelectedPinnedNoteHidden)
  const resolveAgentLabel = useCallback(
    (agentId: string | null) => {
      if (!agentId) return null
      const agent = initialAgents.find((item) => item.id === agentId)
      return agent?.name || agent?.email || agentId
    },
    [initialAgents]
  )
  const updatePinnedNotes = useCallback(
    (updater: (current: Record<string, ConversationPinnedNote>) => Record<string, ConversationPinnedNote>) => {
      setPinnedNotesByConversationId((current) => {
        const next = updater(current)
        persistPinnedNotesToStorage(next)
        return next
      })
    },
    []
  )
  const upsertConversationPinnedNote = useCallback(
    (input: { conversationId: string; text: string; targetUserId: string | null }) => {
      const trimmedText = input.text.trim()
      if (!trimmedText) return

      updatePinnedNotes((current) => ({
        ...current,
        [input.conversationId]: {
          text: trimmedText,
          targetUserId: input.targetUserId,
          targetUserName: resolveAgentLabel(input.targetUserId),
          updatedAt: new Date().toISOString(),
        },
      }))
    },
    [resolveAgentLabel, updatePinnedNotes]
  )
  const clearConversationPinnedNote = useCallback(
    (conversationId: string) => {
      updatePinnedNotes((current) => {
        if (!current[conversationId]) return current
        const next = { ...current }
        delete next[conversationId]
        return next
      })
    },
    [updatePinnedNotes]
  )
  const hideConversationPinnedNote = useCallback((conversationId: string) => {
    setHiddenPinnedNotesByConversationId((current) => ({
      ...current,
      [conversationId]: true,
    }))
  }, [])
  const showConversationPinnedNote = useCallback((conversationId: string) => {
    setHiddenPinnedNotesByConversationId((current) => {
      if (!current[conversationId]) return current
      const next = { ...current }
      delete next[conversationId]
      return next
    })
  }, [])
  const autoStartRequest = useMemo(() => {
    const contactId = (searchParams.get("startContact") || "").trim()
    const phone = normalizeLikelyWhatsAppPhone(searchParams.get("startPhone") || "")
    const name = (searchParams.get("startName") || "").trim()

    if (contactId) {
      return {
        key: `contact:${contactId}`,
        type: "contact" as const,
        contactId,
        name,
      }
    }

    if (phone) {
      return {
        key: `phone:${phone}`,
        type: "phone" as const,
        phone,
        name,
      }
    }

    return null
  }, [searchParams])

  const getMessagesViewportElement = useCallback(() => {
    if (!messagesScrollAreaRef.current) return null
    return messagesScrollAreaRef.current.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    )
  }, [])

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const viewport = getMessagesViewportElement()
      if (!viewport) return
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      })
    },
    [getMessagesViewportElement]
  )

  const ensureConversationPanelInView = useCallback(() => {
    if (!conversationPanelRef.current) return
    conversationPanelRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    })
  }, [])

  const conversationsByKanbanColumn = useMemo<Record<KanbanColumnKey, WhatsAppConversationListItem[]>>(() => {
    const grouped: Record<KanbanColumnKey, WhatsAppConversationListItem[]> = {
      PENDING_BRAND: [],
      funcionario: [],
      dorata: [],
      rental: [],
      diversos: [],
    }

    for (const conversation of conversations) {
      if (conversation.status === "PENDING_BRAND" || !conversation.brand) {
        grouped.PENDING_BRAND.push(conversation)
        continue
      }

      if (conversation.brand === "dorata") {
        grouped.dorata.push(conversation)
        continue
      }

      if (conversation.brand === "rental") {
        grouped.rental.push(conversation)
        continue
      }

      if (conversation.brand === "diversos") {
        grouped.diversos.push(conversation)
        continue
      }

      grouped.funcionario.push(conversation)
    }

    return grouped
  }, [conversations])

  const loadConversations = useCallback(
    async (params?: { preserveSelection?: boolean }) => {
      setLoadingConversations(true)

      const result = await listWhatsAppConversations({
        search: debouncedSearch,
        status: statusFilter,
        brand: brandFilter,
        unassignedOnly,
        missingContactOnly,
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
    [brandFilter, debouncedSearch, missingContactOnly, showToast, statusFilter, unassignedOnly]
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

        const messagesData = result.data

        setHasMoreMessages(messagesData.has_more)
        setNextBeforeCursor(messagesData.next_before)

        if (options.appendOlder) {
          setMessages((current) => {
            const seen = new Set<string>()
            const merged = [...messagesData.messages, ...current]

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

        setMessages(messagesData.messages)
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

  const handleStartConversationByPhone = useCallback(
    async (phone: string, name?: string | null) => {
      if (startingConversation) return null
      setStartingConversation(true)

      const result = await startWhatsAppConversationFromPhone(phone, name || null)
      setStartingConversation(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao iniciar conversa",
          description: result.error || "Não foi possível iniciar conversa para este número.",
        })
        return null
      }

      const conversationId = result.data.conversation_id
      await loadConversations({ preserveSelection: true })
      setSelectedConversationId(conversationId)
      await loadMessages(conversationId)
      return conversationId
    },
    [loadConversations, loadMessages, showToast, startingConversation]
  )

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    setConversationInfoOpen(false)
  }, [selectedConversationId])

  useEffect(() => {
    setPinnedNotesByConversationId(readPinnedNotesFromStorage())
  }, [])

  useEffect(() => {
    if (!selectedConversationId) {
      setPinnedNoteEditorOpen(false)
      setPinnedNoteDraft("")
      setPinnedNoteTargetUserId("__none")
      setTransferNoteDraft("")
      return
    }

    setPinnedNoteEditorOpen(false)
    const pinnedNote = pinnedNotesByConversationId[selectedConversationId] ?? null
    setPinnedNoteDraft(pinnedNote?.text ?? "")
    setPinnedNoteTargetUserId(pinnedNote?.targetUserId ?? "__none")
    setTransferNoteDraft("")
  }, [pinnedNotesByConversationId, selectedConversationId])

  useEffect(() => {
    if (!selectedConversationId) return
    shouldScrollMessagesToBottomRef.current = true

    const frameId = window.requestAnimationFrame(() => {
      ensureConversationPanelInView()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [ensureConversationPanelInView, selectedConversationId])

  useEffect(() => {
    if (!selectedConversation) {
      setEditContactDialogOpen(false)
      setContactNameDraft("")
      return
    }

    if (!editContactDialogOpen) {
      setContactNameDraft(conversationDisplayName(selectedConversation))
    }
  }, [editContactDialogOpen, selectedConversation])

  useEffect(() => {
    if (typeof window === "undefined") return
    const savedMode = window.localStorage.getItem("whatsapp_inbox_view_mode")
    if (savedMode === "kanban" || savedMode === "list") {
      setConversationViewMode(savedMode)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("whatsapp_inbox_view_mode", conversationViewMode)
  }, [conversationViewMode])

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
    if (!autoStartRequest || loadingConversations) return
    if (autoStartRequestKeyRef.current === autoStartRequest.key) return

    let cancelled = false

    const runAutoStart = async () => {
      autoStartRequestKeyRef.current = autoStartRequest.key

      if (autoStartRequest.type === "contact") {
        if (cancelled) return
        await handleStartConversation(autoStartRequest.contactId)
        return
      }

      const existingConversation = conversations.find((conversation) => {
        const conversationPhone = conversationWhatsappNumber(conversation)
        return Boolean(conversationPhone) && conversationPhone === autoStartRequest.phone
      })

      if (existingConversation) {
        if (cancelled) return
        setSelectedConversationId(existingConversation.id)
        await loadMessages(existingConversation.id)
        return
      }

      if (cancelled) return
      await handleStartConversationByPhone(autoStartRequest.phone, autoStartRequest.name)
    }

    void runAutoStart()

    return () => {
      cancelled = true
    }
  }, [
    autoStartRequest,
    conversations,
    handleStartConversation,
    handleStartConversationByPhone,
    loadMessages,
    loadingConversations,
  ])

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
    if (!selectedConversationId) return
    if (loadingMessages) return
    if (!shouldScrollMessagesToBottomRef.current) return

    const frameId = window.requestAnimationFrame(() => {
      scrollMessagesToBottom("auto")
      shouldScrollMessagesToBottomRef.current = false
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [loadingMessages, messages, scrollMessagesToBottom, selectedConversationId])

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

  const handleSavePinnedNote = useCallback(() => {
    if (!selectedConversation) return

    const noteText = pinnedNoteDraft.trim()
    if (!noteText) {
      showToast({
        variant: "error",
        title: "Nota vazia",
        description: "Digite uma nota para fixar nesta conversa.",
      })
      return
    }

    const targetUserId = pinnedNoteTargetUserId === "__none" ? null : pinnedNoteTargetUserId
    upsertConversationPinnedNote({
      conversationId: selectedConversation.id,
      text: noteText,
      targetUserId,
    })
    showConversationPinnedNote(selectedConversation.id)
    setPinnedNoteEditorOpen(false)

    const targetLabel = resolveAgentLabel(targetUserId)
    showToast({
      variant: "success",
      title: "Nota fixada",
      description: targetLabel
        ? `Nota direcionada para ${targetLabel}.`
        : "Nota fixada para esta conversa.",
    })
  }, [
    pinnedNoteDraft,
    pinnedNoteTargetUserId,
    resolveAgentLabel,
    selectedConversation,
    showConversationPinnedNote,
    showToast,
    upsertConversationPinnedNote,
  ])

  const handleClearPinnedNote = useCallback(() => {
    if (!selectedConversation) return
    clearConversationPinnedNote(selectedConversation.id)
    showConversationPinnedNote(selectedConversation.id)
    setPinnedNoteEditorOpen(false)
    setPinnedNoteDraft("")
    setPinnedNoteTargetUserId("__none")
    showToast({
      variant: "success",
      title: "Nota removida",
      description: "A nota fixada desta conversa foi removida.",
    })
  }, [clearConversationPinnedNote, selectedConversation, showConversationPinnedNote, showToast])

  const handleAssign = useCallback(
    async (assigneeId: string | null, options?: { transferNote?: string | null }) => {
      if (!selectedConversation) return

      const previousAssigneeId = selectedConversation.assigned_user_id
      const transferNote = options?.transferNote?.trim() || ""

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

        if (transferNote && previousAssigneeId !== assigneeId) {
          upsertConversationPinnedNote({
            conversationId: selectedConversation.id,
            text: transferNote,
            targetUserId: assigneeId,
          })
          showConversationPinnedNote(selectedConversation.id)
          setPinnedNoteEditorOpen(false)
          setTransferNoteDraft("")
          showToast({
            variant: "success",
            title: "Nota da transferência salva",
            description: assigneeId
              ? `Nota direcionada para ${resolveAgentLabel(assigneeId) || "novo responsável"}.`
              : "Nota salva para esta conversa.",
          })
        }

        await loadConversations({ preserveSelection: true })
      })
    },
    [
      loadConversations,
      resolveAgentLabel,
      selectedConversation,
      showConversationPinnedNote,
      showToast,
      upsertConversationPinnedNote,
      withAction,
    ]
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

  const handleSaveContactName = useCallback(async () => {
    if (!selectedConversation || savingContactName) return

    const normalizedName = contactNameDraft.trim().replace(/\s+/g, " ")
    if (!normalizedName) {
      showToast({
        variant: "error",
        title: "Nome inválido",
        description: "Informe um nome para salvar no contato.",
      })
      return
    }

    setSavingContactName(true)
    const result = await updateWhatsAppConversationContactName(selectedConversation.id, normalizedName)
    setSavingContactName(false)

    if (!result.success) {
      showToast({
        variant: "error",
        title: "Falha ao atualizar contato",
        description: result.error || "Não foi possível salvar o nome do contato.",
      })
      return
    }

    setEditContactDialogOpen(false)
    await loadConversations({ preserveSelection: true })
    showToast({
      variant: "success",
      title: "Contato atualizado",
      description: "O nome foi salvo com sucesso na agenda.",
    })
  }, [contactNameDraft, loadConversations, savingContactName, selectedConversation, showToast])

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

  const handleOpenContactDetails = useCallback(async () => {
    if (!selectedConversation) return

    const openContactPage = (contactId: string) => {
      if (typeof window === "undefined") return
      window.location.assign(`/admin/contatos/${contactId}`)
    }

    if (selectedConversation.contact_id) {
      openContactPage(selectedConversation.contact_id)
      return
    }

    await withAction(async () => {
      const result = await ensureWhatsAppConversationContact(selectedConversation.id)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao vincular contato",
          description: result.error || "Não foi possível vincular esta conversa a um contato.",
        })
        return
      }

      await loadConversations({ preserveSelection: true })
      openContactPage(result.data.contact_id)
    })
  }, [loadConversations, selectedConversation, showToast, withAction])

  const handleDeleteConversation = useCallback(async () => {
    if (!selectedConversation) return

    await withAction(async () => {
      const result = await deleteWhatsAppConversation(selectedConversation.id)

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao excluir conversa",
          description: result.error || "Não foi possível excluir a conversa.",
        })
        return
      }

      await loadConversations({ preserveSelection: true })
      showToast({
        variant: "success",
        title: "Conversa excluída",
        description: "A conversa e o histórico vinculado foram removidos.",
      })
    })
  }, [loadConversations, selectedConversation, showToast, withAction])

  const handleSyncConversationContacts = useCallback(async () => {
    if (syncingConversationContacts) return
    setSyncingConversationContacts(true)

    const result = await syncWhatsAppConversationContacts({
      onlyMissing: true,
      limit: 400,
    })

    setSyncingConversationContacts(false)

    if (!result.success || !result.data) {
      showToast({
        variant: "error",
        title: "Falha ao sincronizar contatos",
        description: result.error || "Não foi possível sincronizar os contatos das conversas.",
      })
      return
    }

    await loadConversations({ preserveSelection: true })

    showToast({
      variant: result.data.failed > 0 ? "info" : "success",
      title: "Sincronização concluída",
      description: `${result.data.linked} conversa(s) vinculada(s), ${result.data.failed} falha(s).`,
    })
  }, [loadConversations, showToast, syncingConversationContacts])

  const loadRestrictionSettings = useCallback(
    async (conversationId: string) => {
      setLoadingRestrictionSettings(true)
      const result = await getWhatsAppConversationRestrictionSettings(conversationId)
      setLoadingRestrictionSettings(false)

      if (!result.success || !result.data) {
        showToast({
          variant: "error",
          title: "Falha ao carregar restrição",
          description: result.error || "Não foi possível carregar as permissões da conversa.",
        })
        return false
      }

      setRestrictionDraftEnabled(result.data.is_restricted)
      setRestrictionDraftAllowedUserIds(result.data.allowed_user_ids)
      return true
    },
    [showToast]
  )

  const handleOpenRestrictionDialog = useCallback(async () => {
    if (!selectedConversation || !canManageConversationRestrictions) return
    setRestrictionDialogOpen(true)
    const loaded = await loadRestrictionSettings(selectedConversation.id)
    if (!loaded) {
      setRestrictionDialogOpen(false)
    }
  }, [canManageConversationRestrictions, loadRestrictionSettings, selectedConversation])

  const handleToggleRestrictionUser = useCallback((userId: string, checked: boolean) => {
    setRestrictionDraftAllowedUserIds((current) => {
      if (checked) {
        return current.includes(userId) ? current : [...current, userId]
      }
      return current.filter((item) => item !== userId)
    })
  }, [])

  const handleSaveRestrictionSettings = useCallback(async () => {
    if (!selectedConversation || !canManageConversationRestrictions || savingRestrictionSettings) return

    setSavingRestrictionSettings(true)
    const result = await setWhatsAppConversationRestriction(selectedConversation.id, {
      isRestricted: restrictionDraftEnabled,
      allowedUserIds: restrictionDraftEnabled ? restrictionDraftAllowedUserIds : [],
    })
    setSavingRestrictionSettings(false)

    if (!result.success || !result.data) {
      showToast({
        variant: "error",
        title: "Falha ao salvar restrição",
        description: result.error || "Não foi possível atualizar a restrição da conversa.",
      })
      return
    }

    setRestrictionDialogOpen(false)
    await loadConversations({ preserveSelection: true })
  }, [
    canManageConversationRestrictions,
    loadConversations,
    restrictionDraftAllowedUserIds,
    restrictionDraftEnabled,
    savingRestrictionSettings,
    selectedConversation,
    showToast,
  ])

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
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/wav",
      ]

      const mimeType = preferredMimeTypes.find((item) => {
        try {
          return MediaRecorder.isTypeSupported(item)
        } catch {
          return false
        }
      })

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const recorderMimeType = (recorder.mimeType || mimeType || "").toLowerCase()

      if (recorderMimeType.includes("webm")) {
        stream.getTracks().forEach((track) => track.stop())
        showToast({
          variant: "error",
          title: "Formato de áudio não suportado",
          description:
            "Seu navegador está gravando em WEBM, que pode chegar vazio no WhatsApp. Use envio de arquivo MP3/OGG ou outro navegador.",
        })
        return
      }

      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const effectiveType = recorder.mimeType || audioChunksRef.current[0]?.type || "audio/ogg"

        if (effectiveType.toLowerCase().includes("webm")) {
          audioChunksRef.current = []
          mediaRecorderRef.current = null
          stopRecordingTracks()
          showToast({
            variant: "error",
            title: "Formato de áudio não suportado",
            description:
              "Não foi possível enviar o áudio gravado em WEBM. Tente enviar um arquivo MP3/OGG.",
          })
          return
        }

        const extension = effectiveType.includes("ogg")
          ? "ogg"
          : effectiveType.includes("mp4") || effectiveType.includes("m4a")
            ? "m4a"
            : effectiveType.includes("mpeg") || effectiveType.includes("mp3")
              ? "mp3"
              : "wav"

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
    const mediaToSend = pendingMedia
    const hasPendingMedia = Boolean(mediaToSend)

    if (!message && !hasPendingMedia) return

    await withAction(async () => {
      const result = hasPendingMedia
        ? await sendWhatsAppMediaMessage(selectedConversation.id, {
            mediaType: mediaToSend!.mediaType,
            storagePath: mediaToSend!.storagePath,
            fileName: mediaToSend!.fileName,
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
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom("smooth")
        ensureConversationPanelInView()
      })
    })
  }, [
    draft,
    ensureConversationPanelInView,
    loadConversations,
    loadMessages,
    pendingMedia,
    scrollMessagesToBottom,
    selectedConversation,
    showToast,
    withAction,
  ])

  const handleSendReactivationTemplate = useCallback(async () => {
    if (!selectedConversation) return

    await withAction(async () => {
      const result = await sendWhatsAppReactivationTemplate(selectedConversation.id)

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao enviar template",
          description: result.error || "Não foi possível enviar o template de reativação.",
        })
        return
      }

      await loadConversations({ preserveSelection: true })
      await loadMessages(selectedConversation.id)
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom("smooth")
        ensureConversationPanelInView()
      })

      showToast({
        variant: "success",
        title: "Template enviado",
        description: "Template de reativação enviado com sucesso.",
      })
    })
  }, [
    ensureConversationPanelInView,
    loadConversations,
    loadMessages,
    scrollMessagesToBottom,
    selectedConversation,
    showToast,
    withAction,
  ])

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

  const canSend = useMemo<{
    allowed: boolean
    reason: string | null
    code: SendAvailabilityCode
  }>(() => {
    if (!selectedConversation) {
      return { allowed: false, reason: "Selecione uma conversa.", code: "no_conversation" }
    }

    if (!selectedConversation.brand) {
      return {
        allowed: false,
        reason: "Defina a marca da conversa antes do envio.",
        code: "missing_brand",
      }
    }

    if (selectedConversation.status === "CLOSED") {
      return {
        allowed: false,
        reason: "Conversa fechada. Reabra para enviar mensagens.",
        code: "closed",
      }
    }

    if (!isWindowOpen(selectedConversation.window_expires_at)) {
      if (allowOutsideWindowOnZApi) {
        return {
          allowed: true,
          reason:
            "Modo risco ativo: envio fora da janela de 24h liberado para Z-API. Isso pode aumentar risco de bloqueio/restrição.",
          code: "unsafe_window_bypass",
        }
      }

      return {
        allowed: false,
        reason: "Janela de 24h encerrada. O envio de mensagens está bloqueado nesta fase.",
        code: "window_closed",
      }
    }

    return { allowed: true, reason: null as string | null, code: "ready" }
  }, [allowOutsideWindowOnZApi, selectedConversation])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-2">
        <h1 className="text-3xl font-bold">Inbox WhatsApp</h1>
        <p className="text-muted-foreground">
          Atendimento 1:1 via provedor configurado (Meta Cloud API ou Z-API).
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex h-full min-h-0 flex-col rounded-md border bg-white">
          <div className="space-y-3 border-b p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Conversas</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
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
                  disabled={
                    loadingConversations ||
                    loadingMessages ||
                    actionLoading ||
                    syncingConversationContacts
                  }
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${
                      loadingConversations || loadingMessages ? "animate-spin" : ""
                    }`}
                  />
                  Sincronizar
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleSyncConversationContacts()
                  }}
                  disabled={syncingConversationContacts || actionLoading}
                >
                  <UserRound className="h-4 w-4" />
                  {syncingConversationContacts ? "Vinculando..." : "Vincular"}
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

            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(event) => setUnassignedOnly(event.target.checked)}
                />
                Somente não atribuídas
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={missingContactOnly}
                  onChange={(event) => setMissingContactOnly(event.target.checked)}
                />
                Somente sem contato vinculado
              </label>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Visualização</span>
              <div className="inline-flex items-center rounded-md border p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={conversationViewMode === "kanban" ? "secondary" : "ghost"}
                  className="h-7 px-2"
                  onClick={() => setConversationViewMode("kanban")}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Kanban
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={conversationViewMode === "list" ? "secondary" : "ghost"}
                  className="h-7 px-2"
                  onClick={() => setConversationViewMode("list")}
                >
                  <List className="h-3.5 w-3.5" />
                  Lista
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {conversationViewMode === "list" ? (
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
                          <p className="text-xs text-muted-foreground truncate">
                            {conversationWhatsappNumber(conversation)
                              ? formatWhatsAppNumber(conversationWhatsappNumber(conversation))
                              : "Sem número WhatsApp válido"}
                          </p>
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
                        {conversation.is_restricted ? (
                          <Badge variant="destructive">
                            <Lock className="mr-1 h-3 w-3" />
                            Restrita
                          </Badge>
                        ) : null}
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
            ) : (
              <div className="p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Quadro Kanban ativo</p>
                <p>As colunas estão separadas por marca com rolagem independente.</p>
                <p>Selecione uma conversa no Kanban para abrir o painel flutuante.</p>
              </div>
            )}
          </ScrollArea>
        </div>

        <div
          className={`h-full min-h-0 rounded-md border ${
            conversationViewMode === "kanban"
              ? "relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100"
              : "flex min-h-0 flex-col bg-white"
          }`}
        >
          {conversationViewMode === "kanban" ? (
            <ScrollArea
              scrollbarOrientation="both"
              className="h-full w-full [&_[data-radix-scroll-area-viewport]]:overflow-x-auto [&_[data-radix-scroll-area-viewport]]:overflow-y-hidden [&_[data-radix-scroll-area-viewport]]:scroll-smooth [&_[data-radix-scroll-area-viewport]]:[touch-action:pan-x] [&_[data-radix-scroll-area-viewport]]:[-webkit-overflow-scrolling:touch]"
            >
              <div className="h-full min-w-[1700px] p-4">
                <div className="grid h-full grid-cols-5 grid-rows-[minmax(0,1fr)] gap-4">
                  {KANBAN_BRAND_COLUMNS.map((columnKey) => {
                    const columnConversations = conversationsByKanbanColumn[columnKey]
                    return (
                      <div
                        key={columnKey}
                        className="flex h-full min-h-0 flex-col rounded-xl border bg-white/85 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/75"
                      >
                        <div className="flex items-center justify-between border-b px-3 py-2">
                          <p className="text-sm font-semibold">{KANBAN_COLUMN_LABELS[columnKey]}</p>
                          <Badge variant="secondary">{columnConversations.length}</Badge>
                        </div>
                        <ScrollArea className="min-h-0 flex-1 px-2 pb-2 [&_[data-radix-scroll-area-viewport]]:scroll-smooth [&_[data-radix-scroll-area-viewport]]:[touch-action:pan-y]">
                          <div className="space-y-2 pt-2">
                            {columnConversations.map((conversation) => {
                              const isSelected = conversation.id === selectedConversationId
                              return (
                                <button
                                  type="button"
                                  key={conversation.id}
                                  onClick={() => setSelectedConversationId(conversation.id)}
                                  className={`w-full rounded-lg border bg-white p-2.5 text-left transition-all ${
                                    isSelected
                                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                      : "border-slate-200 hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-medium">
                                      {conversationDisplayName(conversation)}
                                    </p>
                                    {conversation.unread_count > 0 ? (
                                      <Badge variant="default">{conversation.unread_count}</Badge>
                                    ) : null}
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {conversationWhatsappNumber(conversation)
                                      ? formatWhatsAppNumber(conversationWhatsappNumber(conversation))
                                      : "Sem número WhatsApp válido"}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-1">
                                    <Badge variant={conversation.brand ? "secondary" : "outline"}>
                                      {conversation.brand
                                        ? BRAND_LABELS[conversation.brand as ConversationBrand]
                                        : "Sem marca"}
                                    </Badge>
                                    {conversation.is_restricted ? (
                                      <Badge variant="destructive">
                                        <Lock className="mr-1 h-3 w-3" />
                                        Restrita
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {conversation.assigned_user_name || "Não atribuído"}
                                  </p>
                                </button>
                              )
                            })}

                            {columnConversations.length === 0 ? (
                              <div className="rounded-md border border-dashed bg-white px-3 py-5 text-center text-xs text-muted-foreground">
                                Sem conversas
                              </div>
                            ) : null}
                          </div>
                        </ScrollArea>
                      </div>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>
          ) : null}

          <div
            ref={conversationPanelRef}
            className={
              conversationViewMode === "kanban"
                ? `absolute inset-y-3 right-3 z-20 w-[min(780px,calc(100%-1.5rem))] rounded-xl border bg-white shadow-2xl overflow-hidden ${
                    selectedConversation ? "flex min-h-0 flex-col" : "hidden"
                  }`
                : "flex h-full min-h-0 flex-col"
            }
          >
            {selectedConversation ? (
            <>
              <div className="border-b px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight">
                      {conversationDisplayName(selectedConversation)}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        {conversationWhatsappNumber(selectedConversation)
                          ? formatWhatsAppNumber(conversationWhatsappNumber(selectedConversation))
                          : "Sem número WhatsApp válido"}
                      </p>
                      {selectedConversation.is_restricted ? (
                        <Badge variant="destructive">
                          <Lock className="mr-1 h-3 w-3" />
                          Conversa restrita
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      variant={selectedConversationPinnedNote ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        if (!selectedConversationPinnedNote) {
                          setPinnedNoteEditorOpen(true)
                          return
                        }

                        if (isSelectedPinnedNoteHidden) {
                          showConversationPinnedNote(selectedConversation.id)
                          return
                        }

                        setPinnedNoteEditorOpen((current) => !current)
                      }}
                      disabled={actionLoading}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {!selectedConversationPinnedNote
                        ? "Ativar nota fixa"
                        : isSelectedPinnedNoteHidden
                          ? "Mostrar nota"
                          : pinnedNoteEditorOpen
                            ? "Fechar editor"
                            : "Editar nota"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setConversationInfoOpen((current) => !current)}
                      disabled={actionLoading}
                    >
                      <Info className="h-3.5 w-3.5" />
                      Informações
                      {conversationInfoOpen ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    {conversationViewMode === "kanban" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        onClick={() => setSelectedConversationId(null)}
                        disabled={actionLoading}
                      >
                        <X className="h-3.5 w-3.5" />
                        Fechar painel
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-1.5 md:grid-cols-[200px_220px_minmax(0,1fr)]">
                  <Select
                    value={selectedConversation.brand || "__none"}
                    onValueChange={(value) => {
                      if (value === "__none") return
                      void handleSetBrand(value as ConversationBrand)
                    }}
                    disabled={actionLoading}
                  >
                    <SelectTrigger className="h-9 text-sm">
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
                      const nextAssigneeId = value === "__none" ? null : value
                      void handleAssign(nextAssigneeId, {
                        transferNote: transferNoteDraft,
                      })
                    }}
                    disabled={actionLoading}
                  >
                    <SelectTrigger className="h-9 text-sm">
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

                  <div className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground flex min-h-9 items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>Janela até: {formatDateTime(selectedConversation.window_expires_at)}</span>
                  </div>
                </div>

                {pinnedNoteEditorOpen ? (
                  <div className="space-y-2 rounded-md border bg-slate-50/80 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Editor de nota fixa
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setPinnedNoteEditorOpen(false)}
                        disabled={actionLoading}
                      >
                        <X className="h-3.5 w-3.5" />
                        Fechar
                      </Button>
                    </div>

                    <Textarea
                      value={pinnedNoteDraft}
                      onChange={(event) => setPinnedNoteDraft(event.target.value)}
                      placeholder="Escreva uma nota interna para esta conversa."
                      rows={2}
                      className="min-h-0 bg-white"
                      disabled={actionLoading}
                    />

                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Select
                        value={pinnedNoteTargetUserId}
                        onValueChange={setPinnedNoteTargetUserId}
                        disabled={actionLoading}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Direcionar para (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sem destinatário</SelectItem>
                          {initialAgents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name || agent.email || agent.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={handleSavePinnedNote}
                        disabled={actionLoading || !pinnedNoteDraft.trim()}
                      >
                        {selectedConversationPinnedNote ? "Atualizar" : "Fixar"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={handleClearPinnedNote}
                        disabled={actionLoading || !selectedConversationPinnedNote}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </div>

                    <Input
                      value={transferNoteDraft}
                      onChange={(event) => setTransferNoteDraft(event.target.value)}
                      placeholder="Nota para próxima transferência de responsável (opcional)"
                      className="h-8 text-xs bg-white"
                      disabled={actionLoading}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ao trocar o responsável, essa nota fica fixada automaticamente e direcionada ao
                      novo atendente.
                    </p>
                  </div>
                ) : null}

                {conversationInfoOpen ? (
                  <div className="space-y-2 rounded-md border bg-slate-50/80 p-2.5">
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">Número da conversa</p>
                        <p>
                          {conversationWhatsappNumber(selectedConversation)
                            ? formatWhatsAppNumber(conversationWhatsappNumber(selectedConversation))
                            : "Sem número WhatsApp válido"}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">Contato vinculado</p>
                        <p>{selectedConversation.contact_name || "Sem contato vinculado"}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">WhatsApp no contato</p>
                        <p>
                          {normalizeLikelyWhatsAppPhone(selectedConversation.contact_whatsapp)
                            ? formatWhatsAppNumber(selectedConversation.contact_whatsapp)
                            : "Sem WhatsApp no contato"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedConversation.status === "CLOSED" ? (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={actionLoading}
                          onClick={() => {
                            void handleCloseOrReopen()
                          }}
                        >
                          Reabrir conversa
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              disabled={actionLoading}
                            >
                              Fechar conversa
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Tem certeza que deseja fechar essa conversa?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Você poderá reabrir a conversa depois, se precisar.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  void handleCloseOrReopen()
                                }}
                                disabled={actionLoading}
                              >
                                Fechar conversa
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={actionLoading}
                          >
                            Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Tem certeza que deseja excluir esta conversa?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação remove permanentemente mensagens, eventos e vínculos da
                              conversa. Não será possível desfazer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                void handleDeleteConversation()
                              }}
                              disabled={actionLoading}
                            >
                              Excluir conversa
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={actionLoading}
                        onClick={() => {
                          void handleAssign(
                            selectedConversation.assigned_user_id === currentUserId
                              ? null
                              : currentUserId
                          )
                        }}
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        {selectedConversation.assigned_user_id === currentUserId
                          ? "Liberar"
                          : "Assumir"}
                      </Button>

                      {canManageConversationRestrictions ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={actionLoading || savingRestrictionSettings}
                          onClick={() => {
                            void handleOpenRestrictionDialog()
                          }}
                        >
                          {selectedConversation.is_restricted ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                          {selectedConversation.is_restricted
                            ? "Gerenciar restrição"
                            : "Restringir"}
                        </Button>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={actionLoading}
                        onClick={() => {
                          void handleOpenContactDetails()
                        }}
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        {selectedConversation.contact_id ? "Ver contato" : "Vincular contato"}
                      </Button>

                      <Dialog
                        open={editContactDialogOpen}
                        onOpenChange={(open) => {
                          setEditContactDialogOpen(open)
                          if (open && selectedConversation) {
                            setContactNameDraft(conversationDisplayName(selectedConversation))
                          }
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={actionLoading || savingContactName}
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Editar contato
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Editar contato</DialogTitle>
                            <DialogDescription>
                              Atualize o nome exibido nesta conversa e salve no cadastro de contatos.
                            </DialogDescription>
                          </DialogHeader>

                          <Input
                            value={contactNameDraft}
                            onChange={(event) => setContactNameDraft(event.target.value)}
                            placeholder="Nome do contato"
                            disabled={savingContactName}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                void handleSaveContactName()
                              }
                            }}
                          />

                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setEditContactDialogOpen(false)}
                              disabled={savingContactName}
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={() => {
                                void handleSaveContactName()
                              }}
                              disabled={savingContactName}
                            >
                              {savingContactName ? "Salvando..." : "Salvar contato"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ) : null}
              </div>

              {canManageConversationRestrictions ? (
                <Dialog open={restrictionDialogOpen} onOpenChange={setRestrictionDialogOpen}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Permissões da conversa</DialogTitle>
                      <DialogDescription>
                        Conversas restritas ficam sempre visíveis para adm_mestre e adm_dorata.
                      </DialogDescription>
                    </DialogHeader>

                    {loadingRestrictionSettings ? (
                      <p className="text-sm text-muted-foreground">Carregando configurações...</p>
                    ) : (
                      <div className="space-y-4">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={restrictionDraftEnabled}
                            onChange={(event) => {
                              setRestrictionDraftEnabled(event.target.checked)
                            }}
                            disabled={savingRestrictionSettings}
                          />
                          Restringir esta conversa
                        </label>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">Usuários liberados (além dos admins)</p>
                          <ScrollArea className="h-52 rounded-md border p-2">
                            <div className="space-y-2">
                              {initialAgents.map((agent) => {
                                const checked = restrictionDraftAllowedUserIds.includes(agent.id)
                                const label = agent.name || agent.email || agent.id

                                return (
                                  <label
                                    key={agent.id}
                                    className="flex items-center gap-2 rounded-md border bg-white px-2 py-1.5 text-sm"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onChange={(event) => {
                                        handleToggleRestrictionUser(agent.id, event.target.checked)
                                      }}
                                      disabled={!restrictionDraftEnabled || savingRestrictionSettings}
                                    />
                                    <span className="truncate">{label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    )}

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setRestrictionDialogOpen(false)}
                        disabled={savingRestrictionSettings}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => {
                          void handleSaveRestrictionSettings()
                        }}
                        disabled={loadingRestrictionSettings || savingRestrictionSettings}
                      >
                        {savingRestrictionSettings ? "Salvando..." : "Salvar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : null}

              <div className="relative min-h-0 flex-1">
                {showFloatingPinnedNote && selectedConversationPinnedNote ? (
                  <div className="absolute right-4 top-4 z-20 w-[min(420px,calc(100%-2rem))] rounded-lg border border-yellow-300 bg-yellow-50/95 p-3 shadow-lg backdrop-blur">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-yellow-900">Nota fixa interna</p>
                        <p className="text-xs text-yellow-900/80">
                          Atualizada em {formatDateTime(selectedConversationPinnedNote.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-yellow-900 hover:text-yellow-900"
                          onClick={() => hideConversationPinnedNote(selectedConversation.id)}
                          disabled={actionLoading}
                        >
                          <X className="h-3.5 w-3.5" />
                          Fechar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] border-yellow-300 bg-white text-yellow-900 hover:bg-yellow-100"
                          onClick={handleClearPinnedNote}
                          disabled={actionLoading}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 rounded-md border border-yellow-200 bg-white px-2.5 py-2 text-sm text-yellow-950">
                      <p className="whitespace-pre-wrap">{selectedConversationPinnedNote.text}</p>
                      {selectedConversationPinnedNote.targetUserName ? (
                        <p className="mt-1 text-xs font-medium text-yellow-900">
                          Para: {selectedConversationPinnedNote.targetUserName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <ScrollArea
                  ref={messagesScrollAreaRef}
                  className="h-full bg-slate-50/40 p-4 [&_[data-radix-scroll-area-viewport]]:scroll-smooth"
                >
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
                      const hasAudioPlayer = message.message_type === "audio" && Boolean(message.media_url)
                      const hasDocumentLink = message.message_type === "document" && Boolean(message.media_url)
                      const hasImageLink = message.message_type === "image" && Boolean(message.media_url)
                      const hideBodyText = hasAudioPlayer && isAudioPlaceholderText(message.body_text)

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
                            {!hideBodyText ? (
                              <p className="whitespace-pre-wrap">{message.body_text || "(sem conteúdo)"}</p>
                            ) : null}
                            {hasAudioPlayer ? (
                              <>
                                <audio
                                  controls
                                  preload="none"
                                  src={message.media_url || undefined}
                                  className={hideBodyText ? "" : "mt-2"}
                                />
                                <a
                                  href={message.media_url || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`mt-2 inline-block text-xs underline ${
                                    isOutbound ? "text-blue-100" : "text-blue-700"
                                  }`}
                                >
                                  Abrir áudio em nova guia
                                </a>
                              </>
                            ) : null}
                            {hasDocumentLink ? (
                              <a
                                href={message.media_url || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-2 inline-block text-xs underline ${
                                  isOutbound ? "text-blue-100" : "text-blue-700"
                                }`}
                              >
                                {message.media_file_name || "Abrir documento"}
                              </a>
                            ) : null}
                            {hasImageLink ? (
                              <a
                                href={message.media_url || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className={`mt-2 inline-block text-xs underline ${
                                  isOutbound ? "text-blue-100" : "text-blue-700"
                                }`}
                              >
                                Abrir imagem
                              </a>
                            ) : null}
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
              </div>

              <div className="shrink-0 space-y-2 border-t p-4">
                {!canSend.allowed ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {canSend.reason}
                    {canSend.code === "window_closed" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void handleSendReactivationTemplate()
                          }}
                          disabled={actionLoading || uploadingMedia || recordingAudio}
                        >
                          <Send className="h-4 w-4" />
                          Enviar template de reativação
                        </Button>
                        <span className="text-xs text-amber-900/90">
                          Fora da janela, mantenha o contato via template oficial.
                        </span>
                      </div>
                    ) : null}
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
    </div>
  )
}
