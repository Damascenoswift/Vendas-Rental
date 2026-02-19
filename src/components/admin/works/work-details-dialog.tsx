"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { Loader2, Trash2 } from "lucide-react"
import {
    addWorkComment,
    addWorkImage,
    addWorkProcessItem,
    deleteWorkImage,
    deleteWorkProcessItem,
    getWorkCardById,
    getWorkComments,
    getWorkImages,
    getWorkProcessItems,
    getWorkProposalLinks,
    releaseProjectForExecution,
    setWorkProcessItemStatus,
    toggleWorkTasksIntegration,
    type WorkCard,
    type WorkComment,
    type WorkImage,
    type WorkImageType,
    type WorkProcessItem,
    type WorkProcessStatus,
    type WorkProposalLink,
} from "@/services/work-cards-service"
import { uploadWorkImage, validateWorkImageAttachment } from "@/lib/work-images"
import { useToast } from "@/hooks/use-toast"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

function statusLabel(status: WorkCard["status"]) {
    if (status === "FECHADA") return "Obra Fechada"
    if (status === "PARA_INICIAR") return "Obra Para Iniciar"
    return "Obra em Andamento"
}

function processStatusLabel(status: WorkProcessStatus) {
    if (status === "TODO") return "A Fazer"
    if (status === "IN_PROGRESS") return "Em Andamento"
    if (status === "DONE") return "Concluído"
    return "Bloqueado"
}

function formatDateTime(value?: string | null) {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed)
}

function collectPrimitiveSnapshotValues(value: unknown, parent = ""): Array<{ key: string; value: string }> {
    if (value === null || value === undefined) return []

    if (typeof value !== "object") {
        return [{ key: parent || "valor", value: String(value) }]
    }

    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectPrimitiveSnapshotValues(item, `${parent}[${index}]`))
    }

    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
        const nextKey = parent ? `${parent}.${key}` : key
        return collectPrimitiveSnapshotValues(nested, nextKey)
    })
}

