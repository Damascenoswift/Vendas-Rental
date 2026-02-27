"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, ChevronDown, ChevronUp, Paperclip, Trash2, UserPlus, X } from "lucide-react"

import type { Task, TaskChecklistItem, TaskComment, TaskObserver, TaskPriority, TaskProposalOption } from "@/services/task-service"
import {
    addTaskChecklistItem,
    addTaskComment,
    addTaskObserver,
    activateTaskEnergisa,
    deleteTask,
    deleteTaskChecklistItem,
    getTaskChecklists,
    getTaskComments,
    getTaskAssignableUsers,
    getTaskObservers,
    getTaskProposalOptions,
    removeTaskObserver,
    triggerTaskDocAlert,
    toggleTaskChecklistItem,
    updateTask,
} from "@/services/task-service"
import {
    MAX_TASK_ATTACHMENTS_PER_TASK,
    formatTaskAttachmentSize,
    listTaskAttachments,
    type TaskAttachmentFile,
    uploadTaskAttachments,
    validateTaskAttachmentFiles,
} from "@/lib/task-attachments"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAuthSession } from "@/hooks/use-auth-session"
import { LeadSelect } from "@/components/admin/tasks/lead-select"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { EnergisaActions } from "@/components/admin/interactions/energisa-actions"

interface TaskDetailsDialogProps {
    task: Task | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onTaskDeleted?: (taskId: string) => void
    onChecklistSummaryChange?: (taskId: string, total: number, done: number) => void
    onTaskUpdated?: (taskId: string, updates: Partial<Task>) => void
}

type UserOption = {
    id: string
    name: string
    email: string | null
    department: string | null
    role?: string | null
}

type TaskCommentDisplay = TaskComment & {
    isLegacy?: boolean
}

type MentionContext = {
    start: number
    end: number
    query: string
}

type MentionCandidate = {
    id: string
    name: string
    email: string | null
    alias: string
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: "LOW", label: "Baixa" },
    { value: "MEDIUM", label: "Média" },
    { value: "HIGH", label: "Alta" },
    { value: "URGENT", label: "Urgente" },
]

