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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Indication, IndicationCard } from "./indication-card"
import { KanbanColumn } from "./kanban-column"
import { updateIndicationStatus } from "@/app/actions/admin-indications"
import { useToast } from "@/hooks/use-toast"

type Props = {
    items: Indication[]
    canEdit?: boolean
}

const COLUMNS = [
    { id: "EM_ANALISE", title: "Em Análise" },
    { id: "FALTANDO_DOCUMENTACAO", title: "Faltando Doc." },
    { id: "AGUARDANDO_ASSINATURA", title: "Aguardando Ass." },
    { id: "ENERGISA_ANALISE", title: "Energisa (Análise)" },
    { id: "ENERGISA_APROVADO", title: "Energisa (Aprov.)" },
    { id: "INSTALACAO_AGENDADA", title: "Instalação" },
    { id: "CONCLUIDA", title: "Concluída" },
    { id: "REJEITADA", title: "Rejeitada" },
]

export function IndicationsKanban({ items: initialItems, canEdit = true }: Props) {
    const [items, setItems] = useState<Indication[]>(initialItems)
    const [activeId, setActiveId] = useState<string | null>(null)
    const { showToast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Avoid accidental drags on clicks
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    function handleDragStart(event: DragStartEvent) {
        if (!canEdit) return
        setActiveId(event.active.id as string)
    }

    function handleDragOver(event: DragOverEvent) {
        if (!canEdit) return
        const { active, over } = event
        if (!over) return

        const activeId = active.id
        const overId = over.id

        // Find the containers
        const activeItem = items.find((i) => i.id === activeId)
        const overItem = items.find((i) => i.id === overId)

        if (!activeItem) return

        // If dragging over a column directly
        const isOverColumn = COLUMNS.some(col => col.id === overId)
        if (isOverColumn && activeItem.status !== overId) {
            setItems((prev) => {
                return prev.map(item =>
                    item.id === activeId ? { ...item, status: overId as string } : item
                )
            })
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        if (!canEdit) {
            setActiveId(null)
            return
        }

        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        const activeItem = items.find((i) => i.id === activeId)
        if (!activeItem) return

        // Determine new status
        let newStatus = activeItem.status

        // If dropped on a column
        if (COLUMNS.some((col) => col.id === overId)) {
            newStatus = overId
        } else {
            // If dropped on another item, take that item's status
            const overItem = items.find((i) => i.id === overId)
            if (overItem) {
                newStatus = overItem.status
            }
        }

        // Check if status actually changed
        // (Note: we might have optimistically updated in dragOver, so we need to track original vs final if we strictly want to minimize calls, 
        //  but simpler to just ensure the server is notified of the final state)

        // Optimistic update is already preserved by state definition in DragOver if we did it there. 
        // If we didn't do it there, we do it here. 
        // Let's force update here to be sure.

        if (activeItem.status !== newStatus) {
            setItems((prev) => {
                return prev.map(item =>
                    item.id === activeId ? { ...item, status: newStatus } : item
                )
            })

            // Server Action
            try {
                const res = await updateIndicationStatus(activeId, newStatus)
                if (res?.error) {
                    throw new Error(res.error)
                }
            } catch (error) {
                showToast({
                    variant: "error",
                    title: "Erro ao atualizar",
                    description: "Não foi possível salvar o novo status.",
                })
                // Revert
                // (Ideally we reload or revert state here)
            }
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-4 overflow-x-auto pb-4">
                {COLUMNS.map((col) => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        items={items.filter((i) => i.status === col.id)}
                        dragDisabled={!canEdit}
                    />
                ))}
            </div>

            <DragOverlay>
                {activeId ? (
                    <IndicationCard item={items.find((i) => i.id === activeId)!} isOverlay />
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}
