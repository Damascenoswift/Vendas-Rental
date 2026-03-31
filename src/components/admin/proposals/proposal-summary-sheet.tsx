"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getProposalSummary, type ProposalSummaryData } from "@/app/actions/proposals"
import type { ProposalListItem } from "./proposals-list-tab"

type Props = {
  proposal: ProposalListItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

const BRL = (value: number | null) =>
  value != null
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "—"

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value ?? "—"}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-1">
      {children}
    </p>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mt-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse bg-muted rounded h-4 w-full" />
      ))}
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

  const inverterDisplay = (() => {
    if (!data) return null
    if (data.inverterNames.length > 0) {
      const typeLabel = data.inverterType ? `${data.inverterType} — ` : ""
      return `${typeLabel}${data.inverterNames.join(", ")}`
    }
    return data.inverterType ?? "—"
  })()

  const modulesDisplay = (() => {
    if (!data) return null
    const qty = data.qtdModulos
    const power = data.potenciaModuloW
    if (qty != null && power != null) return `${qty}× ${power}W`
    if (qty != null) return `${qty} módulos`
    return "—"
  })()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-sm w-full overflow-y-auto">
        <SheetHeader className="pr-4">
          <SheetTitle className="text-base leading-tight">{proposal.clientName}</SheetTitle>
          <SheetDescription className="text-xs">
            Orçamento #{shortId}
          </SheetDescription>
        </SheetHeader>

        {loading && <LoadingSkeleton />}

        {!loading && data && (
          <div className="mt-4">
            {/* Financeiro */}
            <SectionTitle>Financeiro</SectionTitle>
            <div className="rounded-md border border-border bg-card px-3 py-2 space-y-0">
              <SummaryRow label="Valor Total" value={BRL(data.totalValue)} />
              <SummaryRow label="Material" value={BRL(data.materialValue)} />
              <SummaryRow
                label="Margem de Lucro"
                value={data.profitMargin != null ? `${data.profitMargin}%` : "—"}
              />
            </div>

            {/* Sistema Solar */}
            <SectionTitle>Sistema Solar</SectionTitle>
            <div className="rounded-md border border-border bg-card px-3 py-2 space-y-0">
              <SummaryRow
                label="Potencia"
                value={
                  data.kWp != null
                    ? `${data.kWp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWp`
                    : data.totalPower != null
                      ? `${data.totalPower.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWp`
                      : "—"
                }
              />
              <SummaryRow
                label="Producao Est."
                value={
                  data.kWhEstimado != null
                    ? `${Math.round(data.kWhEstimado).toLocaleString("pt-BR")} kWh/mes`
                    : "—"
                }
              />
              <SummaryRow label="Modulos" value={modulesDisplay ?? "—"} />
            </div>

            {/* Equipamentos */}
            <SectionTitle>Equipamentos</SectionTitle>
            <div className="rounded-md border border-border bg-card px-3 py-2 space-y-0">
              <SummaryRow label="Modulo" value={data.moduleName ?? "—"} />
              <SummaryRow label="Inversor" value={inverterDisplay ?? "—"} />
            </div>

            {/* Link */}
            <div className="mt-5">
              <Link
                href={`/admin/orcamentos/${proposal.id}/editar`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Abrir orcamento
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        )}

        {!loading && !data && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Nao foi possivel carregar os dados.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
