// src/components/admin/proposals/proposals-analyst-tab.tsx
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ProposalListItem } from "./proposals-list-tab"
import { STATUS_LABELS, STATUS_VARIANTS } from "./proposals-list-tab"

// Analyst preview question per status
function analystPreview(p: ProposalListItem): string {
  switch (p.negotiationStatus) {
    case "sem_contato": return "Orçamento novo. Quando vai fazer o primeiro contato?"
    case "em_negociacao": return "O que o cliente sinalizou sobre prazo de decisão?"
    case "followup": return "Followup pendente. Já preparou a abordagem?"
    case "parado": return "Sem progresso. Qual foi a última objeção apresentada?"
    case "perdido": return "Marcado como perdido. O que levou o cliente à concorrência?"
    case "convertido": return "Convertido. O que foi decisivo para o fechamento?"
  }
}

export function ProposalsAnalystTab({ proposals }: { proposals: ProposalListItem[] }) {
  const critical = proposals.filter(
    (p) => (p.negotiationStatus === "parado" || p.negotiationStatus === "sem_contato") && p.daysSinceUpdate > 7
  )

  const sorted = [...proposals].sort((a, b) => {
    const urgency: Record<string, number> = { parado: 0, sem_contato: 1, followup: 2, em_negociacao: 3, perdido: 4, convertido: 5 }
    const uA = urgency[a.negotiationStatus] ?? 9
    const uB = urgency[b.negotiationStatus] ?? 9
    if (uA !== uB) return uA - uB
    return b.daysSinceUpdate - a.daysSinceUpdate
  })

  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{critical[0].clientName}</strong>
            {critical.length > 1 ? ` e mais ${critical.length - 1}` : ""} sem atualização há mais de 7 dias. Ação necessária.
          </span>
        </div>
      )}

      {sorted.map((p) => (
        <Link
          key={p.id}
          href={`/admin/orcamentos/${p.id}/editar`}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
        >
          <div className="flex flex-col gap-1 flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{p.clientName}</span>
              <Badge variant={STATUS_VARIANTS[p.negotiationStatus]} className="text-xs">
                {STATUS_LABELS[p.negotiationStatus]}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground truncate">{analystPreview(p)}</span>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs font-bold ${p.daysSinceUpdate > 10 ? "text-red-500" : p.daysSinceUpdate > 5 ? "text-amber-500" : "text-emerald-600"}`}>
              {p.daysSinceUpdate} dias
            </span>
            <span className="text-xs text-muted-foreground">
              {p.totalValue != null ? `R$ ${(p.totalValue / 1000).toFixed(0)}k` : "—"}
              {p.profitMargin != null ? ` · ${p.profitMargin}%` : ""}
            </span>
          </div>
        </Link>
      ))}

      {sorted.length === 0 && (
        <p className="text-center py-12 text-muted-foreground text-sm">Nenhum orçamento para analisar.</p>
      )}
    </div>
  )
}
