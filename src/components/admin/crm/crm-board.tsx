"use client"

import { useCallback, useMemo, useState } from "react"
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
import { deleteCrmCard, updateCrmCardStage } from "@/app/actions/crm"
import { useToast } from "@/hooks/use-toast"
import { IndicationDetailsDialog } from "@/components/admin/indication-details-dialog"

type Stage = {
    id: string
    name: string
    sort_order: number
    is_closed: boolean
}

type Props = {
    stages: Stage[]
    cards: CrmCardData[]
    brand: "dorata" | "rental"
    canEdit?: boolean
}

export function CrmBoard({ stages, cards, brand, canEdit = true }: Props) {
    const [items, setItems] = useState<CrmCardData[]>(cards)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeOriginalStageId, setActiveOriginalStageId] = useState<string | null>(null)
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const { showToast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const stageOptions = useMemo(
        () => stages.map((stage) => ({ id: stage.id, name: stage.name })),
        [stages]
    )

    const persistCardStageChange = useCallback(
        async (cardId: string, previousStageId: string, newStageId: string) => {
            if (!canEdit) return
            if (previousStageId === newStageId) return

            setItems((prev) =>
                prev.map((item) =>
                    item.id === cardId ? { ...item, stage_id: newStageId } : item
                )
            )

            const result = await updateCrmCardStage(cardId, newStageId)
            if (result?.error) {
                setItems((prev) =>
                    prev.map((item) =>
                        item.id === cardId ? { ...item, stage_id: previousStageId } : item
                    )
                )
                showToast({
                    variant: "error",
                    title: "Erro ao mover card",
                    description: result.error,
                })
            }
        },
        [canEdit, showToast]
    )

    const handleDeleteCard = useCallback(
        async (card: CrmCardData) => {
            if (!canEdit) return
            if (brand !== "dorata") return
            const confirmed = window.confirm("Deseja excluir este card do CRM Dorata?")
            if (!confirmed) return

            const previousItems = items
            setItems((prev) => prev.filter((item) => item.id !== card.id))
            if (selectedCardId === card.id) {
                setSelectedCardId(null)
                setIsDetailsOpen(false)
            }

            const result = await deleteCrmCard(card.id, brand)
            if (result?.error) {
                setItems(previousItems)
                showToast({
                    variant: "error",
                    title: "Erro ao excluir card",
                    description: result.error,
                })
            }
        },
        [canEdit, brand, items, selectedCardId, showToast]
    )

    function handleDragStart(event: DragStartEvent) {
        if (!canEdit) return
        const draggedId = event.active.id as string
        const activeItem = items.find((item) => item.id === draggedId)
        setActiveId(draggedId)
        setActiveOriginalStageId(activeItem?.stage_id ?? null)
    }

    function handleDragOver(event: DragOverEvent) {
        if (!canEdit) return
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

    function handleDragCancel() {
        if (!canEdit) return
        if (!activeId || !activeOriginalStageId) {
            setActiveId(null)
            setActiveOriginalStageId(null)
            return
        }

        setItems((prev) =>
            prev.map((item) =>
                item.id === activeId ? { ...item, stage_id: activeOriginalStageId } : item
            )
        )
        setActiveId(null)
        setActiveOriginalStageId(null)
    }

    async function handleDragEnd(event: DragEndEvent) {
        if (!canEdit) {
            setActiveId(null)
            setActiveOriginalStageId(null)
            return
        }

        const { active, over } = event
        const draggedId = active.id as string
        const originalStageId = activeOriginalStageId
        setActiveId(null)
        setActiveOriginalStageId(null)

        if (!originalStageId) return

        if (!over) {
            setItems((prev) =>
                prev.map((item) =>
                    item.id === draggedId ? { ...item, stage_id: originalStageId } : item
                )
            )
            return
        }

        const overId = over.id as string

        const activeItem = items.find((i) => i.id === draggedId)
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

        await persistCardStageChange(draggedId, originalStageId, newStageId)
    }

    const activeCard = items.find((i) => i.id === activeId)
    const selectedCard = items.find((i) => i.id === selectedCardId) ?? null
    const selectedFallbackUserIds = selectedCard?.indicacoes?.created_by_supervisor_id
        ? [selectedCard.indicacoes.created_by_supervisor_id]
        : []

    function handleCardClick(item: CrmCardData) {
        if (!item.indicacoes?.user_id) {
            showToast({
                variant: "error",
                title: "Detalhes indisponíveis",
                description: "Não foi possível identificar o usuário da indicação para abrir os detalhes.",
            })
            return
        }

        setSelectedCardId(item.id)
        setIsDetailsOpen(true)
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
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
                        stageOptions={stageOptions}
                        onCardClick={handleCardClick}
                        onCardStageChange={async (cardId, stageId) => {
                            const card = items.find((item) => item.id === cardId)
                            if (!card) return
                            await persistCardStageChange(cardId, card.stage_id, stageId)
                        }}
                        onCardDelete={canEdit && brand === "dorata" ? handleDeleteCard : undefined}
                        canEdit={canEdit}
                    />
                ))}
            </div>

            <DragOverlay>
                {activeCard ? <CrmCard item={activeCard} isOverlay /> : null}
            </DragOverlay>

            {selectedCard?.indicacoes?.user_id ? (
                <IndicationDetailsDialog
                    indicationId={selectedCard.indicacao_id}
                    userId={selectedCard.indicacoes.user_id}
                    fallbackUserIds={selectedFallbackUserIds}
                    initialData={selectedCard.indicacoes}
                    brand={(selectedCard.indicacoes?.marca as "dorata" | "rental" | null) ?? null}
                    open={isDetailsOpen}
                    onOpenChange={setIsDetailsOpen}
                    hideDefaultTrigger
                />
            ) : null}
        </DndContext>
    )
}
