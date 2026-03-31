"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getProposalSummary, type ProposalSummaryData } from "@/app/actions/proposals"
import type { ProposalListItem } from "./proposals-list-tab"

type Props = {
  proposal: ProposalListItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Formatação BRL com 2 casas decimais: 18.500,00
function brl(value: number | null): string {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function brlFull(value: number | null): string {
  if (value == null) return "—"
  return `R$ ${brl(value)}`
}

// Número simples com casas decimais
function num(value: number | null, decimals = 2): string {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 mt-5">
      {children}
    </p>
  )
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent?: "emerald" | "blue" | "amber" | "violet"
}) {
  const bgMap: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
    violet: "bg-violet-50 border-violet-200",
  }
  const textMap: Record<string, string> = {
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
  }
  const bg = (accent ? bgMap[accent] : null) ?? "bg-card border-border"
  const textColor = (accent ? textMap[accent] : null) ?? "text-foreground"

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className={`text-base font-bold leading-tight ${textColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right">{value ?? "—"}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mt-6 animate-pulse">
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-16 bg-muted rounded-lg" />
        <div className="h-16 bg-muted rounded-lg" />
      </div>
      <div className="h-32 bg-muted rounded-lg" />
      <div className="h-24 bg-muted rounded-lg" />
    </div>
  )
}

export function ProposalSummarySheet({ proposal, open, onOpenChange }: Props) {
  const [data, setData] = useState<ProposalSummaryData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setData(null)
    getProposalSummary(proposal.id).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [open, proposal.id])

  const shortId = proposal.id.slice(-8).toUpperCase()

  const modulesLabel = (() => {
    if (!data) return "—"
    const qty = data.qtdModulos
    const power = data.potenciaModuloW
    if (qty != null && power != null) return `${qty}× ${power}W`
    if (qty != null) return `${qty} módulos`
    return "—"
  })()

  const inverterLabel = (() => {
    if (!data) return "—"
    if (data.inverterNames.length > 0) return data.inverterNames.join(", ")
    if (data.inverterType) return data.inverterType
    return "—"
  })()

  const hasFinance = data && (data.parcelaMensal != null || data.totalPago != null)
  const hasCommercial = data && (data.economiaMensal != null || data.economiaAnual != null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight pr-6">{proposal.clientName}</DialogTitle>
          <DialogDescription className="text-xs">Orçamento #{shortId}</DialogDescription>
        </DialogHeader>

        {loading && <LoadingSkeleton />}

        {!loading && data && (
          <div className="mt-2 pb-2">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div>
                {/* KPIs de produção */}
                {(data.kWhMensal != null || data.kWhAnual != null) && (
                  <>
                    <SectionLabel>Produção Estimada</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {data.kWhMensal != null && (
                        <KpiCard
                          label="Mensal"
                          value={`${num(data.kWhMensal, 2)} kWh`}
                        />
                      )}
                      {data.kWhAnual != null && (
                        <KpiCard
                          label="Anual"
                          value={`${num(data.kWhAnual, 2)} kWh`}
                        />
                      )}
                      {data.economiaMensal != null && (
                        <KpiCard
                          label="Economia Mensal"
                          value={brlFull(data.economiaMensal)}
                          accent="emerald"
                        />
                      )}
                      {data.economiaAnual != null && (
                        <KpiCard
                          label="Economia Anual"
                          value={brlFull(data.economiaAnual)}
                          sub={data.tarifaKwh != null ? `Tarifa: R$ ${num(data.tarifaKwh, 4)}/kWh` : undefined}
                          accent="emerald"
                        />
                      )}
                    </div>
                  </>
                )}

                {/* Resumo Financeiro */}
                <SectionLabel>Resumo Financeiro</SectionLabel>
                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <Row label="Valor Total à Vista" value={brlFull(data.totalValue)} />
                  <Row label="Custo do Material" value={brlFull(data.materialValue)} />
                  <Row
                    label="Margem de Lucro"
                    value={
                      data.profitMargin != null ? (
                        <span className={
                          data.profitMargin >= 18 ? "text-emerald-600" :
                          data.profitMargin >= 10 ? "text-amber-600" :
                          "text-red-600"
                        }>
                          {num(data.profitMargin, 1)}%
                        </span>
                      ) : "—"
                    }
                  />
                </div>
                {/* Pagamento */}
                {hasFinance && (
                  <>
                    <SectionLabel>Pagamento</SectionLabel>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {data.entrada != null && (
                        <KpiCard label="Entrada" value={brlFull(data.entrada)} accent="blue" />
                      )}
                      {data.parcelaMensal != null && (
                        <KpiCard
                          label="Parcela Mensal"
                          value={brlFull(data.parcelaMensal)}
                          sub={data.qtdParcelas != null ? `${data.qtdParcelas}× parcelas` : undefined}
                          accent="blue"
                        />
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-1">
                      {data.saldoPosCarencia != null && (
                        <Row label="Saldo pós-carência" value={brlFull(data.saldoPosCarencia)} />
                      )}
                      {data.mesesCarencia != null && (
                        <Row label="Meses de carência" value={`${data.mesesCarencia} meses`} />
                      )}
                      {data.totalPago != null && (
                        <Row label="Total pago c/ juros" value={brlFull(data.totalPago)} />
                      )}
                      {data.jurosPagos != null && (
                        <Row label="Juros pagos" value={brlFull(data.jurosPagos)} />
                      )}
                    </div>
                  </>
                )}
              </div>

              <div>
                {/* Sistema Solar */}
                <SectionLabel>Sistema Solar</SectionLabel>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(data.kWp ?? data.totalPower) != null && (
                    <KpiCard
                      label="Potência"
                      value={`${num(data.kWp ?? data.totalPower, 2)} kWp`}
                      accent="violet"
                    />
                  )}
                  {data.indiceProducao != null && (
                    <KpiCard
                      label="Índice de Produção"
                      value={`${num(data.indiceProducao, 0)} kWh/kWp`}
                      accent="violet"
                    />
                  )}
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <Row label="Quantidade de Módulos" value={modulesLabel} />
                  {data.qtdModulos != null && data.potenciaModuloW != null && (
                    <Row
                      label="Potência Total Módulos"
                      value={`${num((data.qtdModulos * data.potenciaModuloW) / 1000, 2)} kWp`}
                    />
                  )}
                </div>

                {/* Equipamentos */}
                <SectionLabel>Equipamentos</SectionLabel>
                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <Row label="Módulo" value={data.moduleName ?? "—"} />
                  <Row
                    label="Tipo Inversor"
                    value={data.inverterType ?? "—"}
                  />
                  {data.inverterNames.length > 0 && (
                    <Row label="Inversor" value={inverterLabel} />
                  )}
                </div>

                {!hasCommercial && data.tarifaKwh != null && (
                  <>
                    <SectionLabel>Tarifa</SectionLabel>
                    <div className="rounded-lg border border-border bg-card px-3 py-1">
                      <Row label="Tarifa kWh" value={`R$ ${num(data.tarifaKwh, 4)}`} />
                    </div>
                  </>
                )}

                {/* Botão */}
                <div className="mt-6">
                  <Link
                    href={`/admin/orcamentos/${proposal.id}/editar`}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={() => onOpenChange(false)}
                  >
                    Abrir orçamento completo →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !data && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar os dados.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
