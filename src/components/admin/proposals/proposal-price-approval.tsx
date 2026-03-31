// src/components/admin/proposals/proposal-price-approval.tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { requestPriceApproval, type PriceApprovalRecord } from "@/app/actions/price-approval"
import { ChevronDown, ChevronRight } from "lucide-react"

type Props = {
  proposalId: string
  initialApproval: PriceApprovalRecord | null
  currentMargin: number | null
  currentValue: number | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando ADM",
  approved: "Aprovado",
  rejected: "Não aprovado",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
}

function formatBRL(value: number | null) {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ProposalPriceApproval({
  proposalId,
  initialApproval,
  currentMargin,
  currentValue,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [approval, setApproval] = useState<PriceApprovalRecord | null>(initialApproval)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      try {
        await requestPriceApproval(proposalId, note.trim() || undefined)
        // Optimistic update — show pending status immediately
        setApproval({
          id: "optimistic",
          proposal_id: proposalId,
          requested_by: "",
          approved_by: null,
          status: "pending",
          vendedor_note: note.trim() || null,
          original_margin: currentMargin,
          original_value: currentValue,
          adm_min_margin: null,
          new_value: null,
          adm_note: null,
          requested_at: new Date().toISOString(),
          resolved_at: null,
        })
        setNote("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao solicitar revisão")
      }
    })
  }

  const hasPending = approval?.status === "pending"
  const isApproved = approval?.status === "approved"
  const isRejected = approval?.status === "rejected"

  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Cliente está achando caro?
        {hasPending && (
          <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            Pendente
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* No approval yet — show request form */}
          {!approval && (
            <>
              <Textarea
                placeholder="Contexto para o ADM (opcional): ex. cliente tem proposta concorrente de R$X"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
                onClick={handleRequest}
                disabled={isPending}
              >
                {isPending ? "Solicitando…" : "Solicitar revisão de margem"}
              </Button>
            </>
          )}

          {/* Approval exists — show status */}
          {approval && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[approval.status]}`}
                >
                  {STATUS_LABELS[approval.status]}
                </span>
              </div>

              {approval.vendedor_note && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{approval.vendedor_note}&rdquo;
                </p>
              )}

              {isApproved && approval.adm_min_margin != null && (
                <div className="rounded-lg bg-emerald-50 p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-emerald-800">
                    Margem mínima aprovada: {approval.adm_min_margin}%
                  </p>
                  {approval.new_value != null && (
                    <p className="text-xs text-emerald-700">
                      Novo valor sugerido: {formatBRL(approval.new_value)}
                    </p>
                  )}
                </div>
              )}

              {isRejected && (
                <div className="rounded-lg bg-red-50 p-2.5">
                  <p className="text-xs font-semibold text-red-800">Revisão não aprovada pelo ADM</p>
                  {approval.adm_note && (
                    <p className="text-xs text-red-700 mt-0.5">{approval.adm_note}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
