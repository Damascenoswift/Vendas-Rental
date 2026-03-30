// src/components/admin/proposals/proposals-panorama-tab.tsx
import { Badge } from "@/components/ui/badge"
import type { PanoramaData } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { STATUS_LABELS, STATUS_VARIANTS, MarginBar } from "./proposals-list-tab"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex-1 rounded-xl p-4 ${color}`}>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-xs font-medium mt-1 opacity-80">{label}</div>
    </div>
  )
}

function formatBRL(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
  return `R$ ${value.toLocaleString("pt-BR")}`
}

export function ProposalsPanoramaTab({ data }: { data: PanoramaData }) {
  const maxDays = Math.max(...data.conversionByMonth.map((m) => m.avgDays), 1)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label="Em aberto" value={formatBRL(data.kpis.totalAberto)} color="bg-blue-50 text-blue-800" />
        <KpiCard label="Em fechamento" value={formatBRL(data.kpis.totalFechamento)} color="bg-amber-50 text-amber-800" />
        <KpiCard label="Concluído" value={formatBRL(data.kpis.totalConcluido)} color="bg-emerald-50 text-emerald-800" />
        <KpiCard label="Parados" value={String(data.kpis.qtdParados)} color="bg-red-50 text-red-800" />
      </div>

      {/* Proposals list */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Orçamentos em aberto
        </h3>
        <div className="space-y-2">
          {data.proposals
            .filter((p) => p.negotiationStatus !== "convertido" && p.negotiationStatus !== "perdido")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{p.clientName}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[p.negotiationStatus as NegotiationStatus]} className="text-xs">
                      {STATUS_LABELS[p.negotiationStatus as NegotiationStatus]}
                    </Badge>
                    <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : "text-muted-foreground"}`}>
                      {p.daysSinceUpdate} dias
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold text-primary">
                    {p.totalValue != null ? formatBRL(p.totalValue) : "—"}
                  </span>
                  <MarginBar margin={p.profitMargin} />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Conversion chart */}
      {data.conversionByMonth.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
            Tempo médio até conversão (dias)
          </h3>
          <div className="space-y-2">
            {data.conversionByMonth.map(({ month, avgDays }) => {
              const label = format(parseISO(`${month}-01`), "MMMM", { locale: ptBR })
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 text-right capitalize">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(avgDays / maxDays) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-foreground w-8">{avgDays}d</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
