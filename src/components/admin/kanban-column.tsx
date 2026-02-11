"use client"

import { useDroppable } from "@dnd-kit/core"
import { Indication, IndicationCard } from "./indication-card"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

type Props = {
    id: string
    title: string
    items: Indication[]
    dragDisabled?: boolean
}

export function KanbanColumn({ id, title, items, dragDisabled = false }: Props) {
    const { setNodeRef } = useDroppable({
        id: id,
    })

    return (
        <div className="flex w-80 min-w-[320px] flex-col rounded-md bg-secondary/30">
            <div className="p-3 font-semibold text-sm flex justify-between items-center bg-secondary/50 rounded-t-md">
                <span>{title}</span>
                <span className="bg-background text-xs px-2 py-0.5 rounded-full border">
                    {items.length}
                </span>
            </div>

            <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[150px]">
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                        <IndicationCard key={item.id} item={item} dragDisabled={dragDisabled} />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}
