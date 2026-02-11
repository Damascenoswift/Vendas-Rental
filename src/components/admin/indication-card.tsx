"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export type Indication = {
    id: string
    nome: string
    status: string
    valor: number
    marca: string
    users: { name?: string; email?: string }
    created_at: string
}

type Props = {
    item: Indication
    isOverlay?: boolean
    dragDisabled?: boolean
}

function getInitials(name: string) {
    return name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
}

export function IndicationCard({ item, isOverlay, dragDisabled = false }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: item.id,
        disabled: dragDisabled,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    if (isOverlay) {
        return (
            <Card className="w-full cursor-grabbing shadow-lg border-primary/50 bg-background rotate-2">
                <CardHeader className="p-3 pb-0 space-y-0">
                    <div className="flex justify-between items-start">
                        <Badge variant={item.marca === "rental" ? "default" : "secondary"} className="mb-2 text-[10px]">
                            {item.marca.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="font-semibold text-sm line-clamp-1">{item.nome}</div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                    <div className="text-xs text-muted-foreground">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor || 0)}
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
        >
            <CardHeader className="p-3 pb-0 space-y-0">
                <div className="flex justify-between items-start">
                    <Badge variant={item.marca === "rental" ? "default" : "secondary"} className="mb-2 text-[10px] px-1 h-5">
                        {item.marca.toUpperCase()}
                    </Badge>
                </div>
                <div className="font-semibold text-sm line-clamp-1">{item.nome}</div>
            </CardHeader>
            <CardContent className="p-3 pt-1 pb-2">
                <div className="text-xs font-medium text-green-600">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.valor || 0)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px]">
                            {getInitials((item.users?.name || item.users?.email || "?"))}
                        </AvatarFallback>
                    </Avatar>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                        {item.users?.name || item.users?.email}
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
