"use client"

import { type MouseEvent, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { FileText, Loader2, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { generateContractFromIndication } from "@/app/actions/contracts-generation"

export type CrmCardData = {
    id: string
    stage_id: string
    indicacao_id: string
    title: string | null
    created_at?: string
    indicacoes?: {
        id?: string
        tipo?: string | null
        nome?: string | null
        email?: string | null
        telefone?: string | null
        status?: string | null
        documento?: string | null
        unidade_consumidora?: string | null
        codigo_cliente?: string | null
        codigo_instalacao?: string | null
        valor?: number | null
        marca?: string | null
        user_id?: string | null
        created_by_supervisor_id?: string | null
    } | null
}

function formatCurrency(value?: number | null) {
    if (typeof value !== "number") return "-"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export function CrmCard({
    item,
    isOverlay,
    onClick,
    stageOptions,
    onStageChange,
    onDelete,
    dragDisabled = false,
}: {
    item: CrmCardData
    isOverlay?: boolean
    onClick?: (item: CrmCardData) => void
    stageOptions?: Array<{ id: string; name: string }>
    onStageChange?: (stageId: string) => void | Promise<void>
    onDelete?: (item: CrmCardData) => void | Promise<void>
    dragDisabled?: boolean
}) {
    const { showToast } = useToast()
    const [isGeneratingContract, setIsGeneratingContract] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        disabled: dragDisabled,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const brand = (item.indicacoes?.marca ?? "dorata").toUpperCase()
    const displayName =
        item.indicacoes?.nome ||
        item.title ||
        `Indicacao ${item.indicacao_id.slice(0, 8)}`
    const isRental = (item.indicacoes?.marca ?? "dorata") === "rental"

    const handleGenerateContract = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        if (isGeneratingContract) return

        setIsGeneratingContract(true)
        try {
            const result = await generateContractFromIndication(item.indicacao_id)
            if (!result.success) {
                showToast({
                    variant: "error",
                    title: "Erro ao gerar contrato",
                    description: result.message,
                })
                return
            }

            showToast({
                variant: "success",
                title: "Contrato gerado",
                description: "O download será aberto em nova aba.",
            })

            if (result.url) {
                window.open(result.url, "_blank", "noopener,noreferrer")
            }
        } catch {
            showToast({
                variant: "error",
                title: "Erro ao gerar contrato",
                description: "Falha inesperada ao gerar o contrato.",
            })
        } finally {
            setIsGeneratingContract(false)
        }
    }

    const handleDeleteCard = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        if (!onDelete || isDeleting) return
        setIsDeleting(true)
        try {
            await onDelete(item)
        } finally {
            setIsDeleting(false)
        }
    }

    if (isOverlay) {
        return (
            <Card className="w-full cursor-grabbing shadow-lg border-primary/50 bg-background rotate-2">
                <CardHeader className="p-3 pb-0 space-y-0">
                    <div className="flex items-start justify-between">
                        <Badge variant={brand === "RENTAL" ? "default" : "secondary"} className="mb-2 text-[10px] px-1 h-5">
                            {brand}
                        </Badge>
                    </div>
                    <div className="font-semibold text-sm line-clamp-2">{displayName}</div>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                    <div className="text-xs font-medium text-green-600">
                        {formatCurrency(item.indicacoes?.valor)}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`w-full hover:shadow-md transition-shadow bg-background ${dragDisabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            onClick={() => {
                if (isDragging) return
                onClick?.(item)
            }}
        >
            <CardHeader className="p-3 pb-0 space-y-0">
                <div className="flex items-start justify-between">
                    <Badge variant={brand === "RENTAL" ? "default" : "secondary"} className="mb-2 text-[10px] px-1 h-5">
                        {brand}
                    </Badge>
                    <div className="flex items-center gap-1">
                        {isRental ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={handleGenerateContract}
                                onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                }}
                                title="Gerar contrato"
                            >
                                {isGeneratingContract ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                            </Button>
                        ) : null}
                        {onDelete ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={handleDeleteCard}
                                onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                }}
                                title="Excluir card"
                            >
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                        ) : null}
                    </div>
                </div>
                <div className="font-semibold text-sm line-clamp-2">{displayName}</div>
            </CardHeader>
            <CardContent className="p-3 pt-2">
                <div className="text-xs font-medium text-green-600">
                    {formatCurrency(item.indicacoes?.valor)}
                </div>
                {stageOptions && onStageChange ? (
                    <div
                        className="mt-2"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Select
                            value={item.stage_id}
                            onValueChange={(value) => {
                                if (value !== item.stage_id) {
                                    onStageChange(value)
                                }
                            }}
                        >
                            <SelectTrigger className="h-6 text-[10px] px-2 py-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {stageOptions.map((stage) => (
                                    <SelectItem key={stage.id} value={stage.id}>
                                        {stage.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
                <div className="mt-2 text-[10px] text-muted-foreground">
                    ID: {item.indicacao_id.slice(0, 8)}
                </div>
            </CardContent>
        </Card>
    )
}
