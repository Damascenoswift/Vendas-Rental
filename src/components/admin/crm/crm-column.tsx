"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Badge } from "@/components/ui/badge"
import { CrmCard, CrmCardData } from "./crm-card"

type Props = {
    id: string
    title: string
    isClosed?: boolean
    items: CrmCardData[]
    stageOptions?: Array<{ id: string; name: string }>
    onCardClick?: (item: CrmCardData) => void
    onCardStageChange?: (cardId: string, stageId: string) => void | Promise<void>
    onCardDelete?: (item: CrmCardData) => void | Promise<void>
    canEdit?: boolean
}

export function CrmColumn({
    id,
    title,
    isClosed,
    items,
    stageOptions,
    onCardClick,
    onCardStageChange,
    onCardDelete,
    canEdit = true,
}: Props) {
    const { setNodeRef } = useDroppable({ id })

    return (
        <div className="flex w-80 min-w-[320px] flex-col rounded-md bg-secondary/30">
            <div className="p-3 text-sm font-semibold flex items-center justify-between bg-secondary/50 rounded-t-md">
                <div className="flex items-center gap-2">
                    <span>{title}</span>
                    {isClosed ? (
                        <Badge variant="secondary" className="text-[10px] h-5">
                            Final
                        </Badge>
                    ) : null}
                </div>
                <span className="bg-background text-xs px-2 py-0.5 rounded-full border">
                    {items.length}
                </span>
            </div>

            <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[150px]" data-column-id={id}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                        <CrmCard
                            key={item.id}
                            item={item}
                            onClick={onCardClick}
                            stageOptions={canEdit ? stageOptions : undefined}
                            onStageChange={canEdit ? (stageId) => onCardStageChange?.(item.id, stageId) : undefined}
                            onDelete={canEdit && onCardDelete ? () => onCardDelete(item) : undefined}
                            dragDisabled={!canEdit}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}
