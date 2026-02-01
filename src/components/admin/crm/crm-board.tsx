"use client"

import { useState } from "react"
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { CrmColumn } from "./crm-column"
import { CrmCard, type CrmCardData } from "./crm-card"
import { updateCrmCardStage } from "@/app/actions/crm"
import { useToast } from "@/hooks/use-toast"

type Stage = {
    id: string
    name: string
    sort_order: number
    is_closed: boolean
}

type Props = {
    stages: Stage[]
    cards: CrmCardData[]
}

export function CrmBoard({ stages, cards }: Props) {
    const [items, setItems] = useState<CrmCardData[]>(cards)
    const [activeId, setActiveId] = useState<string | null>(null)
    const { showToast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as string)
    }

    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        const activeItem = items.find((i) => i.id === activeId)
        if (!activeItem) return

        const isOverColumn = stages.some((stage) => stage.id === overId)
        if (isOverColumn && activeItem.stage_id !== overId) {
            setItems((prev) =>
                prev.map((item) =>
                    item.id === activeId ? { ...item, stage_id: overId } : item
                )
            )
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        const activeItem = items.find((i) => i.id === activeId)
        if (!activeItem) return

        let newStageId = activeItem.stage_id

        if (stages.some((stage) => stage.id === overId)) {
            newStageId = overId
        } else {
            const overItem = items.find((i) => i.id === overId)
            if (overItem) {
                newStageId = overItem.stage_id
            }
        }

        if (activeItem.stage_id !== newStageId) {
            const previousStageId = activeItem.stage_id
            setItems((prev) =>
                prev.map((item) =>
                    item.id === activeId ? { ...item, stage_id: newStageId } : item
                )
            )

            const result = await updateCrmCardStage(activeId, newStageId)
            if (result?.error) {
                setItems((prev) =>
                    prev.map((item) =>
                        item.id === activeId ? { ...item, stage_id: previousStageId } : item
                    )
                )
                showToast({
                    variant: "error",
                    title: "Erro ao mover card",
                    description: result.error,
                })
            }
        }
    }

    const activeCard = items.find((i) => i.id === activeId)

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-4 overflow-x-auto pb-4">
                {stages.map((stage) => (
                    <CrmColumn
                        key={stage.id}
                        id={stage.id}
                        title={stage.name}
                        isClosed={stage.is_closed}
                        items={items.filter((card) => card.stage_id === stage.id)}
                    />
                ))}
            </div>

            <DragOverlay>
                {activeCard ? <CrmCard item={activeCard} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    )
}
