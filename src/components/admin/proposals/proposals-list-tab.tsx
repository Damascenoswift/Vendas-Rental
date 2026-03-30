// src/components/admin/proposals/proposals-list-tab.tsx
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import type { NegotiationStatus } from "@/services/sales-analyst-service"

export type ProposalListItem = {
  id: string
  clientName: string
  totalValue: number | null
  profitMargin: number | null
  daysSinceUpdate: number
  negotiationStatus: NegotiationStatus
}

export const STATUS_LABELS: Record<NegotiationStatus, string> = {
  sem_contato: "Sem contato",
  em_negociacao: "Em negociação",
  followup: "Followup",
  parado: "Parado",
  perdido: "Perdido",
  convertido: "Convertido",
}

export const STATUS_VARIANTS: Record<NegotiationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  sem_contato: "outline",
  em_negociacao: "default",
  followup: "secondary",
  parado: "destructive",
  perdido: "destructive",
  convertido: "default",
}

export function MarginBar({ margin }: { margin: number | null }) {
  if (margin == null) return <span className="text-xs text-muted-foreground">—</span>
  const pct = Math.min(Math.max(margin, 0), 40)
  const color = margin >= 18 ? "bg-emerald-500" : margin >= 10 ? "bg-amber-500" : "bg-red-500"
  const textColor = margin >= 18 ? "text-emerald-600" : margin >= 10 ? "text-amber-600" : "text-red-600"
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(pct / 40) * 100}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{margin}%</span>
    </div>
  )
}

export function ProposalsListTab({ proposals }: { proposals: ProposalListItem[] }) {
  if (proposals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum orçamento encontrado.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {proposals.map((p) => (
        <Link
          key={p.id}
          href={`/admin/orcamentos/${p.id}/editar`}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">{p.clientName}</span>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[p.negotiationStatus]} className="text-xs">
                {STATUS_LABELS[p.negotiationStatus]}
              </Badge>
              {p.daysSinceUpdate > 0 && (
                <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : p.daysSinceUpdate > 5 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {p.daysSinceUpdate} dias
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-bold text-primary">
              {p.totalValue != null
                ? `R$ ${p.totalValue.toLocaleString("pt-BR")}`
                : "—"}
            </span>
            <MarginBar margin={p.profitMargin} />
          </div>
        </Link>
      ))}
    </div>
  )
}
