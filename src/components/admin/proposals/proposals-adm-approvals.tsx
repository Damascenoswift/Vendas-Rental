// src/components/admin/proposals/proposals-adm-approvals.tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronRight, Clock } from "lucide-react"
import {
  approvePriceApproval,
  rejectPriceApproval,
  type PendingApprovalItem,
} from "@/app/actions/price-approval"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

type Props = {
  initialPending: PendingApprovalItem[]
}

function formatBRL(value: number | null) {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function ApprovalCard({
  item,
  onResolved,
}: {
  item: PendingApprovalItem
  onResolved: (id: string) => void
}) {
  const [admMargin, setAdmMargin] = useState("")
  const [rejectNote, setRejectNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    const margin = parseFloat(admMargin)
    if (isNaN(margin) || margin <= 0 || margin >= 100) {
      setError("Informe uma margem válida entre 0 e 100%")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await approvePriceApproval(item.id, margin)
        onResolved(item.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao aprovar")
      }
    })
  }

  function handleReject() {
    setError(null)
    startTransition(async () => {
      try {
        await rejectPriceApproval(item.id, rejectNote.trim() || undefined)
        onResolved(item.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao rejeitar")
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{item.clientName}</p>
          <p className="text-xs text-muted-foreground">
            por {item.requesterName} ·{" "}
            {format(parseISO(item.requested_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Margem atual</p>
          <p className="text-sm font-bold">
            {item.original_margin != null ? `${item.original_margin}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{formatBRL(item.original_value)}</p>
        </div>
      </div>

      {item.vendedor_note && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-amber-300 pl-2">
          &ldquo;{item.vendedor_note}&rdquo;
        </p>
      )}

      <Textarea
        placeholder="Motivo da recusa (opcional)"
        value={rejectNote}
        onChange={(e) => setRejectNote(e.target.value)}
        rows={2}
        className="text-xs resize-none"
        disabled={isPending}
      />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="number"
            min={1}
            max={99}
            step={0.5}
            placeholder="Margem mín. % (ex: 12)"
            value={admMargin}
            onChange={(e) => setAdmMargin(e.target.value)}
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleApprove}
          disabled={isPending}
        >
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={handleReject}
          disabled={isPending}
        >
          Rejeitar
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ProposalsAdmApprovals({ initialPending }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [pending, setPending] = useState<PendingApprovalItem[]>(initialPending)

  function handleResolved(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id))
  }

  if (pending.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-amber-700" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-700" />
        )}
        <Clock className="h-4 w-4 text-amber-700" />
        <span className="text-sm font-bold text-amber-800">
          Revisões de margem pendentes
        </span>
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold h-5 w-5">
          {pending.length}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {pending.map((item) => (
            <ApprovalCard key={item.id} item={item} onResolved={handleResolved} />
          ))}
        </div>
      )}
    </div>
  )
}
