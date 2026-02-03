"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Trash2, UserPlus, X } from "lucide-react"

import type { Task, TaskChecklistItem, TaskObserver } from "@/services/task-service"
import {
    addTaskChecklistItem,
    addTaskObserver,
    activateTaskEnergisa,
    deleteTask,
    deleteTaskChecklistItem,
    getTaskChecklists,
    getTaskAssignableUsers,
    getTaskObservers,
    removeTaskObserver,
    toggleTaskChecklistItem,
    updateTask,
} from "@/services/task-service"

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
import { useToast } from "@/hooks/use-toast"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

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
    department: string | null
}

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
    const [users, setUsers] = useState<UserOption[]>([])
    const [newChecklistTitle, setNewChecklistTitle] = useState("")
    const [newObserverId, setNewObserverId] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSavingChecklist, setIsSavingChecklist] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isSavingDetails, setIsSavingDetails] = useState(false)
    const [isActivatingEnergisa, setIsActivatingEnergisa] = useState(false)
    const [editDescription, setEditDescription] = useState("")
    const [editDueDate, setEditDueDate] = useState("")
    const { showToast } = useToast()

    const checklistSummary = useMemo(() => {
        const total = checklists.length
        const done = checklists.filter(item => item.is_done).length
        return { total, done }
    }, [checklists])

    const cadastroChecklists = useMemo(
        () => checklists.filter((item) => item.phase === 'cadastro'),
        [checklists]
    )
    const energisaChecklists = useMemo(
        () => checklists.filter((item) => item.phase === 'energisa'),
        [checklists]
    )
    const generalChecklists = useMemo(
        () => checklists.filter((item) => !item.phase),
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

    useEffect(() => {
        if (!open || !task) return

        setChecklists([])
        setObservers([])
        setEditDescription(task.description ?? "")
        if (task.due_date) {
            const parsed = new Date(task.due_date)
            setEditDueDate(Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd"))
        } else {
            setEditDueDate("")
        }

        const load = async () => {
            setIsLoading(true)
            const [checklistData, observerData] = await Promise.all([
                getTaskChecklists(task.id),
                getTaskObservers(task.id),
            ])
            setChecklists(checklistData)
            setObservers(observerData)
            setIsLoading(false)
        }

        load()
    }, [open, task?.id])

    useEffect(() => {
        if (!open) return
        const fetchUsers = async () => {
            const data = await getTaskAssignableUsers()
            setUsers(
                (data ?? []).map((user) => ({
                    id: user.id,
                    name: user.name || "Sem Nome",
                    department: user.department,
                }))
            )
        }

        fetchUsers()
    }, [open])

    useEffect(() => {
        if (!task) return
        onChecklistSummaryChange?.(task.id, checklistSummary.total, checklistSummary.done)
    }, [checklistSummary.total, checklistSummary.done, onChecklistSummaryChange, task?.id])

    if (!task) return null

    const headerMeta = [
        task.client_name ? `Cliente: ${task.client_name}` : null,
        task.codigo_instalacao ? `Instalação: ${task.codigo_instalacao}` : null,
    ].filter(Boolean).join(" • ")

    const renderChecklistItems = (items: TaskChecklistItem[]) => (
        <div className="space-y-2">
            {items.map((item) => {
                const completedByName = item.completed_by_user?.name || item.completed_by_user?.email || ""
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

    const handleAddChecklist = async () => {
        if (!newChecklistTitle.trim()) return
        setIsSavingChecklist(true)
        const result = await addTaskChecklistItem(task.id, newChecklistTitle)
        if (result?.error) {
            showToast({ title: "Erro ao adicionar checklist", description: result.error, variant: "error" })
        } else {
            const updated = await getTaskChecklists(task.id)
            setChecklists(updated)
            setNewChecklistTitle("")
        }
        setIsSavingChecklist(false)
    }

    const handleToggleChecklist = async (item: TaskChecklistItem, nextChecked: boolean) => {
        const result = await toggleTaskChecklistItem(item.id, nextChecked)
        if (result?.error) {
            showToast({ title: "Erro ao atualizar checklist", description: result.error, variant: "error" })
            return
        }
        const updated = await getTaskChecklists(task.id)
        setChecklists(updated)
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
        const result = await removeTaskObserver(task.id, userId)
        if (result?.error) {
            showToast({ title: "Erro ao remover observador", description: result.error, variant: "error" })
            return
        }
        setObservers(prev => prev.filter(obs => obs.user_id !== userId))
    }

    const handleDeleteTask = async () => {
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

    const handleSaveDetails = async () => {
        setIsSavingDetails(true)
        let dueDateIso: string | null = null
        if (editDueDate) {
            const parsed = new Date(editDueDate)
            if (!Number.isNaN(parsed.getTime())) {
                dueDateIso = parsed.toISOString()
            }
        }
        const updates: Partial<Task> = {
            description: editDescription.trim() ? editDescription.trim() : null,
            due_date: dueDateIso,
        }

        const result = await updateTask(task.id, updates)
        if (result?.error) {
            showToast({ title: "Erro ao atualizar tarefa", description: result.error, variant: "error" })
        } else {
            showToast({ title: "Tarefa atualizada", variant: "success" })
            onTaskUpdated?.(task.id, updates)
        }
        setIsSavingDetails(false)
    }

    const handleActivateEnergisa = async () => {
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
                    </div>

                    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                        <h4 className="text-sm font-semibold">Descrição e prazo</h4>
                        <div className="grid gap-3">
                            <div className="grid gap-1">
                                <label className="text-xs text-muted-foreground">Descrição</label>
                                <textarea
                                    className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={editDescription}
                                    onChange={(event) => setEditDescription(event.target.value)}
                                />
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
                            <div className="flex justify-end">
                                <Button onClick={handleSaveDetails} disabled={isSavingDetails}>
                                    Salvar alterações
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4">
                        <div className="grid gap-3">
                            <h4 className="text-sm font-semibold">Checklist Cadastro</h4>
                            {renderChecklistItems(cadastroChecklists)}
                        </div>

                        {task.brand === 'rental' && (
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
                                            Ativar Processo Energisa
                                        </Button>
                                    )}
                                </div>

                                {task.energisa_activated_at ? (
                                    renderChecklistItems(energisaChecklists)
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Ative o processo para liberar o checklist de Energisa.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="grid gap-3">
                            <h4 className="text-sm font-semibold">Checklist adicional</h4>
                            <div className="flex gap-2">
                                <Input
                                    value={newChecklistTitle}
                                    onChange={(event) => setNewChecklistTitle(event.target.value)}
                                    placeholder="Adicionar item"
                                />
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
