// src/components/admin/proposals/proposals-panorama-tab.tsx
"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { PanoramaData } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { STATUS_LABELS, STATUS_VARIANTS, MarginBar } from "./proposals-list-tab"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  buildSellerOptions,
  computeAverageMargin,
  computeKpisFromProposals,
  summarizeClosedSales,
} from "@/lib/sales-panorama-utils"

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

function InstallationBreakdown({
  breakdown,
}: {
  breakdown: PanoramaData["installationBreakdown"]
}) {
  const total = breakdown.telhado.count + breakdown.solo.count
  if (total === 0) return null

  const rows = [
    { label: "Telhado", data: breakdown.telhado, color: "bg-blue-500" },
    { label: "Solo", data: breakdown.solo, color: "bg-amber-500" },
  ] as const

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
        Tipo de instalação
      </h3>
      <div className="space-y-2.5">
        {rows.map(({ label, data, color }) => {
          const pct = total > 0 ? Math.round((data.count / total) * 100) : 0
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">{label}</span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-foreground w-8">{pct}%</span>
              <span className="text-xs text-muted-foreground w-8">{data.count}x</span>
              <span className="text-xs font-semibold text-foreground w-20 text-right">
                {formatBRL(data.totalValue)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProposalsPanoramaTab({ data }: { data: PanoramaData }) {
  const maxDays = Math.max(...data.conversionByMonth.map((m) => m.avgDays), 1)
  const [selectedSellerId, setSelectedSellerId] = useState("all")

  const sellerOptions = useMemo(() => buildSellerOptions(data.proposals), [data.proposals])

  const sellerLabel = useMemo(() => {
    if (selectedSellerId === "all") return "Todos os vendedores"
    const found = sellerOptions.find((option) => option.id === selectedSellerId)
    return found?.label ?? "Vendedor"
  }, [selectedSellerId, sellerOptions])

  const filteredProposals = useMemo(() => {
    if (selectedSellerId === "all") return data.proposals
    return data.proposals.filter((proposal) => proposal.sellerId === selectedSellerId)
  }, [data.proposals, selectedSellerId])

  const openProposals = useMemo(
    () =>
      filteredProposals.filter(
        (proposal) =>
          proposal.negotiationStatus !== "convertido" && proposal.negotiationStatus !== "perdido"
      ),
    [filteredProposals]
  )

  const closedTotal = useMemo(() => summarizeClosedSales(data.proposals), [data.proposals])
  const closedBySeller = useMemo(
    () => summarizeClosedSales(filteredProposals),
    [filteredProposals]
  )
  const filteredKpis = useMemo(
    () => computeKpisFromProposals(filteredProposals),
    [filteredProposals]
  )
  const filteredAvgMargin = useMemo(
    () => computeAverageMargin(filteredProposals),
    [filteredProposals]
  )

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 max-w-sm">
            <p className="mb-1 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Vendedor
            </p>
            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {sellerOptions.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>
                    {seller.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <KpiCard
            label={`Fechado total (${closedTotal.count} vendas)`}
            value={formatBRL(closedTotal.totalValue)}
            color="bg-emerald-50 text-emerald-800"
          />
          <KpiCard
            label={`${sellerLabel} (${closedBySeller.count} vendas)`}
            value={formatBRL(closedBySeller.totalValue)}
            color="bg-teal-50 text-teal-800"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label="Em aberto" value={formatBRL(filteredKpis.totalAberto)} color="bg-blue-50 text-blue-800" />
        <KpiCard label="Em fechamento" value={formatBRL(filteredKpis.totalFechamento)} color="bg-amber-50 text-amber-800" />
        <KpiCard label="Concluído" value={formatBRL(filteredKpis.totalConcluido)} color="bg-emerald-50 text-emerald-800" />
        <KpiCard label="Parados" value={String(filteredKpis.qtdParados)} color="bg-red-50 text-red-800" />
        {filteredAvgMargin != null && (
          <KpiCard
            label="Margem média"
            value={`${filteredAvgMargin.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
            color="bg-emerald-50 text-emerald-800"
          />
        )}
      </div>

      {/* Installation breakdown */}
      <InstallationBreakdown breakdown={data.installationBreakdown} />

      {/* Proposals list */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Orçamentos em aberto
        </h3>
        <div className="space-y-2">
          {openProposals.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{p.clientName}</span>
                  <span className="text-xs text-muted-foreground">{p.sellerName ?? "Sem vendedor"}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_VARIANTS[p.negotiationStatus as NegotiationStatus]} className="text-xs">
                      {STATUS_LABELS[p.negotiationStatus as NegotiationStatus]}
                    </Badge>
                    <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : "text-muted-foreground"}`}>
                      {p.daysSinceUpdate} dias
                    </span>
                    {p.crmContractDate && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        ✓ Contrato{" "}
                        {format(parseISO(p.crmContractDate), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    )}
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
          {openProposals.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum orçamento em aberto para o filtro selecionado.
            </div>
          )}
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
