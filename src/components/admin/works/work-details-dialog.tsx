"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Loader2, Paperclip, Trash2 } from "lucide-react"
import {
    addWorkComment,
    addWorkImage,
    addWorkProcessItem,
    deleteWorkComment,
    deleteWorkImage,
    deleteWorkProcessItem,
    getWorkCardById,
    getWorkComments,
    getWorkImageOriginalAssetUrls,
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
import {
    MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
    uploadWorkCommentAttachments,
    validateWorkCommentAttachmentFiles
} from "@/lib/work-comment-attachments"
import { useToast } from "@/hooks/use-toast"
import { useAuthSession } from "@/hooks/use-auth-session"
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
import { getProductRealtimeInfo, type ProductRealtimeInfo } from "@/services/product-service"

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

function formatAttachmentSize(size: number | null | undefined) {
    if (!size || size <= 0) return "0 B"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getSnapshotValue(snapshot: unknown, path: string): unknown {
    if (!snapshot || typeof snapshot !== "object") return null
    const keys = path.split(".")
    let current: any = snapshot

    for (const key of keys) {
        if (!current || typeof current !== "object") return null
        current = current[key]
    }

    return current ?? null
}

function formatSnapshotValue(value: unknown, format?: "number" | "integer" | "datetime", unit?: string) {
    if (value === null || value === undefined || value === "") return "-"

    if (format === "datetime") {
        return formatDateTime(String(value))
    }

    if (format === "number" || format === "integer") {
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) return "-"
        const valueText =
            format === "integer"
                ? parsed.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                : parsed.toLocaleString("pt-BR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                })
        return unit ? `${valueText} ${unit}` : valueText
    }

    return String(value)
}

function formatInverterModels(snapshot: unknown) {
    const raw = getSnapshotValue(snapshot, "equipment.inverters")
    if (!Array.isArray(raw) || raw.length === 0) return "-"

    const labels = raw
        .map((item) => {
            if (!item || typeof item !== "object") return null
            const row = item as Record<string, unknown>
            const modelOrName = typeof row.model === "string" && row.model.trim()
                ? row.model.trim()
                : typeof row.name === "string" && row.name.trim()
                    ? row.name.trim()
                    : null
            if (!modelOrName) return null

            const kind = typeof row.inverter_type === "string" && row.inverter_type.trim()
                ? ` (${row.inverter_type.trim().toUpperCase()})`
                : ""
            const quantity = Number(row.quantity)
            const quantityLabel = Number.isFinite(quantity) && quantity > 0 ? ` x${quantity}` : ""

            return `${modelOrName}${kind}${quantityLabel}`
        })
        .filter((value): value is string => Boolean(value))

    if (labels.length === 0) return "-"
    return labels.join(" | ")
}

function formatTotalInverterQuantity(snapshot: unknown) {
    const raw = getSnapshotValue(snapshot, "equipment.inverters")
    if (!Array.isArray(raw) || raw.length === 0) return "-"

    const total = raw.reduce((acc, item) => {
        if (!item || typeof item !== "object") return acc
        const quantity = Number((item as Record<string, unknown>).quantity)
        return Number.isFinite(quantity) ? acc + quantity : acc
    }, 0)

    return total > 0 ? total.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-"
}

type SnapshotModule = {
    product_id: string | null
    name: string | null
    model: string | null
    manufacturer: string | null
    power_w: number | null
}

type SnapshotInverter = {
    product_id: string | null
    name: string | null
    model: string | null
    manufacturer: string | null
    inverter_type: string | null
    quantity: number | null
    power_kw: number | null
    power_w: number | null
    purchase_required: boolean
}

type TechnicalProductTarget = {
    product_id: string
    title: string
    subtitle: string
    purchase_required?: boolean
}

function getSnapshotModule(snapshot: unknown): SnapshotModule | null {
    const raw = getSnapshotValue(snapshot, "equipment.module")
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const row = raw as Record<string, unknown>
    const powerRaw = Number(row.power ?? row.power_w)
    return {
        product_id: typeof row.product_id === "string" ? row.product_id : null,
        name: typeof row.name === "string" ? row.name : null,
        model: typeof row.model === "string" ? row.model : null,
        manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
        power_w: Number.isFinite(powerRaw) ? powerRaw : null,
    }
}

function getSnapshotInverters(snapshot: unknown): SnapshotInverter[] {
    const raw = getSnapshotValue(snapshot, "equipment.inverters")
    if (!Array.isArray(raw)) return []

    return raw
        .map((item) => {
            if (!item || typeof item !== "object") return null
            const row = item as Record<string, unknown>
            const quantityRaw = Number(row.quantity)
            const powerKwRaw = Number(row.power_kw)
            const powerWRaw = Number(row.power_w ?? row.power)
            return {
                product_id: typeof row.product_id === "string" ? row.product_id : null,
                name: typeof row.name === "string" ? row.name : null,
                model: typeof row.model === "string" ? row.model : null,
                manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
                inverter_type: typeof row.inverter_type === "string" ? row.inverter_type : null,
                quantity: Number.isFinite(quantityRaw) ? quantityRaw : null,
                power_kw: Number.isFinite(powerKwRaw) && powerKwRaw > 0 ? powerKwRaw : null,
                power_w: Number.isFinite(powerWRaw) && powerWRaw > 0 ? powerWRaw : null,
                purchase_required: row.purchase_required === true,
            } satisfies SnapshotInverter
        })
        .filter((item): item is SnapshotInverter => Boolean(item))
}

function formatInverterManufacturers(snapshot: unknown) {
    const manufacturers = getSnapshotInverters(snapshot)
        .map((row) => row.manufacturer?.trim())
        .filter((value): value is string => Boolean(value))

    const unique = Array.from(new Set(manufacturers))
    if (unique.length === 0) return "-"
    return unique.join(" | ")
}

function formatInverterPowers(snapshot: unknown) {
    const labels = getSnapshotInverters(snapshot)
        .map((row) => {
            const powerKw = row.power_kw ?? (row.power_w && row.power_w > 0 ? row.power_w / 1000 : null)
            if (!powerKw || !Number.isFinite(powerKw)) return null
            const quantity = row.quantity && row.quantity > 0 ? ` x${row.quantity}` : ""
            const powerLabel = powerKw.toLocaleString("pt-BR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            })
            return `${powerLabel} kW${quantity}`
        })
        .filter((value): value is string => Boolean(value))

    if (labels.length === 0) return "-"
    return labels.join(" | ")
}

function formatModuleSelectionLabel(item: SnapshotModule) {
    const name = item.model || item.name || "Placa sem nome"
    const manufacturer = item.manufacturer ? ` • ${item.manufacturer}` : ""
    const power = item.power_w && item.power_w > 0
        ? ` • ${Number(item.power_w).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} W`
        : ""
    return `${name}${manufacturer}${power}`
}

function formatInverterSelectionLabel(item: SnapshotInverter) {
    const modelOrName = item.model || item.name || "Inversor"
    const manufacturer = item.manufacturer ? ` • ${item.manufacturer}` : ""
    const powerKw = item.power_kw ?? (item.power_w && item.power_w > 0 ? item.power_w / 1000 : null)
    const power = powerKw
        ? ` • ${powerKw.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kW`
        : ""
    const quantity = item.quantity && item.quantity > 0 ? ` x${item.quantity}` : ""
    return `${modelOrName}${manufacturer}${power}${quantity}`
}

function buildTechnicalSnapshotRows(snapshot: unknown) {
    const moduleFromSnapshot = getSnapshotModule(snapshot)
    const rows = [
        {
            label: "Origem do orçamento",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.source_mode")),
        },
        {
            label: "Orçamento",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.proposal_id")),
        },
        {
            label: "Atualizado em",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.proposal_updated_at"), "datetime"),
        },
        {
            label: "Código da instalação",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.codigo_instalacao")),
        },
        {
            label: "Código do cliente",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.codigo_cliente")),
        },
        {
            label: "Unidade consumidora",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.unidade_consumidora")),
        },
        {
            label: "Quantidade de módulos",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.qtd_modulos"), "integer"),
        },
        {
            label: "Potência do módulo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.potencia_modulo_w"), "number", "W"),
        },
        {
            label: "Potência da placa selecionada",
            value: formatSnapshotValue(moduleFromSnapshot?.power_w, "number", "W"),
        },
        {
            label: "Modelo do módulo",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "equipment.module.model") ??
                    getSnapshotValue(snapshot, "equipment.module.name")
            ),
        },
        {
            label: "Fabricante do módulo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "equipment.module.manufacturer")),
        },
        {
            label: "Potência total",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "dimensioning.output_dimensioning.kWp") ??
                    getSnapshotValue(snapshot, "dimensioning.total_power"),
                "number",
                "kWp"
            ),
        },
        {
            label: "Produção estimada",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.output_dimensioning.kWh_estimado"), "number", "kWh"),
        },
        {
            label: "Tipo de inversor",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "dimensioning.inverter.tipo") ??
                    getSnapshotValue(snapshot, "dimensioning.input_dimensioning.tipo_inversor")
            ),
        },
        {
            label: "Modelo(s) de inversor(es)",
            value: formatInverterModels(snapshot),
        },
        {
            label: "Marca(s) de inversor(es)",
            value: formatInverterManufacturers(snapshot),
        },
        {
            label: "Potência(s) de inversor(es)",
            value: formatInverterPowers(snapshot),
        },
        {
            label: "Qtd. inversor(es)",
            value: formatTotalInverterQuantity(snapshot),
        },
        {
            label: "Qtd. inversor string",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "dimensioning.inverter.qtd_string") ??
                    getSnapshotValue(snapshot, "dimensioning.input_dimensioning.qtd_inversor_string"),
                "integer"
            ),
        },
        {
            label: "Qtd. micro inversor",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "dimensioning.inverter.qtd_micro") ??
                    getSnapshotValue(snapshot, "dimensioning.input_dimensioning.qtd_inversor_micro"),
                "integer"
            ),
        },
        {
            label: "Potência inversor string",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.inverter.pot_string_kw"), "number", "kW"),
        },
        {
            label: "Potência micro total",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.inverter.pot_micro_total_kw"), "number", "kW"),
        },
        {
            label: "Índice de produção",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.indice_producao"), "number"),
        },
        {
            label: "Fator de oversizing",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.fator_oversizing"), "number"),
        },
        {
            label: "Placas em solo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.structure_quantities.qtd_placas_solo"), "integer"),
        },
        {
            label: "Placas em telhado",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.structure_quantities.qtd_placas_telhado"), "integer"),
        },
    ]

    return rows.filter((row) => row.value !== "-")
}

