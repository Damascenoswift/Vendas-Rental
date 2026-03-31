"use client"

import { useState } from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useDroppable } from "@dnd-kit/core"
import { useDraggable } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { GripVertical } from "lucide-react"
import { updateNegotiationStatus } from "@/app/actions/sales-analyst"
import { useToast } from "@/hooks/use-toast"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { MarginBar, type ProposalListItem } from "./proposals-list-tab"

type ProposalsKanbanTabProps = {
  proposals: ProposalListItem[]
}

type ColumnDef = {
  id: NegotiationStatus
  label: string
  borderColor: string
  badgeBg: string
  badgeText: string
}

const COLUMNS: ColumnDef[] = [
  {
    id: "sem_contato",
    label: "Sem contato",
    borderColor: "border-l-slate-400",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
  },
  {
    id: "em_negociacao",
    label: "Em negociação",
    borderColor: "border-l-blue-500",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
  },
  {
    id: "followup",
    label: "Followup",
    borderColor: "border-l-violet-500",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
  },
  {
    id: "parado",
    label: "Parado",
    borderColor: "border-l-red-400",
    badgeBg: "bg-red-100",
    badgeText: "text-red-600",
  },
  {
    id: "perdido",
    label: "Perdido",
    borderColor: "border-l-red-700",
    badgeBg: "bg-red-200",
    badgeText: "text-red-800",
  },
  {
    id: "convertido",
    label: "Convertido",
    borderColor: "border-l-emerald-500",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
  },
]

function formatColumnValue(total: number): string {
  if (total >= 1_000_000) {
    const val = total / 1_000_000
    return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  }
  if (total >= 1_000) {
    const val = total / 1_000
    return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
  }
  return `R$ ${total.toLocaleString("pt-BR")}`
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  isOverlay = false,
}: {
  proposal: ProposalListItem
  isOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: proposal.id,
  })

  const daysColor =
    proposal.daysSinceUpdate > 10
      ? "text-red-500"
      : proposal.daysSinceUpdate > 5
        ? "text-amber-500"
        : "text-muted-foreground"

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-md border border-border bg-card p-3 shadow-sm transition-opacity ${
        isDragging && !isOverlay ? "opacity-30" : "opacity-100"
      } ${isOverlay ? "shadow-lg rotate-1 cursor-grabbing" : "cursor-grab hover:shadow-md"}`}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground touch-none"
        tabIndex={-1}
        aria-label="Arrastar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Client name */}
      <Link
        href={`/admin/orcamentos/${proposal.id}/editar`}
        className="block pr-5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
          {proposal.clientName}
        </span>
      </Link>

      {/* Value */}
      <div className="mt-1.5">
        <span className="text-sm font-bold text-primary">
          {proposal.totalValue != null
            ? proposal.totalValue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            : "—"}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs ${daysColor}`}>
          {proposal.daysSinceUpdate} dias
        </span>
        <MarginBar margin={proposal.profitMargin} />
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  proposals,
}: {
  column: ColumnDef
  proposals: ProposalListItem[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const total = proposals.reduce((sum, p) => sum + (p.totalValue ?? 0), 0)

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] flex-shrink-0">
      {/* Header */}
      <div
        className={`rounded-t-md border-l-4 border border-border bg-card px-3 py-2.5 ${column.borderColor}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground truncate">
            {column.label}
          </span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${column.badgeBg} ${column.badgeText}`}
          >
            {proposals.length}
          </span>
        </div>
        {proposals.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatColumnValue(total)}
          </p>
        )}
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-b-md border-x border-b border-border bg-muted/30 p-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[120px] transition-colors ${
          isOver ? "bg-muted/60" : ""
        }`}
      >
        {proposals.length === 0 ? (
          <p className="flex h-full min-h-[80px] items-center justify-center text-xs text-muted-foreground">
            Nenhum orçamento
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ProposalsKanbanTab({ proposals: initialProposals }: ProposalsKanbanTabProps) {
  const [proposals, setProposals] = useState<ProposalListItem[]>(initialProposals)
  const [activeId, setActiveId] = useState<string | null>(null)
  const { showToast } = useToast()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeItem = proposals.find((p) => p.id === active.id)
    if (!activeItem) return

    const isOverColumn = COLUMNS.some((col) => col.id === over.id)
    if (isOverColumn && activeItem.negotiationStatus !== (over.id as NegotiationStatus)) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === active.id
            ? { ...p, negotiationStatus: over.id as NegotiationStatus }
            : p
        )
      )
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeItem = proposals.find((p) => p.id === active.id)
    if (!activeItem) return

    let newStatus = activeItem.negotiationStatus

    if (COLUMNS.some((col) => col.id === over.id)) {
      newStatus = over.id as NegotiationStatus
    } else {
      const overItem = proposals.find((p) => p.id === over.id)
      if (overItem) {
        newStatus = overItem.negotiationStatus
      }
    }

    // Status may have already been updated optimistically in handleDragOver;
    // always persist the final status to the server.
    const previousStatus = activeItem.negotiationStatus

    // Apply final optimistic update if different from current state
    if (activeItem.negotiationStatus !== newStatus) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === active.id ? { ...p, negotiationStatus: newStatus } : p
        )
      )
    }

    if (previousStatus !== newStatus) {
      try {
        await updateNegotiationStatus(active.id as string, newStatus)
      } catch {
        // Revert on error
        setProposals((prev) =>
          prev.map((p) =>
            p.id === active.id ? { ...p, negotiationStatus: previousStatus } : p
          )
        )
        showToast({
          variant: "error",
          title: "Erro ao atualizar",
          description: "Não foi possível salvar o novo status.",
        })
        console.error("Failed to update negotiation status for", active.id)
      }
    }
  }

  const activeProposal = activeId ? proposals.find((p) => p.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              proposals={proposals.filter((p) => p.negotiationStatus === col.id)}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeProposal ? (
          <ProposalCard proposal={activeProposal} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
