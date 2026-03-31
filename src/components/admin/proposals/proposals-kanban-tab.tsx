"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { GripVertical } from "lucide-react"
import { updateNegotiationStatus } from "@/app/actions/sales-analyst"
import { useToast } from "@/hooks/use-toast"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { STATUS_LABELS, MarginBar, type ProposalListItem } from "./proposals-list-tab"

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
    label: STATUS_LABELS["sem_contato"],
    borderColor: "border-l-slate-400",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
  },
  {
    id: "em_negociacao",
    label: STATUS_LABELS["em_negociacao"],
    borderColor: "border-l-blue-500",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
  },
  {
    id: "followup",
    label: STATUS_LABELS["followup"],
    borderColor: "border-l-violet-500",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
  },
  {
    id: "parado",
    label: STATUS_LABELS["parado"],
    borderColor: "border-l-red-400",
    badgeBg: "bg-red-100",
    badgeText: "text-red-600",
  },
  {
    id: "perdido",
    label: STATUS_LABELS["perdido"],
    borderColor: "border-l-red-700",
    badgeBg: "bg-red-200",
    badgeText: "text-red-800",
  },
  {
    id: "convertido",
    label: STATUS_LABELS["convertido"],
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

// ── Card View (pure markup, no hooks) ────────────────────────────────────────

function ProposalCardView({
  proposal,
  dragHandleListeners,
  dragHandleAttributes,
  isDragging = false,
  isOverlay = false,
}: {
  proposal: ProposalListItem
  dragHandleListeners?: React.HTMLAttributes<HTMLElement>
  dragHandleAttributes?: React.HTMLAttributes<HTMLElement>
  isDragging?: boolean
  isOverlay?: boolean
}) {
  const daysColor =
    proposal.daysSinceUpdate > 10
      ? "text-red-500"
      : proposal.daysSinceUpdate > 5
        ? "text-amber-500"
        : "text-muted-foreground"

  return (
    <div
      className={`relative rounded-md border border-border bg-card p-3 shadow-sm transition-opacity ${
        isDragging && !isOverlay ? "opacity-30" : "opacity-100"
      } ${isOverlay ? "shadow-lg rotate-1 cursor-grabbing" : "cursor-grab hover:shadow-md"}`}
    >
      {/* Drag handle */}
      <button
        {...dragHandleListeners}
        {...dragHandleAttributes}
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
        {proposal.daysSinceUpdate > 0 && (
          <span className={`text-xs ${daysColor}`}>
            {proposal.daysSinceUpdate} dias
          </span>
        )}
        <MarginBar margin={proposal.profitMargin} />
      </div>
    </div>
  )
}

// ── Card (adds useDraggable) ──────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: ProposalListItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: proposal.id,
  })

  return (
    <div ref={setNodeRef}>
      <ProposalCardView
        proposal={proposal}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        isDragging={isDragging}
      />
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
  const originalStatusRef = useRef<NegotiationStatus | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    setProposals(initialProposals)
  }, [initialProposals])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  )

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    setActiveId(id)
    const activeItem = proposals.find((p) => p.id === id)
    if (activeItem) {
      originalStatusRef.current = activeItem.negotiationStatus
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeItem = proposals.find((p) => p.id === active.id)
    if (!activeItem) return

    // Determine the target column: over a column directly, or over a card
    let targetStatus: NegotiationStatus | null = null
    if (COLUMNS.some((col) => col.id === over.id)) {
      targetStatus = over.id as NegotiationStatus
    } else {
      const overItem = proposals.find((p) => p.id === over.id)
      if (overItem) {
        targetStatus = overItem.negotiationStatus
      }
    }

    if (targetStatus && activeItem.negotiationStatus !== targetStatus) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === active.id
            ? { ...p, negotiationStatus: targetStatus! }
            : p
        )
      )
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      // Revert to original if dropped outside
      if (originalStatusRef.current !== null) {
        const orig = originalStatusRef.current
        setProposals((prev) =>
          prev.map((p) =>
            p.id === active.id ? { ...p, negotiationStatus: orig } : p
          )
        )
      }
      originalStatusRef.current = null
      return
    }

    const activeItem = proposals.find((p) => p.id === active.id)
    if (!activeItem) {
      originalStatusRef.current = null
      return
    }

    let newStatus = activeItem.negotiationStatus

    if (COLUMNS.some((col) => col.id === over.id)) {
      newStatus = over.id as NegotiationStatus
    } else {
      const overItem = proposals.find((p) => p.id === over.id)
      if (overItem) {
        newStatus = overItem.negotiationStatus
      }
    }

    // Apply final optimistic update if different from current state
    if (activeItem.negotiationStatus !== newStatus) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === active.id ? { ...p, negotiationStatus: newStatus } : p
        )
      )
    }

    const originalStatus = originalStatusRef.current
    originalStatusRef.current = null

    if (originalStatus !== newStatus) {
      try {
        await updateNegotiationStatus(active.id as string, newStatus)
      } catch {
        // Revert to the original status captured at drag start
        if (originalStatus !== null) {
          setProposals((prev) =>
            prev.map((p) =>
              p.id === active.id ? { ...p, negotiationStatus: originalStatus } : p
            )
          )
        }
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
          <ProposalCardView proposal={activeProposal} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