function ImageGallery({
    label,
    items,
    onDelete,
}: {
    label: string
    items: WorkImage[]
    onDelete: (imageId: string) => Promise<void>
}) {
    return (
        <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-semibold">{label}</p>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma imagem.</p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {items.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-md border">
                            {image.signed_url ? (
                                <img
                                    src={image.signed_url}
                                    alt={image.caption || "Imagem da obra"}
                                    className="h-32 w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-muted-foreground">
                                    Sem preview
                                </div>
                            )}
                            <div className="space-y-2 p-2">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {image.caption || "Sem descrição"}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => onDelete(image.id)}
                                >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Excluir
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function WorkDetailsDialog({
    workId,
    open,
    onOpenChange,
    onChanged,
}: {
    workId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged?: () => void
}) {
    const { showToast } = useToast()

    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const [work, setWork] = useState<WorkCard | null>(null)
    const [processItems, setProcessItems] = useState<WorkProcessItem[]>([])
    const [comments, setComments] = useState<WorkComment[]>([])
    const [images, setImages] = useState<WorkImage[]>([])
    const [proposalLinks, setProposalLinks] = useState<WorkProposalLink[]>([])

    const [newProjectItem, setNewProjectItem] = useState("")
    const [newExecutionItem, setNewExecutionItem] = useState("")
    const [newEnergisaComment, setNewEnergisaComment] = useState("")

    const [uploadType, setUploadType] = useState<WorkImageType>("ANTES")
    const [uploadCaption, setUploadCaption] = useState("")
    const [uploadFile, setUploadFile] = useState<File | null>(null)

    const projectItems = useMemo(
        () => processItems.filter((item) => item.phase === "PROJETO"),
        [processItems]
    )

    const executionItems = useMemo(
        () => processItems.filter((item) => item.phase === "EXECUCAO"),
        [processItems]
    )

    const canReleaseProject = useMemo(() => {
        if (!work) return false
        if (work.projeto_liberado_at) return false
        if (projectItems.length === 0) return false
        return projectItems.every((item) => item.status === "DONE")
    }, [projectItems, work])

    const latestEnergisaComment = useMemo(
        () => comments.find((item) => item.comment_type === "ENERGISA_RESPOSTA") ?? null,
        [comments]
    )

    const energisaHistory = useMemo(
        () => comments.filter((item) => item.comment_type === "ENERGISA_RESPOSTA"),
        [comments]
    )

    const loadData = useCallback(async () => {
        if (!workId) return

        setIsLoading(true)
        try {
            const [card, items, commentsData, imagesData, links] = await Promise.all([
                getWorkCardById(workId),
                getWorkProcessItems(workId),
                getWorkComments(workId),
                getWorkImages(workId),
                getWorkProposalLinks(workId),
            ])

            setWork(card)
            setProcessItems(items)
            setComments(commentsData)
            setImages(imagesData)
            setProposalLinks(links)
        } finally {
            setIsLoading(false)
        }
    }, [workId])

    useEffect(() => {
        if (!open || !workId) return
        void loadData()
    }, [open, workId, loadData])

    async function handleReleaseProject() {
        if (!workId) return
        setIsSaving(true)
        try {
            const result = await releaseProjectForExecution(workId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Projeto liberado", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleToggleTaskIntegration(checked: boolean) {
        if (!workId) return

        setIsSaving(true)
        try {
            const result = await toggleWorkTasksIntegration(workId, checked)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Integração atualizada", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleProcessStatusChange(itemId: string, status: WorkProcessStatus) {
        setIsSaving(true)
        try {
            const result = await setWorkProcessItemStatus({ itemId, status })
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleAddProcessItem(phase: "PROJETO" | "EXECUCAO") {
        if (!workId) return

        const title = phase === "PROJETO" ? newProjectItem : newExecutionItem
        if (!title.trim()) return

        setIsSaving(true)
        try {
            const result = await addWorkProcessItem({
                workId,
                phase,
                title,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            if (phase === "PROJETO") setNewProjectItem("")
            if (phase === "EXECUCAO") setNewExecutionItem("")

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteProcessItem(itemId: string) {
        setIsSaving(true)
        try {
            const result = await deleteWorkProcessItem(itemId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleAddEnergisaComment() {
        if (!workId || !newEnergisaComment.trim()) return

        setIsSaving(true)
        try {
            const result = await addWorkComment({
                workId,
                content: newEnergisaComment,
                commentType: "ENERGISA_RESPOSTA",
                phase: "PROJETO",
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            setNewEnergisaComment("")
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleUploadImage() {
        if (!workId || !uploadFile) return

        const validationError = validateWorkImageAttachment(uploadFile)
        if (validationError) {
            showToast({ title: "Arquivo inválido", description: validationError, variant: "error" })
            return
        }

        setIsSaving(true)
        try {
            const uploadResult = await uploadWorkImage({
                workId,
                imageType: uploadType,
                file: uploadFile,
            })

            if (uploadResult.error || !uploadResult.path) {
                showToast({ title: "Erro no upload", description: uploadResult.error ?? "Falha ao enviar imagem.", variant: "error" })
                return
            }

            const saveResult = await addWorkImage({
                workId,
                imageType: uploadType,
                storagePath: uploadResult.path,
                caption: uploadCaption,
            })

            if (saveResult.error) {
                showToast({ title: "Erro", description: saveResult.error, variant: "error" })
                return
            }

            setUploadFile(null)
            setUploadCaption("")
            await loadData()
            onChanged?.()
            showToast({ title: "Imagem adicionada", variant: "success" })
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteImage(imageId: string) {
        setIsSaving(true)
        try {
            const result = await deleteWorkImage(imageId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null
        setUploadFile(file)
    }

    const coverImages = images.filter((item) => item.image_type === "CAPA")
    const profileImages = images.filter((item) => item.image_type === "PERFIL")
    const beforeImages = images.filter((item) => item.image_type === "ANTES")
    const afterImages = images.filter((item) => item.image_type === "DEPOIS")

    const snapshotValues = collectPrimitiveSnapshotValues(work?.technical_snapshot ?? {})

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        <span>{work?.title || "Obra"}</span>
                        {work ? <Badge variant="outline">{statusLabel(work.status)}</Badge> : null}
                    </DialogTitle>
                    <DialogDescription>
                        {work?.codigo_instalacao
                            ? `Instalação ${work.codigo_instalacao}`
                            : work?.installation_key ?? "Detalhes da obra"}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : !work ? (
                    <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Obra não encontrada.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                onClick={handleReleaseProject}
                                disabled={isSaving || !canReleaseProject}
                            >
                                {isSaving ? "Processando..." : "Projeto liberado para iniciar obra"}
                            </Button>
                            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <Checkbox
                                    checked={work.tasks_integration_enabled}
                                    onChange={(event) => handleToggleTaskIntegration(event.currentTarget.checked)}
                                    disabled={isSaving}
                                />
                                <span>Conectar com tarefas automaticamente</span>
                            </div>
                            {work.contact_id ? (
                                <Button asChild variant="outline">
                                    <Link href={`/admin/contatos/${work.contact_id}`}>Abrir Contato 360</Link>
                                </Button>
                            ) : null}
                            {work.projeto_liberado_at ? (
                                <span className="text-xs text-muted-foreground">
                                    Projeto liberado em {formatDateTime(work.projeto_liberado_at)}
                                </span>
                            ) : null}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Dados técnicos (sem valores)</p>
                                {snapshotValues.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem dados técnicos registrados.</p>
                                ) : (
                                    <div className="max-h-64 space-y-1 overflow-auto rounded-md bg-slate-50 p-2">
                                        {snapshotValues.map((entry) => (
                                            <div key={`${entry.key}-${entry.value}`} className="text-xs">
                                                <span className="font-medium">{entry.key}:</span> {entry.value}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Resposta Energisa (destaque)</p>
                                <div className="rounded-md bg-slate-50 p-3 text-sm">
                                    {latestEnergisaComment ? latestEnergisaComment.content : "Sem resposta registrada."}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Atualizado em: {formatDateTime(latestEnergisaComment?.created_at)}
                                </p>
                                <Textarea
                                    value={newEnergisaComment}
                                    onChange={(event) => setNewEnergisaComment(event.target.value)}
                                    placeholder="Registrar nova resposta da Energisa"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleAddEnergisaComment}
                                    disabled={isSaving || !newEnergisaComment.trim()}
                                >
                                    Salvar resposta
                                </Button>
                                <div className="space-y-2 rounded-md border p-3">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                                        Histórico Energisa
                                    </p>
                                    <div className="max-h-52 space-y-2 overflow-auto">
                                        {energisaHistory.map((comment) => {
                                            const author = comment.user?.name || comment.user?.email || "Usuário interno"
                                            return (
                                                <div key={comment.id} className="rounded-md bg-slate-50 p-2">
                                                    <p className="text-xs text-muted-foreground">
                                                        {author} • {formatDateTime(comment.created_at)}
                                                    </p>
                                                    <p className="mt-1 text-sm">{comment.content}</p>
                                                </div>
                                            )
                                        })}
                                        {energisaHistory.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">Sem histórico de respostas.</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Processos de Projeto</p>
                                <div className="flex gap-2">
                                    <Input
                                        value={newProjectItem}
                                        onChange={(event) => setNewProjectItem(event.target.value)}
                                        placeholder="Novo processo de projeto"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => handleAddProcessItem("PROJETO")}
                                        disabled={isSaving}
                                    >
                                        Adicionar
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {projectItems.map((item) => (
                                        <div key={item.id} className="rounded-md border p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium">{item.title}</p>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0"
                                                    onClick={() => handleDeleteProcessItem(item.id)}
                                                    disabled={isSaving}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <Select
                                                    value={item.status}
                                                    onValueChange={(value) => handleProcessStatusChange(item.id, value as WorkProcessStatus)}
                                                >
                                                    <SelectTrigger className="h-8">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="TODO">{processStatusLabel("TODO")}</SelectItem>
                                                        <SelectItem value="IN_PROGRESS">{processStatusLabel("IN_PROGRESS")}</SelectItem>
                                                        <SelectItem value="BLOCKED">{processStatusLabel("BLOCKED")}</SelectItem>
                                                        <SelectItem value="DONE">{processStatusLabel("DONE")}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-xs text-muted-foreground">
                                                    Concluído: {formatDateTime(item.completed_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {projectItems.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sem processos de projeto.</p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Processos de Execução</p>
                                {!work.projeto_liberado_at ? (
                                    <p className="text-xs text-muted-foreground">
                                        Libere o projeto para habilitar a execução.
                                    </p>
                                ) : null}
                                <div className="flex gap-2">
                                    <Input
                                        value={newExecutionItem}
                                        onChange={(event) => setNewExecutionItem(event.target.value)}
                                        placeholder="Novo processo de execução"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => handleAddProcessItem("EXECUCAO")}
                                        disabled={isSaving || !work.projeto_liberado_at}
                                    >
                                        Adicionar
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {executionItems.map((item) => (
                                        <div key={item.id} className="rounded-md border p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium">{item.title}</p>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 w-7 p-0"
                                                    onClick={() => handleDeleteProcessItem(item.id)}
                                                    disabled={isSaving}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <Select
                                                    value={item.status}
                                                    onValueChange={(value) => handleProcessStatusChange(item.id, value as WorkProcessStatus)}
                                                    disabled={isSaving || !work.projeto_liberado_at}
                                                >
                                                    <SelectTrigger className="h-8">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="TODO">{processStatusLabel("TODO")}</SelectItem>
                                                        <SelectItem value="IN_PROGRESS">{processStatusLabel("IN_PROGRESS")}</SelectItem>
                                                        <SelectItem value="BLOCKED">{processStatusLabel("BLOCKED")}</SelectItem>
                                                        <SelectItem value="DONE">{processStatusLabel("DONE")}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                {item.linked_task_id ? (
                                                    <Link href={`/admin/tarefas?openTask=${item.linked_task_id}`} className="text-xs underline">
                                                        Abrir tarefa
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Sem tarefa vinculada</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {executionItems.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Sem processos de execução.</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Imagens da Obra</p>
                            <div className="grid gap-2 md:grid-cols-[220px_1fr_1fr_auto]">
                                <Select value={uploadType} onValueChange={(value) => setUploadType(value as WorkImageType)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CAPA">Capa</SelectItem>
                                        <SelectItem value="PERFIL">Perfil</SelectItem>
                                        <SelectItem value="ANTES">Antes</SelectItem>
                                        <SelectItem value="DEPOIS">Depois</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
                                <Input
                                    value={uploadCaption}
                                    onChange={(event) => setUploadCaption(event.target.value)}
                                    placeholder="Legenda (opcional)"
                                />
                                <Button onClick={handleUploadImage} disabled={isSaving || !uploadFile}>
                                    Upload
                                </Button>
                            </div>

                            <div className="space-y-3">
                                <ImageGallery label="Capa" items={coverImages} onDelete={handleDeleteImage} />
                                <ImageGallery label="Perfil" items={profileImages} onDelete={handleDeleteImage} />
                                <ImageGallery label="Antes" items={beforeImages} onDelete={handleDeleteImage} />
                                <ImageGallery label="Depois" items={afterImages} onDelete={handleDeleteImage} />
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Orçamentos vinculados</p>
                            <div className="space-y-2">
                                {proposalLinks.map((link) => (
                                    <div key={link.proposal_id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                                        <Badge variant={link.is_primary ? "default" : "outline"}>
                                            {link.is_primary ? "Principal" : "Vinculado"}
                                        </Badge>
                                        <Link href={`/admin/orcamentos?proposalId=${link.proposal_id}`} className="underline">
                                            #{link.proposal_id.slice(0, 8)}
                                        </Link>
                                        <span className="text-muted-foreground">{link.proposal?.status || "-"}</span>
                                        <span className="text-muted-foreground">modo {link.proposal?.source_mode || "legacy"}</span>
                                        <span className="text-muted-foreground">potência {typeof link.proposal?.total_power === "number" ? `${link.proposal.total_power.toFixed(2)} kWp` : "-"}</span>
                                        <span className="text-xs text-muted-foreground">{formatDateTime(link.linked_at)}</span>
                                    </div>
                                ))}
                                {proposalLinks.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem orçamentos vinculados.</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