const formatDateTime = (value?: string | null) => {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    return format(parsed, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

const formatDateOnly = (value?: string | null) => {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    return format(parsed, "dd/MM/yyyy", { locale: ptBR })
}

const getInitials = (name: string) =>
    name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()

const stringToHsl = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = hash % 360
    return `hsl(${h}, 70%, 50%)`
}

const normalizeMentionAlias = (value: string) => {
    const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")

    return normalized || "usuario"
}

const findMentionContext = (content: string, caretPosition: number): MentionContext | null => {
    if (!content) return null

    const caret = Math.max(0, Math.min(caretPosition, content.length))
    const prefix = content.slice(0, caret)
    const atIndex = prefix.lastIndexOf("@")
    if (atIndex < 0) return null

    if (atIndex > 0) {
        const previousChar = prefix[atIndex - 1]
        if (!/[\s([{]/.test(previousChar)) return null
    }

    const query = prefix.slice(atIndex + 1)
    if (query.includes("\n") || /\s/.test(query)) return null

    let end = caret
    while (end < content.length) {
        const char = content[end]
        if (!/[A-Za-z0-9._-]/.test(char)) break
        end += 1
    }

    return {
        start: atIndex,
        end,
        query: query.toLowerCase(),
    }
}

const extractMentionAliases = (content: string) => {
    const aliases = new Set<string>()
    const mentionRegex = /(^|[\s([{])@([A-Za-z0-9][A-Za-z0-9._-]*)/g

    let match: RegExpExecArray | null = mentionRegex.exec(content)
    while (match) {
        aliases.add(match[2].toLowerCase())
        match = mentionRegex.exec(content)
    }

    return Array.from(aliases)
}

const inferChecklistEvent = (item: TaskChecklistItem): string | null => {
    if (item.event_key) return item.event_key
    const normalized = (item.title ?? "").toLowerCase()
    if (normalized.includes("document") && normalized.includes("incomplet")) return "DOCS_INCOMPLETE"
    if (normalized.includes("document") && (normalized.includes("rejeit") || normalized.includes("reprov"))) return "DOCS_REJECTED"
    return null
}

const isDocAlertChecklist = (item: TaskChecklistItem) => {
    const key = inferChecklistEvent(item)
    return key === "DOCS_INCOMPLETE" || key === "DOCS_REJECTED"
}

const normalizeChecklistPhase = (value?: string | null) => {
    if (!value) return null

    const normalized = value.trim().toLowerCase()
    if (!normalized) return null

    if (normalized.includes("cadastro")) return "cadastro"
    if (normalized.includes("energisa")) return "energisa"
    if (normalized.includes("geral") || normalized.includes("general")) return "geral"

    return null
}

export function TaskDetailsDialog({
    task,
    open,
    onOpenChange,
    onTaskDeleted,
    onChecklistSummaryChange,
    onTaskUpdated,
}: TaskDetailsDialogProps) {
    const [checklists, setChecklists] = useState<TaskChecklistItem[]>([])
    const [observers, setObservers] = useState<TaskObserver[]>([])
    const [comments, setComments] = useState<TaskComment[]>([])
    const [attachments, setAttachments] = useState<TaskAttachmentFile[]>([])
    const [users, setUsers] = useState<UserOption[]>([])
    const [newChecklistTitle, setNewChecklistTitle] = useState("")
    const [newChecklistResponsibleId, setNewChecklistResponsibleId] = useState<string>("")
    const [newObserverId, setNewObserverId] = useState<string>("")
    const [newComment, setNewComment] = useState("")
    const [mentionAliasToUserId, setMentionAliasToUserId] = useState<Record<string, string>>({})
    const [activeMentionContext, setActiveMentionContext] = useState<MentionContext | null>(null)
    const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0)
    const [replyTo, setReplyTo] = useState<TaskComment | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSavingChecklist, setIsSavingChecklist] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSavingDetails, setIsSavingDetails] = useState(false)
    const [isSendingComment, setIsSendingComment] = useState(false)
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
    const [isActivatingEnergisa, setIsActivatingEnergisa] = useState(false)
    const [activeDocAlert, setActiveDocAlert] = useState<'DOCS_INCOMPLETE' | 'DOCS_REJECTED' | null>(null)
    const [editDueDate, setEditDueDate] = useState("")
    const [editAssigneeId, setEditAssigneeId] = useState("")
    const [editTitle, setEditTitle] = useState("")
    const [editPriority, setEditPriority] = useState<TaskPriority>("MEDIUM")
    const [editClientName, setEditClientName] = useState("")
    const [editCodigoInstalacao, setEditCodigoInstalacao] = useState("")
    const [editIndicacaoId, setEditIndicacaoId] = useState("")
    const [editContactId, setEditContactId] = useState("")
    const [editProposalId, setEditProposalId] = useState("")
    const [isClientLinkExpanded, setIsClientLinkExpanded] = useState(false)
    const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
    const [proposalOptions, setProposalOptions] = useState<TaskProposalOption[]>([])
    const attachmentInputRef = useRef<HTMLInputElement>(null)
    const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
    const { showToast } = useToast()
    const { session } = useAuthSession()

    const checklistSummary = useMemo(() => {
        const total = checklists.length
        const done = checklists.filter(item => item.is_done).length
        return { total, done }
    }, [checklists])

    const visibleProposalOptions = useMemo(() => {
        if (!task?.brand) return proposalOptions
        return proposalOptions.filter((proposal) => !proposal.brand || proposal.brand === task.brand)
    }, [proposalOptions, task?.brand])

    const cadastroChecklists = useMemo(
        () => checklists.filter((item) => normalizeChecklistPhase(item.phase) === 'cadastro' && !isDocAlertChecklist(item)),
        [checklists]
    )
    const energisaChecklists = useMemo(
        () => checklists.filter((item) => normalizeChecklistPhase(item.phase) === 'energisa'),
        [checklists]
    )
    const generalChecklists = useMemo(
        () => checklists.filter((item) => {
            const phase = normalizeChecklistPhase(item.phase)
            return phase === null || phase === 'geral'
        }),
        [checklists]
    )

    const formattedDueDate = useMemo(() => {
        if (!task?.due_date) return "Sem prazo"
        const parsed = new Date(task.due_date)
        if (Number.isNaN(parsed.getTime())) return "Sem prazo"
        return format(parsed, "dd 'de' MMM 'de' yyyy", { locale: ptBR })
    }, [task?.due_date])

    const formattedEnergisaActivatedAt = useMemo(() => {
        return formatDateTime(task?.energisa_activated_at) || (task?.energisa_activated_at ?? "")
    }, [task?.energisa_activated_at])

    const usersById = useMemo(() => {
        const map = new Map<string, string>()
        users.forEach((user) => {
            map.set(user.id, user.name || user.email || "Usuário")
        })
        return map
    }, [users])
    const responsibleUsers = useMemo(() => {
        return users.filter((user) => {
            const role = (user.role ?? "").trim().toLowerCase()
            if (!role) return false
            if (role.startsWith("vendedor")) return false
            if (role === "investidor") return false
            return (
                role.startsWith("adm_")
                || role.startsWith("funcionario_")
                || role.startsWith("suporte")
                || role === "supervisor"
            )
        })
    }, [users])

    const mentionCandidates = useMemo<MentionCandidate[]>(() => {
        const query = activeMentionContext?.query ?? ""

        const candidates = users.map((user) => {
            const displayName = user.name || user.email || "Usuário"
            return {
                id: user.id,
                name: displayName,
                email: user.email,
                alias: normalizeMentionAlias(displayName),
            } satisfies MentionCandidate
        })

        if (!query) {
            return candidates.slice(0, 8)
        }

        return candidates
            .filter((candidate) => {
                return (
                    candidate.name.toLowerCase().includes(query) ||
                    candidate.alias.includes(query) ||
                    (candidate.email ?? "").toLowerCase().includes(query)
                )
            })
            .slice(0, 8)
    }, [activeMentionContext?.query, users])

    const isMentionMenuOpen = Boolean(activeMentionContext && mentionCandidates.length > 0)

    const commentsToShow = useMemo<TaskCommentDisplay[]>(() => {
        if (!task) return []

        const legacyContent = task.description?.trim()
        if (!legacyContent) return comments

        const legacyComment: TaskCommentDisplay = {
            id: `legacy-${task.id}`,
            task_id: task.id,
            user_id: task.creator_id ?? null,
            parent_id: null,
            content: legacyContent,
            created_at: task.created_at,
            user: task.creator ? { name: task.creator.name, email: null } : null,
            parent: null,
            isLegacy: true,
        }

        const hasLegacyAlready = comments.some((comment) => {
            return (
                comment.content?.trim() === legacyContent &&
                comment.created_at === task.created_at &&
                comment.user_id === (task.creator_id ?? null)
            )
        })

        if (hasLegacyAlready) return comments
        return [legacyComment, ...comments]
    }, [comments, task])

    const currentUserId = session?.user.id ?? null

    useEffect(() => {
        if (!open || !task) return

        setChecklists([])
        setObservers([])
        setComments([])
        setAttachments([])
        setNewChecklistTitle("")
        setNewChecklistResponsibleId("")
        setNewComment("")
        setMentionAliasToUserId({})
        setActiveMentionContext(null)
        setHighlightedMentionIndex(0)
        setReplyTo(null)
        setAttachmentFiles([])
        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = ""
        }
        setEditAssigneeId(task.assignee_id ?? "")
        setEditTitle(task.title ?? "")
        setEditPriority(task.priority ?? "MEDIUM")
        setEditClientName(task.client_name ?? "")
        setEditCodigoInstalacao(task.codigo_instalacao ?? "")
        setEditIndicacaoId(task.indicacao_id ?? "")
        setEditContactId(task.contact_id ?? "")
        setEditProposalId(task.proposal_id ?? "")
        setIsClientLinkExpanded(false)
        if (task.due_date) {
            const parsed = new Date(task.due_date)
            setEditDueDate(Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd"))
        } else {
            setEditDueDate("")
        }

        const load = async () => {
            setIsLoading(true)
            const [checklistResult, observerResult, commentResult, attachmentResult] = await Promise.allSettled([
                getTaskChecklists(task.id),
                getTaskObservers(task.id),
                getTaskComments(task.id),
                listTaskAttachments(task.id),
            ])

            if (checklistResult.status === "fulfilled") {
                setChecklists(checklistResult.value)
            } else {
                console.error("Error loading task checklists:", checklistResult.reason)
                setChecklists([])
            }

            if (observerResult.status === "fulfilled") {
                setObservers(observerResult.value)
            } else {
                console.error("Error loading task observers:", observerResult.reason)
                setObservers([])
            }

            if (commentResult.status === "fulfilled") {
                setComments(commentResult.value)
            } else {
                console.error("Error loading task comments:", commentResult.reason)
                setComments([])
            }

            if (attachmentResult.status === "fulfilled") {
                if (attachmentResult.value.error) {
                    console.error("Error fetching task attachments:", attachmentResult.value.error)
                } else {
                    setAttachments(attachmentResult.value.data)
                }
            } else {
                console.error("Error loading task attachments:", attachmentResult.reason)
            }
            setIsLoading(false)
        }

        load()
    }, [open, task?.id])

    useEffect(() => {
        setHighlightedMentionIndex(0)
    }, [activeMentionContext?.query, isMentionMenuOpen])

    useEffect(() => {
        if (!open || !task) return
        const fetchDependencies = async () => {
            const [userData, proposalData] = await Promise.all([
                getTaskAssignableUsers(),
                getTaskProposalOptions(task.brand),
            ])

            setUsers(
                (userData ?? []).map((user) => ({
                    id: user.id,
                    name: user.name || "Sem Nome",
                    email: user.email,
                    department: user.department,
                    role: user.role ?? null,
                }))
            )
            setProposalOptions(proposalData ?? [])
        }

        fetchDependencies()
    }, [open, task?.id, task?.brand])

    useEffect(() => {
        if (!task) return
        onChecklistSummaryChange?.(task.id, checklistSummary.total, checklistSummary.done)
    }, [checklistSummary.total, checklistSummary.done, onChecklistSummaryChange, task?.id])

    const handleAddChecklist = async () => {
        if (!task) return
        if (!newChecklistTitle.trim()) return
        setIsSavingChecklist(true)
        const result = await addTaskChecklistItem(task.id, newChecklistTitle, {
            responsibleUserId: newChecklistResponsibleId || null,
        })
        if (result?.error) {
            showToast({ title: "Erro ao adicionar checklist", description: result.error, variant: "error" })
        } else {
            const updated = await getTaskChecklists(task.id)
            setChecklists(updated)
            setNewChecklistTitle("")
            setNewChecklistResponsibleId("")
        }
        setIsSavingChecklist(false)
    }

    const handleToggleChecklist = async (item: TaskChecklistItem, nextChecked: boolean) => {
        if (!task) return
        const result = await toggleTaskChecklistItem(item.id, nextChecked)
        const updated = await getTaskChecklists(task.id)
        setChecklists(updated)
        if (result?.error) {
            showToast({ title: "Erro ao atualizar checklist", description: result.error, variant: "error" })
            return
        }
    }

    const handleDeleteChecklist = async (itemId: string) => {
        const result = await deleteTaskChecklistItem(itemId)
        if (result?.error) {
            showToast({ title: "Erro ao remover checklist", description: result.error, variant: "error" })
            return
        }
        setChecklists(prev => prev.filter(item => item.id !== itemId))
    }

    const handleAddObserver = async () => {
        if (!task) return
        if (!newObserverId) return
        const result = await addTaskObserver(task.id, newObserverId)
        if (result?.error) {
            showToast({ title: "Erro ao adicionar observador", description: result.error, variant: "error" })
            return
        }
        const updated = await getTaskObservers(task.id)
        setObservers(updated)
        setNewObserverId("")
    }

    const handleRemoveObserver = async (userId: string) => {
        if (!task) return
        const result = await removeTaskObserver(task.id, userId)
        if (result?.error) {
            showToast({ title: "Erro ao remover observador", description: result.error, variant: "error" })
            return
        }
        setObservers(prev => prev.filter(obs => obs.user_id !== userId))
    }

    const refreshMentionContext = (value: string, caretPosition: number) => {
        const context = findMentionContext(value, caretPosition)
        setActiveMentionContext(context)
        if (!context) {
            setHighlightedMentionIndex(0)
        }
    }

    const handleCommentInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value
        const caretPosition = event.target.selectionStart ?? value.length
        setNewComment(value)
        refreshMentionContext(value, caretPosition)
    }

    const applyMentionCandidate = (candidate: MentionCandidate) => {
        const textarea = commentTextareaRef.current
        if (!textarea) return

        const caretPosition = textarea.selectionStart ?? newComment.length
        const context = findMentionContext(newComment, caretPosition)
        if (!context) return

        const baseAlias = candidate.alias || normalizeMentionAlias(candidate.name)
        let uniqueAlias = baseAlias
        let suffix = 2

        while (
            mentionAliasToUserId[uniqueAlias] &&
            mentionAliasToUserId[uniqueAlias] !== candidate.id
        ) {
            uniqueAlias = `${baseAlias}.${suffix}`
            suffix += 1
        }

        const mentionToken = `@${uniqueAlias} `
        const nextValue = `${newComment.slice(0, context.start)}${mentionToken}${newComment.slice(context.end)}`

        setMentionAliasToUserId((prev) => ({
            ...prev,
            [uniqueAlias]: candidate.id,
        }))
        setNewComment(nextValue)
        setActiveMentionContext(null)
        setHighlightedMentionIndex(0)

        const nextCaret = context.start + mentionToken.length
        requestAnimationFrame(() => {
            textarea.focus()
            textarea.setSelectionRange(nextCaret, nextCaret)
        })
    }

    const handleDeleteTask = async () => {
        if (!task) return
        if (!confirm("Deseja realmente excluir esta tarefa?")) return
        setIsDeleting(true)
        const result = await deleteTask(task.id)
        if (result?.error) {
            showToast({ title: "Erro ao excluir tarefa", description: result.error, variant: "error" })
            setIsDeleting(false)
            return
        }
        onTaskDeleted?.(task.id)
        setIsDeleting(false)
        onOpenChange(false)
    }

    const handleSendComment = async () => {
        if (!task) return
        if (!newComment.trim()) return

        const mentionAliases = extractMentionAliases(newComment)
        const mentionIds = Array.from(
            new Set(
                mentionAliases
                    .map((alias) => mentionAliasToUserId[alias])
                    .filter((id): id is string => Boolean(id))
            )
        )
        const commentForSave = newComment.replace(
            /(^|[\s([{])@([A-Za-z0-9][A-Za-z0-9._-]*)/g,
            (_fullMatch, prefix: string, aliasRaw: string) => {
                const alias = aliasRaw.toLowerCase()
                const userId = mentionAliasToUserId[alias]
                if (!userId) return `${prefix}@${aliasRaw}`

                const mentionedUser = users.find((candidate) => candidate.id === userId)
                const displayName = mentionedUser?.name?.trim() || mentionedUser?.email?.trim()
                if (!displayName) return `${prefix}@${aliasRaw}`

                return `${prefix}@${displayName}`
            }
        )

        setIsSendingComment(true)
        const result = await addTaskComment(task.id, commentForSave, replyTo?.id, mentionIds)
        if (result?.error) {
            showToast({ title: "Erro ao enviar comentário", description: result.error, variant: "error" })
        } else {
            setNewComment("")
            setMentionAliasToUserId({})
            setActiveMentionContext(null)
            setHighlightedMentionIndex(0)
            setReplyTo(null)
            const updated = await getTaskComments(task.id)
            setComments(updated)
        }
        setIsSendingComment(false)
    }

    const refreshTaskAttachments = async (taskId: string) => {
        const result = await listTaskAttachments(taskId)
        if (result.error) {
            console.error("Error fetching task attachments:", result.error)
            return
        }
        setAttachments(result.data)
    }

    const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        if (files.length === 0) {
            setAttachmentFiles([])
            return
        }

        const remainingSlots = Math.max(0, MAX_TASK_ATTACHMENTS_PER_TASK - attachments.length)
        if (remainingSlots <= 0) {
            showToast({
                title: "Limite atingido",
                description: `Esta tarefa já possui ${MAX_TASK_ATTACHMENTS_PER_TASK} anexos.`,
                variant: "error",
            })
            event.target.value = ""
            setAttachmentFiles([])
            return
        }

        const validationError = validateTaskAttachmentFiles(files, { maxCount: remainingSlots })
        if (validationError) {
            showToast({ title: "Arquivo inválido", description: validationError, variant: "error" })
            event.target.value = ""
            setAttachmentFiles([])
            return
        }

        setAttachmentFiles(files)
    }

    const handleUploadAttachment = async () => {
        if (!task || attachmentFiles.length === 0) return

        if (attachments.length >= MAX_TASK_ATTACHMENTS_PER_TASK) {
            showToast({
                title: "Limite atingido",
                description: `Esta tarefa já possui ${MAX_TASK_ATTACHMENTS_PER_TASK} anexos.`,
                variant: "error",
            })
            return
        }

        if (attachments.length + attachmentFiles.length > MAX_TASK_ATTACHMENTS_PER_TASK) {
            showToast({
                title: "Muitos arquivos",
                description: `Você pode anexar no máximo ${MAX_TASK_ATTACHMENTS_PER_TASK} arquivos por tarefa.`,
                variant: "error",
            })
            return
        }

        setIsUploadingAttachment(true)
        const uploadResult = await uploadTaskAttachments(task.id, attachmentFiles, {
            maxCount: MAX_TASK_ATTACHMENTS_PER_TASK - attachments.length,
        })
        if (uploadResult.error && uploadResult.uploaded.length === 0) {
            showToast({ title: "Erro ao anexar arquivos", description: uploadResult.error, variant: "error" })
            setIsUploadingAttachment(false)
            return
        }

        await refreshTaskAttachments(task.id)
        setAttachmentFiles([])
        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = ""
        }

        if (uploadResult.failed.length > 0) {
            showToast({
                title: "Upload concluído com alertas",
                description: `${uploadResult.uploaded.length} enviado(s), ${uploadResult.failed.length} com falha.`,
                variant: "info",
            })
        } else {
            showToast({
                title: `${uploadResult.uploaded.length} arquivo(s) anexado(s)!`,
                variant: "success",
            })
        }

        setIsUploadingAttachment(false)
    }

    const handleSelectProposal = (proposalId: string) => {
        if (proposalId === "__none__") {
            setEditProposalId("")
            return
        }

        const selected = proposalOptions.find((proposal) => proposal.id === proposalId)
        if (!selected) return

        setEditProposalId(selected.id)
        if (selected.client_id) setEditIndicacaoId(selected.client_id)
        if (selected.contact_id) setEditContactId(selected.contact_id)
        if (selected.client_name) {
            setEditClientName(selected.client_name)
        } else if (selected.contact_name) {
            setEditClientName(selected.contact_name)
        }
        if (selected.codigo_instalacao) setEditCodigoInstalacao(selected.codigo_instalacao)
    }

    const handleSelectTaskIndication = (
        lead: {
            id: string
            nome: string
            codigo_instalacao: string | null
        }
    ) => {
        setEditClientName(lead.nome || "")
        setEditProposalId("")
        setEditIndicacaoId(lead.id)
        setEditCodigoInstalacao(lead.codigo_instalacao || "")
    }

    const handleSelectTaskContact = (contact: {
        id: string
        full_name: string | null
        first_name: string | null
        last_name: string | null
        email: string | null
        whatsapp: string | null
        phone: string | null
        mobile: string | null
    }) => {
        const name =
            contact.full_name
            || [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            || contact.email
            || contact.whatsapp
            || contact.phone
            || contact.mobile
            || ""

        setEditProposalId("")
        setEditContactId(contact.id)
        if (name) {
            setEditClientName(name)
        }
    }

    const handleSaveDetails = async () => {
        if (!task) return
        setIsSavingDetails(true)
        const trimmedTitle = editTitle.trim()
        if (!trimmedTitle) {
            showToast({ title: "Título obrigatório", description: "Informe um título para a tarefa.", variant: "error" })
            setIsSavingDetails(false)
            return
        }

        let dueDateIso: string | null = null
        if (editDueDate) {
            const parsed = new Date(editDueDate)
            if (!Number.isNaN(parsed.getTime())) {
                dueDateIso = parsed.toISOString()
            }
        }

        const selectedProposal = proposalOptions.find((proposal) => proposal.id === editProposalId) ?? null
        const cleanedClientName = editClientName.trim()
        const cleanedCodigoInstalacao = editCodigoInstalacao.trim()
        const updates: Partial<Task> = {
            title: trimmedTitle,
            priority: editPriority,
            due_date: dueDateIso,
            assignee_id: editAssigneeId || null,
            client_name: cleanedClientName || null,
            codigo_instalacao: cleanedCodigoInstalacao || null,
            indicacao_id: editIndicacaoId || null,
            contact_id: editContactId || null,
            proposal_id: editProposalId || null,
        }

        if (selectedProposal?.brand) {
            updates.brand = selectedProposal.brand
        }

        const result = await updateTask(task.id, updates)
        if (result?.error) {
            showToast({ title: "Erro ao atualizar tarefa", description: result.error, variant: "error" })
        } else {
            showToast({ title: "Tarefa atualizada", variant: "success" })
            const assignee = users.find((item) => item.id === editAssigneeId)
            onTaskUpdated?.(task.id, {
                ...updates,
                title: trimmedTitle,
                priority: editPriority,
                client_name: cleanedClientName || null,
                codigo_instalacao: cleanedCodigoInstalacao || null,
                indicacao_id: editIndicacaoId || null,
                contact_id: editContactId || null,
                proposal_id: editProposalId || null,
                assignee: assignee ? { name: assignee.name, email: assignee.email ?? "" } : undefined,
            })
        }
        setIsSavingDetails(false)
    }

    const handleActivateEnergisa = async () => {
        if (!task) return
        setIsActivatingEnergisa(true)
        const result = await activateTaskEnergisa(task.id)
        if (result?.error) {
            showToast({ title: "Erro ao ativar Energisa", description: result.error, variant: "error" })
        } else {
            if (!result?.alreadyActive && result?.activatedAt) {
                onTaskUpdated?.(task.id, { energisa_activated_at: result.activatedAt })
            }
            const updated = await getTaskChecklists(task.id)
            setChecklists(updated)
            showToast({ title: "Processo Energisa ativado", variant: "success" })
        }
        setIsActivatingEnergisa(false)
    }

    if (!task) return null

    const headerMeta = [
        task.client_name ? `Cliente: ${task.client_name}` : null,
        task.codigo_instalacao ? `Instalação: ${task.codigo_instalacao}` : null,
    ].filter(Boolean).join(" • ")
    const visibilityLabel = task.visibility_scope === "RESTRICTED"
        ? "Visibilidade restrita"
        : "Visibilidade equipe"
    const linkedContactId = editContactId || task.contact_id || ""
    const hasClientLinkData = Boolean(
        editProposalId ||
        editIndicacaoId ||
        editContactId ||
        editClientName.trim() ||
        editCodigoInstalacao.trim()
    )
    const clientLinkSummary = hasClientLinkData
        ? [
            editClientName.trim() || null,
            editCodigoInstalacao.trim() ? `UC ${editCodigoInstalacao.trim()}` : null,
            editProposalId ? "Orçamento vinculado" : null,
            editIndicacaoId ? "Indicação vinculada" : null,
            editContactId ? "Contato vinculado" : null,
        ]
            .filter(Boolean)
            .join(" • ")
        : "Nenhum vínculo configurado."

    const renderChecklistItems = (items: TaskChecklistItem[]) => (
        <div className="space-y-2">
            {items.map((item) => {
                const completedByName = item.completed_by_user?.name || item.completed_by_user?.email || ""
                const responsibleName = item.responsible_user_id
                    ? (usersById.get(item.responsible_user_id) ?? "Usuário vinculado")
                    : ""
                const completedAtLabel = formatDateTime(item.completed_at)
                const dueDateLabel = formatDateOnly(item.due_date)
                return (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="flex items-start gap-2">
                            <Checkbox
                                checked={item.is_done}
                                onChange={(event) => handleToggleChecklist(item, event.currentTarget.checked)}
                            />
                            <div className="space-y-1">
                                <span className={`text-sm ${item.is_done ? "line-through text-muted-foreground" : ""}`}>
                                    {item.title}
                                </span>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    {dueDateLabel && <span>Prazo: {dueDateLabel}</span>}
                                    {responsibleName && (
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                                                style={{ backgroundColor: stringToHsl(responsibleName) }}
                                            >
                                                {getInitials(responsibleName)}
                                            </span>
                                            <span>Responsável: {responsibleName}</span>
                                        </span>
                                    )}
                                    {item.is_done && completedAtLabel && <span>Concluído em: {completedAtLabel}</span>}
                                    {completedByName && (
                                        <span className="flex items-center gap-2">
                                            <span
                                                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                                                style={{ backgroundColor: stringToHsl(completedByName) }}
                                            >
                                                {getInitials(completedByName)}
                                            </span>
                                            <span>{completedByName}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteChecklist(item.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )
            })}
            {!isLoading && items.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum checklist cadastrado.</p>
            )}
        </div>
    )

    const handleDocAlert = async (alertType: 'DOCS_INCOMPLETE' | 'DOCS_REJECTED') => {
        setActiveDocAlert(alertType)
        const result = await triggerTaskDocAlert(task.id, alertType)
        if (result?.error) {
            showToast({ title: "Erro ao registrar alerta", description: result.error, variant: "error" })
        } else {
            const updated = await getTaskChecklists(task.id)
            setChecklists(updated)
            showToast({
                title: "Alerta registrado",
                description: "O vendedor foi atualizado com o novo status da documentação.",
                variant: "success",
            })
        }
        setActiveDocAlert(null)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex flex-col gap-2">
                        <span className="text-xl">{task.title}</span>
                        <span className="text-xs text-muted-foreground">
                            Prazo: {formattedDueDate}
                        </span>
                    </DialogTitle>
                    <DialogDescription>
                        {headerMeta}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{task.status}</Badge>
                        <Badge variant="outline">{task.priority}</Badge>
                        {task.department && <Badge variant="secondary">{task.department}</Badge>}
                        <Badge variant="outline">{task.brand}</Badge>
                        <Badge variant={task.visibility_scope === "RESTRICTED" ? "destructive" : "outline"}>
                            {visibilityLabel}
                        </Badge>
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                        <h4 className="text-sm font-semibold">Descrição e prazo</h4>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label className="text-xs text-muted-foreground">Título</label>
                                <Input
                                    value={editTitle}
                                    onChange={(event) => setEditTitle(event.target.value)}
                                    placeholder="Título da tarefa"
                                />
                            </div>
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Prioridade</label>
                                <Select value={editPriority} onValueChange={(value) => setEditPriority(value as TaskPriority)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRIORITY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="rounded-md border bg-background/70 p-3">
                                <button
                                    type="button"
                                    className="flex w-full items-start justify-between gap-3 text-left"
                                    onClick={() => setIsClientLinkExpanded((prev) => !prev)}
                                >
                                    <div className="space-y-1">
                                        <h5 className="text-sm font-medium">Vínculo do cliente</h5>
                                        <p className="text-xs text-muted-foreground">{clientLinkSummary}</p>
                                    </div>
                                    <span className="mt-0.5 text-muted-foreground">
                                        {isClientLinkExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </span>
                                </button>

                                {isClientLinkExpanded && (
                                    <div className="mt-3 grid gap-3">
                                        <div className="grid gap-1">
                                            <label className="text-xs text-muted-foreground">Orçamento</label>
                                            <Select value={editProposalId || "__none__"} onValueChange={handleSelectProposal}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um orçamento" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Sem orçamento vinculado</SelectItem>
                                                    {visibleProposalOptions.map((proposal) => {
                                                        const clientLabel = proposal.client_name || proposal.contact_name || "Cliente não identificado"
                                                        return (
                                                            <SelectItem key={proposal.id} value={proposal.id}>
                                                                {clientLabel} • {proposal.id.slice(0, 8)}
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid gap-1">
                                            <label className="text-xs text-muted-foreground">Indicação</label>
                                            <LeadSelect
                                                mode="leads"
                                                value={editIndicacaoId || undefined}
                                                leadBrand={task.brand}
                                                onChange={(value) => setEditIndicacaoId(value ?? "")}
                                                onSelectLead={(lead, source) => {
                                                    if (source === "indicacao") {
                                                        handleSelectTaskIndication(lead)
                                                    }
                                                }}
                                            />
                                        </div>

                                        <div className="grid gap-1">
                                            <label className="text-xs text-muted-foreground">Contato</label>
                                            <LeadSelect
                                                mode="contacts"
                                                value={editContactId || undefined}
                                                onChange={(value) => setEditContactId(value ?? "")}
                                                onSelectContact={handleSelectTaskContact}
                                            />
                                        </div>

                                        <div className="grid gap-1">
                                            <label className="text-xs text-muted-foreground">Nome do cliente</label>
                                            <Input
                                                value={editClientName}
                                                onChange={(event) => setEditClientName(event.target.value)}
                                                placeholder="Nome do cliente"
                                            />
                                        </div>

                                        <div className="grid gap-1">
                                            <label className="text-xs text-muted-foreground">Código de instalação</label>
                                            <Input
                                                value={editCodigoInstalacao}
                                                onChange={(event) => setEditCodigoInstalacao(event.target.value)}
                                                placeholder="Código de instalação"
                                            />
                                        </div>

                                        {linkedContactId && (
                                            <p className="text-xs text-muted-foreground">
                                                Contato vinculado:{" "}
                                                <Link
                                                    href={`/admin/contatos/${linkedContactId}`}
                                                    className="underline underline-offset-2"
                                                >
                                                    abrir contato 360
                                                </Link>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs text-muted-foreground">Histórico</label>
                                <ScrollArea className="h-[360px] max-h-[52vh] rounded-md border bg-background p-3">
                                    <div className="space-y-3">
                                        {commentsToShow.map((comment) => {
                                            const authorName =
                                                comment.user?.name ||
                                                comment.user?.email ||
                                                (comment.user_id ? usersById.get(comment.user_id) : undefined) ||
                                                "Usuário"
                                            const isMe = Boolean(comment.user_id && comment.user_id === currentUserId)
                                            const timestamp = formatDateTime(comment.created_at)
                                            const parentAuthor =
                                                comment.parent?.user?.name ||
                                                comment.parent?.user?.email ||
                                                (comment.parent?.user?.id ? usersById.get(comment.parent.user.id) : undefined) ||
                                                "Usuário"
                                            return (
                                                <div key={comment.id} className="rounded-md border bg-muted/30 p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                                                                style={{ backgroundColor: stringToHsl(authorName) }}
                                                            >
                                                                {getInitials(authorName)}
                                                            </span>
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-medium">
                                                                    {isMe ? "Você" : authorName}
                                                                </span>
                                                                {timestamp && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {timestamp}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {comment.isLegacy && (
                                                                <span className="text-[10px] uppercase text-muted-foreground">
                                                                    Descrição inicial
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!comment.isLegacy && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setReplyTo(comment)}
                                                            >
                                                                Responder
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {comment.parent && (
                                                        <div className="mt-2 rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                                            <span className="font-medium text-foreground">
                                                                Em resposta a {parentAuthor}
                                                            </span>
                                                            {comment.parent.content && (
                                                                <p className="line-clamp-2">{comment.parent.content}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                                                        {comment.content}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                        {!isLoading && commentsToShow.length === 0 && (
                                            <p className="text-xs text-muted-foreground">
                                                Nenhum comentário registrado.
                                            </p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs text-muted-foreground">Comentário</label>
                                {replyTo && (
                                    <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                                        <div className="space-y-1">
                                            <span className="text-foreground font-medium">
                                                Respondendo a {
                                                    replyTo.user?.name ||
                                                    replyTo.user?.email ||
                                                    (replyTo.user_id ? usersById.get(replyTo.user_id) : undefined) ||
                                                    "Usuário"
                                                }
                                            </span>
                                            <p className="line-clamp-2">{replyTo.content}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setReplyTo(null)}
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Textarea
                                        ref={commentTextareaRef}
                                        value={newComment}
                                        onChange={handleCommentInputChange}
                                        onClick={(event) => {
                                            const caretPosition = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                                            refreshMentionContext(event.currentTarget.value, caretPosition)
                                        }}
                                        onKeyUp={(event) => {
                                            const caretPosition = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                                            refreshMentionContext(event.currentTarget.value, caretPosition)
                                        }}
                                        placeholder="Escreva um comentário... Use @ para mencionar alguém."
                                        className="min-h-[80px] resize-none"
                                        onBlur={() => {
                                            window.setTimeout(() => {
                                                setActiveMentionContext(null)
                                            }, 120)
                                        }}
                                        onKeyDown={(event) => {
                                            if (isMentionMenuOpen) {
                                                if (event.key === "ArrowDown") {
                                                    event.preventDefault()
                                                    setHighlightedMentionIndex((prev) => (prev + 1) % mentionCandidates.length)
                                                    return
                                                }

                                                if (event.key === "ArrowUp") {
                                                    event.preventDefault()
                                                    setHighlightedMentionIndex((prev) =>
                                                        prev === 0 ? mentionCandidates.length - 1 : prev - 1
                                                    )
                                                    return
                                                }

                                                if (event.key === "Enter") {
                                                    event.preventDefault()
                                                    const candidate = mentionCandidates[highlightedMentionIndex] ?? mentionCandidates[0]
                                                    if (candidate) {
                                                        applyMentionCandidate(candidate)
                                                        return
                                                    }
                                                }

                                                if (event.key === "Escape") {
                                                    event.preventDefault()
                                                    setActiveMentionContext(null)
                                                    return
                                                }
                                            }

                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault()
                                                handleSendComment()
                                            }
                                        }}
                                    />

                                    {isMentionMenuOpen && (
                                        <div className="rounded-md border bg-background p-1 shadow-sm">
                                            <div className="space-y-1">
                                                {mentionCandidates.map((candidate, index) => (
                                                    <button
                                                        key={candidate.id}
                                                        type="button"
                                                        className={`flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                                                            index === highlightedMentionIndex
                                                                ? "bg-primary/10 text-primary"
                                                                : "hover:bg-muted"
                                                        }`}
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => applyMentionCandidate(candidate)}
                                                    >
                                                        <span className="text-xs font-medium">
                                                            {candidate.name}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            @{candidate.alias}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <Button onClick={handleSendComment} disabled={isSendingComment || !newComment.trim()}>
                                        {isSendingComment ? "Enviando..." : "Enviar comentário"}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs text-muted-foreground">Anexos (PDF/PNG)</label>
                                <div className="rounded-md border bg-background p-3 space-y-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Input
                                            ref={attachmentInputRef}
                                            type="file"
                                            accept="application/pdf,.pdf,image/png,.png"
                                            multiple
                                            onChange={handleAttachmentChange}
                                            className="sm:max-w-sm"
                                        />
                                        <Button
                                            type="button"
                                            onClick={handleUploadAttachment}
                                            disabled={isUploadingAttachment || attachmentFiles.length === 0}
                                        >
                                            {isUploadingAttachment ? "Enviando..." : "Anexar arquivos"}
                                        </Button>
                                    </div>
                                    {attachmentFiles.length > 0 ? (
                                        <p className="text-[11px] text-muted-foreground">
                                            {attachmentFiles.length} arquivo(s) selecionado(s) para upload.
                                        </p>
                                    ) : null}
                                    <p className="text-[11px] text-muted-foreground">
                                        PDF ou PNG, até 10MB cada. Máximo de {MAX_TASK_ATTACHMENTS_PER_TASK} arquivos por tarefa.
                                    </p>
                                    <div className="space-y-2">
                                        {attachments.map((attachment) => (
                                            <div
                                                key={attachment.path}
                                                className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-medium text-foreground">
                                                        {attachment.name}
                                                    </p>
                                                    <p className="truncate text-[11px] text-muted-foreground">
                                                        {formatDateTime(attachment.created_at) || "Sem data"} • {formatTaskAttachmentSize(attachment.size)}
                                                    </p>
                                                </div>
                                                {attachment.signedUrl ? (
                                                    <Button type="button" variant="outline" size="sm" asChild>
                                                        <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="gap-1">
                                                            <Paperclip className="h-3.5 w-3.5" />
                                                            Abrir arquivo
                                                        </a>
                                                    </Button>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        Sem acesso ao arquivo
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                        {!isLoading && attachments.length === 0 && (
                                            <p className="text-xs text-muted-foreground">
                                                Nenhum documento anexado.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Prazo</label>
                                <input
                                    type="date"
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={editDueDate}
                                    onChange={(event) => setEditDueDate(event.target.value)}
                                />
                            </div>
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Responsável</label>
                                <Select
                                    value={editAssigneeId || "__unassigned__"}
                                    onValueChange={(value) => setEditAssigneeId(value === "__unassigned__" ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um responsável" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">Sem responsável</SelectItem>
                                        {responsibleUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex justify-end">
                                <Button onClick={handleSaveDetails} disabled={isSavingDetails}>
                                    Salvar alterações
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4">
                        <div className="grid gap-3 rounded-md border border-red-200 bg-red-50/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="flex items-center gap-2 text-sm font-semibold text-red-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    Alertas de documentação
                                </h4>
                                <span className="text-[11px] text-red-700/80">
                                    Atualiza o vendedor em tempo real
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDocAlert('DOCS_INCOMPLETE')}
                                    disabled={activeDocAlert !== null}
                                >
                                    {activeDocAlert === 'DOCS_INCOMPLETE' ? 'Enviando...' : 'Documentação incompleta'}
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDocAlert('DOCS_REJECTED')}
                                    disabled={activeDocAlert !== null}
                                >
                                    {activeDocAlert === 'DOCS_REJECTED' ? 'Enviando...' : 'Documentação rejeitada'}
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <h4 className="text-sm font-semibold">Checklist Cadastro</h4>
                            {renderChecklistItems(cadastroChecklists)}
                        </div>

                        <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-semibold">Processo Energisa</h4>
                                {task.energisa_activated_at ? (
                                    <span className="text-xs text-muted-foreground">
                                        Ativado em: {formattedEnergisaActivatedAt}
                                    </span>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={handleActivateEnergisa}
                                        disabled={isActivatingEnergisa}
                                    >
                                        {isActivatingEnergisa ? "Ativando..." : "Ativar Processo Energisa"}
                                    </Button>
                                )}
                            </div>

                            {task.energisa_activated_at ? (
                                renderChecklistItems(energisaChecklists)
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {isActivatingEnergisa
                                        ? "Ativando o processo Energisa."
                                        : "Ative o processo para liberar o checklist de Energisa."}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-3">
                            <h4 className="text-sm font-semibold">Ações Energisa</h4>
                            {task.indicacao_id ? (
                                <EnergisaActions indicacaoId={task.indicacao_id} variant="compact" />
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Esta tarefa não está vinculada a uma indicação, então não é possível registrar ações da Energisa.
                                </p>
                            )}
                        </div>

                        <div className="grid gap-3">
                            <h4 className="text-sm font-semibold">Checklist adicional</h4>
                            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                                <Input
                                    value={newChecklistTitle}
                                    onChange={(event) => setNewChecklistTitle(event.target.value)}
                                    placeholder="Adicionar item"
                                />
                                <Select
                                    value={newChecklistResponsibleId || "__unassigned__"}
                                    onValueChange={(value) => setNewChecklistResponsibleId(value === "__unassigned__" ? "" : value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Responsável" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">Sem responsável</SelectItem>
                                        {responsibleUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button onClick={handleAddChecklist} disabled={isSavingChecklist || !newChecklistTitle.trim()}>
                                    Adicionar
                                </Button>
                            </div>
                            {renderChecklistItems(generalChecklists)}
                        </div>
                    </div>

                    <Separator />

                    <div className="grid gap-3">
                        <h4 className="text-sm font-semibold">Observadores</h4>
                        <div className="flex flex-wrap gap-2">
                            {observers.map((observer) => (
                                <div key={observer.user_id} className="flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs">
                                    <Avatar className="h-5 w-5">
                                        <AvatarFallback className="text-[10px]">
                                            {(observer.user?.name || "?").slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span>{observer.user?.name || "Sem nome"}</span>
                                    <button onClick={() => handleRemoveObserver(observer.user_id)} className="text-muted-foreground hover:text-foreground">
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {!isLoading && observers.length === 0 && (
                                <span className="text-xs text-muted-foreground">Sem observadores.</span>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Select value={newObserverId} onValueChange={setNewObserverId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Adicionar observador" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={handleAddObserver} disabled={!newObserverId}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Adicionar
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between pt-2">
                    <Button variant="destructive" onClick={handleDeleteTask} disabled={isDeleting}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir tarefa
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
