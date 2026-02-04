"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
}: {
    item: CrmCardData
    isOverlay?: boolean
    onClick?: (item: CrmCardData) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
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
            className="w-full cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-background"
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
                </div>
                <div className="font-semibold text-sm line-clamp-2">{displayName}</div>
            </CardHeader>
            <CardContent className="p-3 pt-2">
                <div className="text-xs font-medium text-green-600">
                    {formatCurrency(item.indicacoes?.valor)}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                    ID: {item.indicacao_id.slice(0, 8)}
                </div>
            </CardContent>
        </Card>
    )
}