function ImageGallery({
    label,
    items,
    onOpenImage,
    onDelete,
}: {
    label: string
    items: WorkImage[]
    onOpenImage: (image: WorkImage) => void
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
                                <button
                                    type="button"
                                    className="block w-full"
                                    onClick={() => onOpenImage(image)}
                                >
                                    <img
                                        src={image.signed_url}
                                        alt={image.caption || "Imagem da obra"}
                                        className="h-32 w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            ) : (
                                <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-muted-foreground">
                                    Sem preview
                                </div>
                            )}
                            <div className="space-y-2 p-2">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {image.caption || "Sem descrição"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Toque na imagem para abrir em alta.
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
    const { session } = useAuthSession()
    const currentUserId = session?.user?.id ?? null

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
    const [newGeneralComment, setNewGeneralComment] = useState("")
    const [commentAttachmentFiles, setCommentAttachmentFiles] = useState<File[]>([])

    const [uploadType, setUploadType] = useState<WorkImageType>("ANTES")
    const [uploadCaption, setUploadCaption] = useState("")
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const commentAttachmentInputRef = useRef<HTMLInputElement>(null)

    const [viewerOpen, setViewerOpen] = useState(false)
    const [viewerLoading, setViewerLoading] = useState(false)
    const [viewerImage, setViewerImage] = useState<WorkImage | null>(null)
    const [viewerViewUrl, setViewerViewUrl] = useState<string | null>(null)
    const [viewerDownloadUrl, setViewerDownloadUrl] = useState<string | null>(null)
    const [viewerError, setViewerError] = useState<string | null>(null)
    const [productDialogOpen, setProductDialogOpen] = useState(false)
    const [productDialogLoading, setProductDialogLoading] = useState(false)
    const [selectedTechnicalProduct, setSelectedTechnicalProduct] = useState<TechnicalProductTarget | null>(null)
    const [selectedProductInfo, setSelectedProductInfo] = useState<ProductRealtimeInfo | null>(null)
    const [productDialogError, setProductDialogError] = useState<string | null>(null)

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

    const generalComments = useMemo(
        () => comments.filter((item) => item.comment_type === "GERAL"),
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

    function handleGeneralCommentAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
        setCommentAttachmentFiles(Array.from(event.target.files ?? []))
    }

    async function handleAddGeneralComment() {
        if (!workId) return
        if (!newGeneralComment.trim()) return

        const validationError = validateWorkCommentAttachmentFiles(commentAttachmentFiles, {
            maxCount: MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
        })
        if (validationError) {
            showToast({ title: "Anexo inválido", description: validationError, variant: "error" })
            return
        }

        setIsSaving(true)
        try {
            let uploadedAttachments: Array<{
                path: string
                name: string
                size: number | null
                content_type: string | null
            }> = []
            let uploadFailedCount = 0

            if (commentAttachmentFiles.length > 0) {
                const uploadResult = await uploadWorkCommentAttachments(workId, commentAttachmentFiles, {
                    maxCount: MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
                })
                uploadFailedCount = uploadResult.failed.length

                if (uploadResult.error && uploadResult.uploaded.length === 0) {
                    showToast({ title: "Erro no upload", description: uploadResult.error, variant: "error" })
                    return
                }

                uploadedAttachments = uploadResult.uploaded
            }

            const result = await addWorkComment({
                workId,
                content: newGeneralComment,
                commentType: "GERAL",
                phase: work?.projeto_liberado_at ? "EXECUCAO" : "PROJETO",
                attachments: uploadedAttachments,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            setNewGeneralComment("")
            setCommentAttachmentFiles([])
            if (commentAttachmentInputRef.current) {
                commentAttachmentInputRef.current.value = ""
            }

            if (uploadFailedCount > 0) {
                showToast({
                    title: "Comentário salvo com ressalvas",
                    description: `${uploadFailedCount} anexo(s) não foram enviados.`,
                    variant: "error",
                })
            } else {
                showToast({ title: "Comentário salvo", variant: "success" })
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteComment(comment: WorkComment) {
        if (!comment.user_id || comment.user_id !== currentUserId) {
            showToast({ title: "Sem permissão", description: "Você só pode excluir seus próprios comentários.", variant: "error" })
            return
        }

        const confirmed = window.confirm("Deseja excluir este comentário?")
        if (!confirmed) return

        setIsSaving(true)
        try {
            const result = await deleteWorkComment(comment.id)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Comentário excluído", variant: "success" })
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

    async function handleOpenImageViewer(image: WorkImage) {
        setViewerOpen(true)
        setViewerImage(image)
        setViewerLoading(true)
        setViewerViewUrl(null)
        setViewerDownloadUrl(null)
        setViewerError(null)

        try {
            const result = await getWorkImageOriginalAssetUrls(image.id)
            if (result.error || !result.viewUrl) {
                const errorMessage = result.error ?? "Falha ao carregar imagem em alta."
                setViewerError(errorMessage)
                showToast({ title: "Erro", description: errorMessage, variant: "error" })
                return
            }

            setViewerViewUrl(result.viewUrl)
            setViewerDownloadUrl(result.downloadUrl ?? null)
        } finally {
            setViewerLoading(false)
        }
    }

    function handleViewerOpenChange(nextOpen: boolean) {
        setViewerOpen(nextOpen)
        if (nextOpen) return

        setViewerLoading(false)
        setViewerImage(null)
        setViewerViewUrl(null)
        setViewerDownloadUrl(null)
        setViewerError(null)
    }

    function handleProductDialogOpenChange(nextOpen: boolean) {
        setProductDialogOpen(nextOpen)
        if (nextOpen) return

        setProductDialogLoading(false)
        setSelectedTechnicalProduct(null)
        setSelectedProductInfo(null)
        setProductDialogError(null)
    }

    async function handleOpenTechnicalProduct(target: TechnicalProductTarget) {
        setSelectedTechnicalProduct(target)
        setSelectedProductInfo(null)
        setProductDialogError(null)
        setProductDialogLoading(true)
        setProductDialogOpen(true)

        try {
            const realtimeInfo = await getProductRealtimeInfo(target.product_id)
            if (!realtimeInfo) {
                setProductDialogError("Produto não encontrado no estoque atual.")
                return
            }
            setSelectedProductInfo(realtimeInfo)
        } catch (error) {
            console.error("Erro ao carregar produto em tempo real:", error)
            setProductDialogError("Não foi possível carregar os dados atuais do produto.")
        } finally {
            setProductDialogLoading(false)
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

    const technicalSnapshot = work?.technical_snapshot ?? {}
    const technicalRows = buildTechnicalSnapshotRows(technicalSnapshot)
    const technicalModule = getSnapshotModule(technicalSnapshot)
    const technicalInverters = getSnapshotInverters(technicalSnapshot)

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
                                {technicalRows.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem dados técnicos registrados.</p>
                                ) : (
                                    <div className="max-h-72 overflow-auto rounded-md border bg-slate-50 p-3">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div className="rounded-md border bg-white p-2 text-xs">
                                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Placa selecionada</p>
                                                {technicalModule?.product_id ? (
                                                    <button
                                                        type="button"
                                                        className="mt-1 w-full rounded-md border border-dashed px-2 py-1 text-left text-sm font-medium text-foreground hover:bg-slate-50"
                                                        onClick={() =>
                                                            handleOpenTechnicalProduct({
                                                                product_id: technicalModule.product_id!,
                                                                title: technicalModule.model || technicalModule.name || "Placa",
                                                                subtitle: formatModuleSelectionLabel(technicalModule),
                                                            })
                                                        }
                                                    >
                                                        {formatModuleSelectionLabel(technicalModule)}
                                                    </button>
                                                ) : (
                                                    <p className="mt-1 text-sm font-medium text-foreground">-</p>
                                                )}
                                            </div>
                                            <div className="rounded-md border bg-white p-2 text-xs">
                                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Inversores selecionados</p>
                                                {technicalInverters.filter((item) => item.product_id).length > 0 ? (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {technicalInverters
                                                            .filter((item): item is SnapshotInverter & { product_id: string } => Boolean(item.product_id))
                                                            .map((item, index) => (
                                                                <button
                                                                    key={`${item.product_id}-${index}`}
                                                                    type="button"
                                                                    className="rounded-md border border-dashed px-2 py-1 text-left text-xs font-medium hover:bg-slate-50"
                                                                    onClick={() =>
                                                                        handleOpenTechnicalProduct({
                                                                            product_id: item.product_id,
                                                                            title: item.model || item.name || "Inversor",
                                                                            subtitle: formatInverterSelectionLabel(item),
                                                                            purchase_required: item.purchase_required,
                                                                        })
                                                                    }
                                                                >
                                                                    {formatInverterSelectionLabel(item)}
                                                                </button>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-1 text-sm font-medium text-foreground">-</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                            {technicalRows.map((entry) => (
                                                <div key={`${entry.label}-${entry.value}`} className="rounded-md border bg-white p-2 text-xs">
                                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{entry.label}</p>
                                                    <p className="mt-1 text-sm font-medium text-foreground">{entry.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-3 text-[11px] text-muted-foreground">
                                            Somente informações técnicas do orçamento são exibidas aqui.
                                        </p>
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
                                            const isOwnComment = Boolean(comment.user_id && comment.user_id === currentUserId)
                                            return (
                                                <div key={comment.id} className="rounded-md bg-slate-50 p-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs text-muted-foreground">
                                                            {author} • {formatDateTime(comment.created_at)}
                                                        </p>
                                                        {isOwnComment ? (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                                onClick={() => handleDeleteComment(comment)}
                                                                disabled={isSaving}
                                                            >
                                                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                                Excluir
                                                            </Button>
                                                        ) : null}
                                                    </div>
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

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Comentários da obra</p>
                            <Textarea
                                value={newGeneralComment}
                                onChange={(event) => setNewGeneralComment(event.target.value)}
                                placeholder="Escreva um comentário técnico, atualização de andamento ou observação da obra."
                            />
                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                                <Input
                                    ref={commentAttachmentInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                                    onChange={handleGeneralCommentAttachmentChange}
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleAddGeneralComment}
                                    disabled={isSaving || !newGeneralComment.trim()}
                                >
                                    Salvar comentário
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Até {MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT} anexos por comentário (PDF, imagens, DOC/DOCX, XLS/XLSX; máximo 10MB por arquivo).
                            </p>
                            {commentAttachmentFiles.length > 0 ? (
                                <div className="rounded-md border bg-slate-50 p-2 text-xs text-muted-foreground">
                                    {commentAttachmentFiles.length} arquivo(s) selecionado(s):
                                    <span className="ml-1">
                                        {commentAttachmentFiles.map((file) => file.name).join(", ")}
                                    </span>
                                </div>
                            ) : null}
                            <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-2">
                                {generalComments.map((comment) => {
                                    const author = comment.user?.name || comment.user?.email || "Usuário interno"
                                    const isOwnComment = Boolean(comment.user_id && comment.user_id === currentUserId)
                                    return (
                                        <div key={comment.id} className="rounded-md bg-slate-50 p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs text-muted-foreground">
                                                    {author} • {formatDateTime(comment.created_at)}
                                                </p>
                                                {isOwnComment ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                        onClick={() => handleDeleteComment(comment)}
                                                        disabled={isSaving}
                                                    >
                                                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                        Excluir
                                                    </Button>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
                                            {comment.attachments.length > 0 ? (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {comment.attachments.map((attachment) => (
                                                        attachment.signed_url ? (
                                                            <a
                                                                key={attachment.path}
                                                                href={attachment.signed_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                                                            >
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                <span>{attachment.name}</span>
                                                                <span className="text-muted-foreground">
                                                                    ({formatAttachmentSize(attachment.size)})
                                                                </span>
                                                            </a>
                                                        ) : (
                                                            <span
                                                                key={attachment.path}
                                                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-muted-foreground"
                                                            >
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                <span>{attachment.name}</span>
                                                                <span>({formatAttachmentSize(attachment.size)})</span>
                                                            </span>
                                                        )
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                                {generalComments.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhum comentário registrado.</p>
                                ) : null}
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
                                <ImageGallery
                                    label="Capa"
                                    items={coverImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Perfil"
                                    items={profileImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Antes"
                                    items={beforeImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Depois"
                                    items={afterImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
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

            <Dialog open={viewerOpen} onOpenChange={handleViewerOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewerImage?.caption || "Imagem da obra"}</DialogTitle>
                        <DialogDescription>
                            Visualização em alta qualidade sob demanda.
                        </DialogDescription>
                    </DialogHeader>

                    {viewerLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : viewerError ? (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {viewerError}
                        </div>
                    ) : viewerViewUrl ? (
                        <div className="overflow-hidden rounded-md border bg-slate-100">
                            <img
                                src={viewerViewUrl}
                                alt={viewerImage?.caption || "Imagem da obra"}
                                className="max-h-[70vh] w-full object-contain"
                                decoding="async"
                            />
                        </div>
                    ) : (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            Imagem indisponível no momento.
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        {viewerDownloadUrl ? (
                            <Button asChild variant="outline">
                                <a href={viewerDownloadUrl} target="_blank" rel="noopener noreferrer">
                                    Baixar original
                                </a>
                            </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => handleViewerOpenChange(false)}>
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={productDialogOpen} onOpenChange={handleProductDialogOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedTechnicalProduct?.title || "Detalhes do equipamento"}</DialogTitle>
                        <DialogDescription>
                            Estoque em tempo real do produto selecionado.
                        </DialogDescription>
                    </DialogHeader>

                    {productDialogLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : productDialogError ? (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {productDialogError}
                        </div>
                    ) : selectedProductInfo ? (
                        <div className="space-y-3 rounded-md border bg-slate-50 p-3 text-sm">
                            <div className="space-y-1 rounded-md border bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Produto</p>
                                <p className="font-medium">{selectedProductInfo.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {selectedTechnicalProduct?.subtitle || "-"}
                                </p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Fabricante</p>
                                    <p className="font-medium">{selectedProductInfo.manufacturer || "-"}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Modelo</p>
                                    <p className="font-medium">{selectedProductInfo.model || "-"}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Potência</p>
                                    <p className="font-medium">
                                        {typeof selectedProductInfo.power === "number"
                                            ? `${selectedProductInfo.power.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} W`
                                            : "-"}
                                    </p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Estoque atual</p>
                                    <p className="font-medium">
                                        Total {selectedProductInfo.stock_total} • Reservado {selectedProductInfo.stock_reserved} • Disponível {selectedProductInfo.stock_available}
                                    </p>
                                </div>
                            </div>
                            {selectedTechnicalProduct?.purchase_required ? (
                                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                    Compra necessária: este inversor foi salvo com potência manual no orçamento.
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            Produto indisponível no momento.
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        {selectedProductInfo ? (
                            <Button asChild variant="outline">
                                <Link href={`/admin/estoque/${selectedProductInfo.id}`}>Abrir no estoque</Link>
                            </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => handleProductDialogOpenChange(false)}>
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
