"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import {
    AudioLines,
    Download,
    Paperclip,
    Loader2,
    MessageSquareText,
    Play,
    Plus,
    RefreshCcw,
    Send,
    Trash2,
    TriangleAlert,
    UserRound,
    X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useDebounce } from "@/hooks/use-debounce"
import {
    MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE,
    type InternalChatAttachmentRetentionPolicy,
} from "@/lib/internal-chat-attachment-config"
import {
    formatInternalChatAttachmentSize,
    uploadInternalChatAttachments,
    validateInternalChatAttachmentFiles,
} from "@/lib/internal-chat-attachments"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
    deleteMessageAttachment,
    getAttachmentDownloadUrl,
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

function getRetentionLabel(value: InternalChatAttachmentRetentionPolicy) {
    if (value === "download_24h") return "Apaga 24h após 1º download"
    if (value === "download_30d") return "Apaga 30 dias após 1º download"
    return "Exclusão manual"
}

function formatRecordingDuration(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds))
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function hasAudioAttachmentMimeOrName(contentType: string | null | undefined, fileName: string | null | undefined) {
    const normalizedType = (contentType ?? "").trim().toLowerCase()
    if (normalizedType.startsWith("audio/")) return true

    const normalizedFileName = (fileName ?? "").trim().toLowerCase()
    return (
        normalizedFileName.endsWith(".mp3")
        || normalizedFileName.endsWith(".ogg")
        || normalizedFileName.endsWith(".wav")
        || normalizedFileName.endsWith(".m4a")
        || normalizedFileName.endsWith(".aac")
    )
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
    const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
    const [retentionPolicy, setRetentionPolicy] = useState<InternalChatAttachmentRetentionPolicy>("manual")

    const [conversationSearch, setConversationSearch] = useState("")
    const [isLoadingConversations, setIsLoadingConversations] = useState(false)
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null)
    const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null)
    const [loadingAudioAttachmentId, setLoadingAudioAttachmentId] = useState<string | null>(null)
    const [audioAttachmentUrls, setAudioAttachmentUrls] = useState<Record<string, string>>({})
    const [recordingAudio, setRecordingAudio] = useState(false)
    const [recordingSeconds, setRecordingSeconds] = useState(0)

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
    const messagesScrollAreaRef = useRef<HTMLDivElement | null>(null)
    const attachmentInputRef = useRef<HTMLInputElement | null>(null)
    const audioAttachmentInputRef = useRef<HTMLInputElement | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const mediaStreamRef = useRef<MediaStream | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

    const scrollMessagesViewportToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const scrollAreaRoot = messagesScrollAreaRef.current
        if (!scrollAreaRoot) return

        const viewport = scrollAreaRoot.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null
        if (!viewport) return

        viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior,
        })
    }, [])

    useEffect(() => {
        void loadConversations({
            preserveSelection: true,
            search: debouncedConversationSearch,
            silent: true,
        })
    }, [debouncedConversationSearch, loadConversations])

    useEffect(() => {
        const stopActiveRecording = () => {
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

            setRecordingAudio(false)
            setRecordingSeconds(0)
        }

        if (!selectedConversationId) {
            setMessages([])
            setAttachmentFiles([])
            setAudioAttachmentUrls({})
            stopActiveRecording()
            return
        }

        setAttachmentFiles([])
        setAudioAttachmentUrls({})
        stopActiveRecording()
        void loadMessages(selectedConversationId, { silent: true })
        void markSelectedConversationAsRead(selectedConversationId)
    }, [loadMessages, markSelectedConversationAsRead, selectedConversationId])

    useEffect(() => {
        if (!isNewConversationOpen) return
        void loadAvailableUsers(debouncedUserSearch, { silent: true })
    }, [debouncedUserSearch, isNewConversationOpen, loadAvailableUsers])

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
        scrollMessagesViewportToBottom("auto")
    }, [messages, selectedConversationId, scrollMessagesViewportToBottom])

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

    const appendAttachmentFiles = useCallback(
        (nextFiles: File[]) => {
            if (nextFiles.length === 0) return

            setAttachmentFiles((previous) => {
                const mergedFiles = [...previous, ...nextFiles]
                const validationError = validateInternalChatAttachmentFiles(mergedFiles, {
                    maxCount: MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE,
                })

                if (validationError) {
                    showToast({
                        variant: "error",
                        title: "Anexo inválido",
                        description: validationError,
                    })
                    return previous
                }

                return mergedFiles
            })
        },
        [showToast]
    )

    const handleAttachmentChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const nextFiles = Array.from(event.target.files ?? [])
            if (nextFiles.length === 0) return

            appendAttachmentFiles(nextFiles)
            event.target.value = ""
        },
        [appendAttachmentFiles]
    )

    const handleAudioAttachmentChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const nextFiles = Array.from(event.target.files ?? [])
            if (nextFiles.length === 0) return

            appendAttachmentFiles(nextFiles)
            event.target.value = ""
        },
        [appendAttachmentFiles]
    )

    const stopRecordingTimer = useCallback(() => {
        if (!recordingIntervalRef.current) return
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
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

        if (recordingAudio || isSending) return

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
                appendAttachmentFiles([file])
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
                setRecordingSeconds((previous) => previous + 1)
            }, 1000)
        } catch (error) {
            stopRecordingTracks()
            showToast({
                variant: "error",
                title: "Permissão negada",
                description: error instanceof Error
                    ? error.message
                    : "Autorize o microfone para gravar áudio no chat.",
            })
        }
    }, [
        appendAttachmentFiles,
        isSending,
        recordingAudio,
        selectedConversation,
        showToast,
        stopAudioRecording,
        stopRecordingTimer,
        stopRecordingTracks,
    ])

    const handleAudioButtonClick = useCallback(() => {
        if (recordingAudio) {
            stopAudioRecording()
            return
        }
        void startAudioRecording()
    }, [recordingAudio, startAudioRecording, stopAudioRecording])

    const handleRemoveSelectedAttachment = useCallback((index: number) => {
        setAttachmentFiles((previous) => previous.filter((_, currentIndex) => currentIndex !== index))
    }, [])

    const handleSendMessage = useCallback(async () => {
        const conversationId = selectedConversationIdRef.current
        if (!conversationId || isSending) return
        if (recordingAudio) return

        const messageText = draft.trim()
        const hasAttachments = attachmentFiles.length > 0
        if (!messageText && !hasAttachments) return

        if (messageText.length > 2000) {
            showToast({
                variant: "error",
                title: "Mensagem muito longa",
                description: "Limite de 2.000 caracteres por mensagem.",
            })
            return
        }

        const attachmentValidation = validateInternalChatAttachmentFiles(attachmentFiles, {
            maxCount: MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE,
        })
        if (attachmentValidation) {
            showToast({
                variant: "error",
                title: "Anexos inválidos",
                description: attachmentValidation,
            })
            return
        }

        setIsSending(true)

        let uploadedAttachments: Awaited<ReturnType<typeof uploadInternalChatAttachments>>["uploaded"] = []
        if (hasAttachments) {
            const uploadResult = await uploadInternalChatAttachments(
                conversationId,
                attachmentFiles,
                retentionPolicy,
                { maxCount: MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE }
            )

            if (uploadResult.error || uploadResult.failed.length > 0) {
                setIsSending(false)
                showToast({
                    variant: "error",
                    title: "Falha ao enviar anexos",
                    description: uploadResult.error
                        ?? `Falha ao enviar ${uploadResult.failed.length} anexo(s).`,
                })
                return
            }

            uploadedAttachments = uploadResult.uploaded
        }

        const result = await sendMessage(conversationId, messageText, {
            attachments: uploadedAttachments,
        })
        setIsSending(false)

        if (!result.success) {
            showToast({
                variant: "error",
                title: "Falha ao enviar mensagem",
                description: result.error,
            })
            return
        }

        if (uploadedAttachments.length > 0 && result.data.attachments.length !== uploadedAttachments.length) {
            showToast({
                variant: "info",
                title: "Mensagem enviada com alerta",
                description: "Alguns anexos não foram vinculados. Reenvie os anexos faltantes.",
            })
        }

        setDraft("")
        setAttachmentFiles([])
        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = ""
        }
        setMessages((prev) => [...prev, result.data])
        await loadConversations({
            preserveSelection: true,
            search: conversationSearchRef.current,
            silent: true,
        })
    }, [attachmentFiles, draft, isSending, loadConversations, recordingAudio, retentionPolicy, showToast])

    const handleDownloadAttachment = useCallback(
        async (attachmentId: string) => {
            if (downloadingAttachmentId) return
            setDownloadingAttachmentId(attachmentId)
            const result = await getAttachmentDownloadUrl(attachmentId)
            setDownloadingAttachmentId(null)

            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Falha ao baixar anexo",
                    description: result.error,
                })
                return
            }

            window.open(result.data.url, "_blank", "noopener,noreferrer")
            const activeConversationId = selectedConversationIdRef.current
            if (activeConversationId) {
                void loadMessages(activeConversationId, { silent: true })
            }
        },
        [downloadingAttachmentId, loadMessages, showToast]
    )

    const handleLoadAudioAttachment = useCallback(
        async (attachmentId: string) => {
            if (audioAttachmentUrls[attachmentId]) return
            if (loadingAudioAttachmentId) return

            setLoadingAudioAttachmentId(attachmentId)
            const result = await getAttachmentDownloadUrl(attachmentId)
            setLoadingAudioAttachmentId(null)

            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Falha ao carregar áudio",
                    description: result.error,
                })
                return
            }

            setAudioAttachmentUrls((previous) => ({
                ...previous,
                [attachmentId]: result.data.url,
            }))

            const activeConversationId = selectedConversationIdRef.current
            if (activeConversationId) {
                void loadMessages(activeConversationId, { silent: true })
            }
        },
        [audioAttachmentUrls, loadingAudioAttachmentId, loadMessages, showToast]
    )

    const handleDeleteAttachment = useCallback(
        async (attachmentId: string) => {
            if (deletingAttachmentId) return
            const confirmed = window.confirm("Apagar este anexo permanentemente?")
            if (!confirmed) return

            setDeletingAttachmentId(attachmentId)
            const result = await deleteMessageAttachment(attachmentId)
            setDeletingAttachmentId(null)

            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Falha ao apagar anexo",
                    description: result.error,
                })
                return
            }

            setMessages((previous) =>
                previous.map((message) => ({
                    ...message,
                    attachments: message.attachments.filter((attachment) => attachment.id !== attachmentId),
                }))
            )
            setAudioAttachmentUrls((previous) => {
                if (!previous[attachmentId]) return previous
                const next = { ...previous }
                delete next[attachmentId]
                return next
            })
            showToast({
                variant: "success",
                title: "Anexo apagado",
                description: "O anexo foi removido do chat.",
            })
        },
        [deletingAttachmentId, showToast]
    )

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

                        <ScrollArea ref={messagesScrollAreaRef} className="h-[52vh] bg-slate-50/40 px-4 py-4">
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
                                                {message.attachments.length > 0 && (
                                                    <div className="mt-2 space-y-2">
                                                        {message.attachments.map((attachment) => {
                                                            const isDeleting = deletingAttachmentId === attachment.id
                                                            const isDownloading = downloadingAttachmentId === attachment.id
                                                            const isAudioAttachment = hasAudioAttachmentMimeOrName(
                                                                attachment.content_type,
                                                                attachment.original_name
                                                            )
                                                            const audioUrl = audioAttachmentUrls[attachment.id] ?? null
                                                            const isLoadingAudio = loadingAudioAttachmentId === attachment.id

                                                            return (
                                                                <div
                                                                    key={attachment.id}
                                                                    className={cn(
                                                                        "rounded-lg border px-2 py-1.5 text-xs",
                                                                        isMine
                                                                            ? "border-primary-foreground/30 bg-primary-foreground/10"
                                                                            : "border-slate-200 bg-slate-50"
                                                                    )}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-medium">
                                                                                {attachment.original_name}
                                                                            </p>
                                                                            <p
                                                                                className={cn(
                                                                                    "truncate opacity-80",
                                                                                    isMine ? "text-primary-foreground/90" : "text-muted-foreground"
                                                                                )}
                                                                            >
                                                                                {formatInternalChatAttachmentSize(attachment.size_bytes)}
                                                                                {" • "}
                                                                                {getRetentionLabel(attachment.retention_policy)}
                                                                                {attachment.expires_at && (
                                                                                    <>{" • expira em "}{formatRelativeDate(attachment.expires_at)}</>
                                                                                )}
                                                                            </p>
                                                                        </div>

                                                                        <div className="flex items-center gap-1">
                                                                            <Button
                                                                                type="button"
                                                                                size="icon"
                                                                                variant={isMine ? "secondary" : "outline"}
                                                                                className="h-7 w-7"
                                                                                onClick={() => void handleDownloadAttachment(attachment.id)}
                                                                                disabled={isDownloading || isDeleting}
                                                                            >
                                                                                {isDownloading ? (
                                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                ) : (
                                                                                    <Download className="h-3.5 w-3.5" />
                                                                                )}
                                                                            </Button>
                                                                            {(isMine || attachment.uploaded_by_user_id === currentUserId) && (
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    variant="destructive"
                                                                                    className="h-7 w-7"
                                                                                    onClick={() => void handleDeleteAttachment(attachment.id)}
                                                                                    disabled={isDeleting || isDownloading}
                                                                                >
                                                                                    {isDeleting ? (
                                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                    ) : (
                                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                                    )}
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {isAudioAttachment && (
                                                                        <div className="mt-2 space-y-1">
                                                                            {!audioUrl && (
                                                                                <Button
                                                                                    type="button"
                                                                                    size="sm"
                                                                                    variant={isMine ? "secondary" : "outline"}
                                                                                    className="h-7 text-[11px]"
                                                                                    onClick={() => void handleLoadAudioAttachment(attachment.id)}
                                                                                    disabled={isLoadingAudio || isDeleting}
                                                                                >
                                                                                    {isLoadingAudio ? (
                                                                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                                                                    ) : (
                                                                                        <Play className="mr-1 h-3.5 w-3.5" />
                                                                                    )}
                                                                                    Ouvir áudio
                                                                                </Button>
                                                                            )}
                                                                            {audioUrl && (
                                                                                <audio
                                                                                    controls
                                                                                    preload="none"
                                                                                    src={audioUrl}
                                                                                    className="w-full"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
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

                            </div>
                        </ScrollArea>

                        <Separator />

                        <div className="space-y-2 p-4">
                            <input
                                ref={audioAttachmentInputRef}
                                type="file"
                                accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.ogg,.wav,.m4a,.aac"
                                className="hidden"
                                onChange={handleAudioAttachmentChange}
                                disabled={isSending}
                            />

                            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                                <Input
                                    ref={attachmentInputRef}
                                    type="file"
                                    multiple
                                    onChange={handleAttachmentChange}
                                    disabled={isSending || !selectedConversation}
                                />
                                <select
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    value={retentionPolicy}
                                    onChange={(event) => {
                                        const nextValue = event.target.value
                                        if (nextValue === "download_24h" || nextValue === "download_30d") {
                                            setRetentionPolicy(nextValue)
                                            return
                                        }
                                        setRetentionPolicy("manual")
                                    }}
                                    disabled={isSending}
                                >
                                    <option value="manual">Exclusão manual</option>
                                    <option value="download_24h">Apagar 24h após download</option>
                                    <option value="download_30d">Apagar 30 dias após download</option>
                                </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => audioAttachmentInputRef.current?.click()}
                                    disabled={isSending || !selectedConversation}
                                >
                                    <AudioLines className="mr-1 h-4 w-4" />
                                    Selecionar áudio
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={recordingAudio ? "destructive" : "outline"}
                                    onClick={() => void handleAudioButtonClick()}
                                    disabled={isSending || !selectedConversation}
                                >
                                    <AudioLines className="mr-1 h-4 w-4" />
                                    {recordingAudio ? "Parar gravação" : "Gravar áudio"}
                                </Button>
                            </div>

                            {recordingAudio && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    Gravando áudio... {formatRecordingDuration(recordingSeconds)}
                                </div>
                            )}

                            {attachmentFiles.length > 0 && (
                                <div className="space-y-1 rounded-md border bg-slate-50 px-3 py-2">
                                    {attachmentFiles.map((file, index) => (
                                        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-slate-900">{file.name}</p>
                                                <p className="text-muted-foreground">{formatInternalChatAttachmentSize(file.size)}</p>
                                            </div>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7"
                                                onClick={() => handleRemoveSelectedAttachment(index)}
                                                disabled={isSending}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground">
                                Anexos do chat: até {MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE} arquivos por mensagem, com máximo de 100MB por arquivo.
                            </p>

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
                                    <span>{draft.length}/2000 caracteres</span>
                                    <span className="mx-2">•</span>
                                    <span>{attachmentFiles.length}/{MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE} anexos</span>
                                </p>

                                <Button
                                    type="button"
                                    onClick={() => void handleSendMessage()}
                                    disabled={isSending || recordingAudio || (draft.trim().length === 0 && attachmentFiles.length === 0)}
                                >
                                    {isSending ? (
                                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            {attachmentFiles.length > 0 ? (
                                                <Paperclip className="mr-1 h-4 w-4" />
                                            ) : (
                                                <Send className="mr-1 h-4 w-4" />
                                            )}
                                        </>
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
