"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight, Copy, Eye, PenLine } from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DeleteProposalButton } from "@/components/admin/proposals/delete-proposal-button"

type ProposalPreviewData = {
  id: string
  clientName: string | null
  sellerName: string | null
  status: string | null
  totalValue: number | null
  estimatedKwh: number | null
  validUntil: string | null
  calculation: unknown
}

type ProposalRowActionsProps = {
  proposalId: string
  sourceMode: "simple" | "complete" | "legacy"
  clientName: string | null
  canDelete: boolean
  previewData: ProposalPreviewData
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number, suffix?: string) {
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return suffix ? `${formatted} ${suffix}` : formatted
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
}

function ProposalPreviewDialog({ data }: { data: ProposalPreviewData }) {
  const calculation = asRecord(data.calculation)
  const input = asRecord(calculation?.input)
  const output = asRecord(calculation?.output)
  const totals = asRecord(output?.totals)
  const dimensioning = asRecord(output?.dimensioning)
  const commercialInput = asRecord(input?.commercial)
  const commercialOutput = asRecord(output?.commercial)
  const financeInput = asRecord(input?.finance)
  const financeOutput = asRecord(output?.finance)

  const monthlyProduction = asNumber(dimensioning?.kWh_estimado) || asNumber(data.estimatedKwh)
  const annualProduction = monthlyProduction > 0 ? monthlyProduction * 12 : 0
  const tariffKwh =
    asNumber(commercialOutput?.tarifa_kwh) ||
    asNumber(commercialInput?.tarifa_kwh) ||
    0.95
  const monthlySavingsEstimate =
    asNumber(commercialOutput?.economia_mensal_estimada) ||
    (monthlyProduction > 0 && tariffKwh > 0 ? monthlyProduction * tariffKwh : 0)
  const annualSavingsEstimate =
    asNumber(commercialOutput?.economia_anual_estimada) ||
    (monthlySavingsEstimate > 0 ? monthlySavingsEstimate * 12 : 0)

  const totalValue = asNumber(totals?.total_a_vista) || asNumber(data.totalValue)
  const entryValue = asNumber(financeInput?.entrada_valor)
  const installmentValue = asNumber(financeOutput?.parcela_mensal)
  const installments = asNumber(financeInput?.num_parcelas)
  const graceMonths = asNumber(financeInput?.carencia_meses)
  const balanceAfterGrace = asNumber(financeOutput?.saldo_pos_carencia)
  const totalPaidWithInterest = asNumber(financeOutput?.total_pago)
  const paidInterest = asNumber(financeOutput?.juros_pagos)
  const hasFinancing =
    installmentValue > 0 ||
    installments > 0 ||
    entryValue > 0 ||
    totalPaidWithInterest > 0 ||
    graceMonths > 0
  const projectionMonths = 60
  let cumulativeGross = 0
  let cumulativeNet = -entryValue
  const projection = Array.from({ length: projectionMonths }, (_, index) => {
    const month = index + 1
    const paysInstallment =
      hasFinancing &&
      month > graceMonths &&
      month <= graceMonths + installments
    const monthlyInstallment = paysInstallment ? installmentValue : 0
    cumulativeGross += monthlySavingsEstimate
    cumulativeNet += monthlySavingsEstimate - monthlyInstallment

    return {
      month,
      parcelaMes: monthlyInstallment,
      acumuladoBruto: cumulativeGross,
      acumuladoLiquido: cumulativeNet,
    }
  })
  const accumulatedGross5y = projection[projection.length - 1]?.acumuladoBruto ?? 0
  const paidInstallments5y = projection.reduce((sum, point) => sum + point.parcelaMes, 0)
  const accumulatedNet5y = projection[projection.length - 1]?.acumuladoLiquido ?? 0
  const breakEvenMonth =
    projection.find((point) => point.acumuladoLiquido >= 0)?.month ?? null
  const planLabel = hasFinancing
    ? `${installments}x de ${formatCurrency(installmentValue)}`
    : "Sem parcelamento"
  const chartLabels: Record<string, string> = {
    parcelaMes: "Parcela mensal",
    acumuladoBruto: "Economia acumulada",
    acumuladoLiquido: "Saldo líquido acumulado",
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Visualizar resumo comercial"
          title="Visualizar resumo"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumo Comercial da Proposta</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Produção mensal</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {monthlyProduction > 0 ? formatNumber(monthlyProduction, "kWh") : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Produção anual</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {annualProduction > 0 ? formatNumber(annualProduction, "kWh") : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Economia anual estimada</p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {annualSavingsEstimate > 0 ? formatCurrency(annualSavingsEstimate) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tarifa aplicada: {tariffKwh > 0 ? formatCurrency(tariffKwh) : "—"} por kWh.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Resumo financeiro</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Entrada</dt>
                <dd className="font-semibold text-foreground">{formatCurrency(entryValue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Parcela mensal</dt>
                <dd className="font-semibold text-primary">
                  {hasFinancing ? formatCurrency(installmentValue) : "Sem parcelamento"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Plano</dt>
                <dd className="font-semibold text-primary">{planLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Valor total à vista</dt>
                <dd className="font-semibold text-foreground">{formatCurrency(totalValue)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Total com juros</dt>
                <dd className="font-semibold text-foreground">
                  {hasFinancing ? formatCurrency(totalPaidWithInterest) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Carência e juros</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Meses de carência</dt>
                <dd className="font-semibold text-foreground">{hasFinancing ? graceMonths : 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Saldo após carência</dt>
                <dd className="font-semibold text-foreground">
                  {hasFinancing ? formatCurrency(balanceAfterGrace) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Parcelas</dt>
                <dd className="font-semibold text-primary">{hasFinancing ? installments : 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Juros totais pagos</dt>
                <dd className="font-semibold text-foreground">
                  {hasFinancing ? formatCurrency(paidInterest) : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/70 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Economia 5 anos</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatCurrency(accumulatedGross5y)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-amber-700">Parcelas em 5 anos</p>
              <p className="mt-1 text-lg font-semibold text-amber-800">
                {formatCurrency(paidInstallments5y)}
              </p>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-primary">Saldo líquido 5 anos</p>
              <p className="mt-1 text-lg font-semibold text-primary">
                {formatCurrency(accumulatedNet5y)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ponto de virada</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {breakEvenMonth ? `Mês ${breakEvenMonth}` : "Após 60 meses"}
              </p>
            </div>
          </div>

          <div className="mt-4 h-[300px] w-full rounded-lg border border-border/60 bg-background/70 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projection} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(month: number) => `${month}m`}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={88}
                  tickFormatter={(value: number) => `R$ ${Math.round(value).toLocaleString("pt-BR")}`}
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(Number(value)),
                    chartLabels[name] ?? name,
                  ]}
                  labelFormatter={(month: number) => `Mês ${month}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="parcelaMes"
                  name="Parcela mensal"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  barSize={10}
                />
                <Line
                  type="monotone"
                  dataKey="acumuladoBruto"
                  name="Economia acumulada"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="acumuladoLiquido"
                  name="Saldo líquido acumulado"
                  stroke="#16a34a"
                  strokeWidth={3}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Projeção de 60 meses com base na tarifa informada, entrada inicial, carência e número de parcelas.
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-xs text-muted-foreground">
          <p>Cliente: {data.clientName || "—"} • Status: {data.status || "—"} • Validade: {formatDate(data.validUntil)}</p>
          <p className="mt-1">
            Este resumo é para apresentação comercial e não exibe custo de kit, custo de material ou margem interna.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActionIconLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
          <Link href={href} aria-label={label} title={label}>
            {icon}
            <span className="sr-only">{label}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ProposalRowActions({
  proposalId,
  sourceMode,
  clientName,
  canDelete,
  previewData,
}: ProposalRowActionsProps) {
  const editHref = `/admin/orcamentos/${proposalId}/editar`
  const duplicateHref = `/admin/orcamentos/novo?duplicar=${proposalId}`
  const upgradeHref = `/admin/orcamentos/${proposalId}/editar?upgrade=complete`

  return (
    <div className="flex items-center justify-end gap-1">
      <ProposalPreviewDialog data={previewData} />

      {sourceMode === "simple" ? (
        <ActionIconLink
          href={upgradeHref}
          label="Evoluir para completo"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
      ) : null}

      <ActionIconLink href={editHref} label="Editar" icon={<PenLine className="h-4 w-4" />} />
      <ActionIconLink href={duplicateHref} label="Duplicar" icon={<Copy className="h-4 w-4" />} />

      {canDelete ? (
        <DeleteProposalButton proposalId={proposalId} clientName={clientName} compact />
      ) : null}
    </div>
  )
}
