"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  getProposalSummary,
  type ProposalSummaryData,
  updateProposalFinancialAdjustment,
} from "@/app/actions/proposals"
import {
  getProposalFollowupPanelData,
  saveProposalFeedback,
  saveProposalReminderSettings,
  type ProposalFollowupPanelData,
} from "@/app/actions/sales-analyst"
import {
  formatDateTimeInCuiaba,
  toDateTimeLocalInCuiaba,
} from "@/lib/proposal-reminder-utils"
import { getProposalFinancialPreview } from "@/lib/proposal-financial-adjustment-utils"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { useToast } from "@/hooks/use-toast"
import type { ProposalListItem } from "./proposals-list-tab"

type Props = {
  proposal: ProposalListItem
  open: boolean
  onOpenChange: (open: boolean) => void
  canAdjustFinancial?: boolean
  onFinancialUpdate?: (
    proposalId: string,
    values: { totalValue: number; profitValue: number; effectiveMarginPercent: number | null }
  ) => void
}

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  sem_contato: "Sem contato",
  em_negociacao: "Em negociação",
  followup: "Follow-up",
  parado: "Parado",
  perdido: "Perdido",
  convertido: "Convertido",
}

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

function num(value: number | null, decimals = 2): string {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function percent(value: number | null, decimals = 1): string {
  if (value == null) return "—"
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`
}

function parseDelta(value: string): number {
  if (!value.trim()) return 0
  const normalized = value.replace(",", ".")
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 mt-3">
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
    <div className={`rounded-lg border p-2.5 ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className={`text-[15px] font-bold leading-tight ${textColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right">{value ?? "—"}</span>
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

function FollowupPanelSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-28 rounded-lg bg-muted" />
      <div className="h-24 rounded-lg bg-muted" />
    </div>
  )
}

export function ProposalSummarySheet({
  proposal,
  open,
  onOpenChange,
  canAdjustFinancial = false,
  onFinancialUpdate,
}: Props) {
  const [data, setData] = useState<ProposalSummaryData | null>(null)
  const [panelData, setPanelData] = useState<ProposalFollowupPanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [panelLoading, setPanelLoading] = useState(false)
  const [feedbackDraft, setFeedbackDraft] = useState("")
  const [manualReminderDraft, setManualReminderDraft] = useState("")
  const [autoReminderEnabledDraft, setAutoReminderEnabledDraft] = useState(true)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [savingReminder, setSavingReminder] = useState(false)
  const [savingFinancialAdjustment, setSavingFinancialAdjustment] = useState(false)
  const [deltaTotalDraft, setDeltaTotalDraft] = useState("")
  const [deltaProfitDraft, setDeltaProfitDraft] = useState("")
  const { showToast } = useToast()

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setPanelLoading(true)
    setData(null)
    setPanelData(null)
    setFeedbackDraft("")
    setDeltaTotalDraft("")
    setDeltaProfitDraft("")

    Promise.all([
      getProposalSummary(proposal.id),
      getProposalFollowupPanelData(proposal.id),
    ])
      .then(([summary, followup]) => {
        setData(summary)
        setPanelData(followup)
        setManualReminderDraft(toDateTimeLocalInCuiaba(followup.reminder.followupAt))
        setAutoReminderEnabledDraft(followup.reminder.autoReminderEnabled)
      })
      .catch((error) => {
        console.error("Erro ao carregar resumo do orçamento:", error)
      })
      .finally(() => {
        setLoading(false)
        setPanelLoading(false)
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

  const nextAutoReminderLabel = useMemo(() => {
    if (!panelData) return "—"
    if (!autoReminderEnabledDraft) return "Automático desativado."
    if (!panelData.reminder.nextAutoReminderAt) return "Sem próximo lembrete automático no momento."
    return `Próximo automático: ${formatDateTimeInCuiaba(panelData.reminder.nextAutoReminderAt)}`
  }, [panelData, autoReminderEnabledDraft])

  const hasFinance = data && (data.parcelaMensal != null || data.totalPago != null)
  const hasCommercial = data && (data.economiaMensal != null || data.economiaAnual != null)
  const deltaTotalValue = parseDelta(deltaTotalDraft)
  const deltaProfitValue = parseDelta(deltaProfitDraft)
  const hasFinancialDelta = deltaTotalValue !== 0 || deltaProfitValue !== 0
  const financialPreview = useMemo(() => {
    if (!data) return null
    return getProposalFinancialPreview({
      currentTotalValue: data.totalValue,
      currentProfitValue: data.profitValue,
      deltaTotalValue,
      deltaProfitValue,
    })
  }, [data, deltaProfitValue, deltaTotalValue])

  async function handleSaveFeedback() {
    const content = feedbackDraft.trim()
    if (!content) {
      showToast({
        variant: "error",
        title: "Feedback vazio",
        description: "Digite um feedback antes de salvar.",
      })
      return
    }

    setSavingFeedback(true)
    try {
      const result = await saveProposalFeedback(proposal.id, content)
      setPanelData((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          timeline: [...previous.timeline, result.message],
        }
      })
      setFeedbackDraft("")
      showToast({
        variant: "success",
        title: "Feedback salvo",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar feedback."
      showToast({
        variant: "error",
        title: "Erro ao salvar feedback",
        description: message,
      })
    } finally {
      setSavingFeedback(false)
    }
  }

  async function handleSaveReminder() {
    setSavingReminder(true)
    try {
      const result = await saveProposalReminderSettings(proposal.id, {
        followupAt: manualReminderDraft || null,
        autoReminderEnabled: autoReminderEnabledDraft,
      })

      setPanelData((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          reminder: result.reminder,
        }
      })
      setManualReminderDraft(toDateTimeLocalInCuiaba(result.reminder.followupAt))
      setAutoReminderEnabledDraft(result.reminder.autoReminderEnabled)
      showToast({
        variant: "success",
        title: "Lembretes atualizados",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar lembretes."
      showToast({
        variant: "error",
        title: "Erro ao salvar lembretes",
        description: message,
      })
    } finally {
      setSavingReminder(false)
    }
  }

  async function handleSaveFinancialAdjustment() {
    if (!data || !financialPreview) return
    if (financialPreview.totalWouldBeNegative) {
      showToast({
        variant: "error",
        title: "Ajuste inválido",
        description: "O valor total final não pode ficar negativo.",
      })
      return
    }

    setSavingFinancialAdjustment(true)
    try {
      const result = await updateProposalFinancialAdjustment(proposal.id, {
        deltaTotalValue,
        deltaProfitValue,
      })

      if (result.error) throw new Error(result.error)
      if (!result.data) throw new Error("Resposta inválida do servidor.")
      const nextValues = result.data

      setData((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          totalValue: nextValues.totalValue,
          profitValue: nextValues.profitValue,
          effectiveMarginPercent: nextValues.effectiveMarginPercent,
        }
      })

      onFinancialUpdate?.(proposal.id, nextValues)
      setDeltaTotalDraft("")
      setDeltaProfitDraft("")
      showToast({
        variant: "success",
        title: "Ajuste financeiro salvo",
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar ajuste financeiro."
      showToast({
        variant: "error",
        title: "Erro ao salvar ajuste",
        description: message,
      })
    } finally {
      setSavingFinancialAdjustment(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[min(96vw,1280px)] max-w-none overflow-y-auto p-4 sm:p-5 lg:overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight pr-6">{proposal.clientName}</DialogTitle>
          <DialogDescription className="text-xs">Orçamento #{shortId}</DialogDescription>
        </DialogHeader>

        {loading && <LoadingSkeleton />}

        {!loading && data && (
          <div className="mt-1 pb-1 lg:h-[calc(94vh-120px)] lg:overflow-hidden">
            <div className="grid gap-4 lg:h-full lg:grid-cols-2 lg:items-start lg:gap-4 lg:overflow-hidden">
              <div className="space-y-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
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

                <SectionLabel>Resumo Financeiro</SectionLabel>
                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <Row label="Valor Total à Vista" value={brlFull(data.totalValue)} />
                  <Row label="Lucro Atual" value={brlFull(data.profitValue)} />
                  <Row
                    label="Margem Efetiva"
                    value={
                      data.effectiveMarginPercent != null ? (
                        <span className={
                          data.effectiveMarginPercent >= 18 ? "text-emerald-600" :
                          data.effectiveMarginPercent >= 10 ? "text-amber-600" :
                          "text-red-600"
                        }>
                          {percent(data.effectiveMarginPercent)}
                        </span>
                      ) : "—"
                    }
                  />
                  <Row
                    label="Margem (%) Calculada"
                    value={
                      data.marginCalculatedPercent != null ? (
                        <span className={
                          data.marginCalculatedPercent >= 18 ? "text-emerald-600" :
                          data.marginCalculatedPercent >= 10 ? "text-amber-600" :
                          "text-red-600"
                        }>
                          {percent(data.marginCalculatedPercent)}
                        </span>
                      ) : "—"
                    }
                  />
                  <Row label="Kit Gerador" value={brlFull(data.kitCost)} />
                  <Row label="Estrutura" value={brlFull(data.structureCost)} />
                  <Row label="Adicionais" value={brlFull(data.additionalCost)} />
                  <Row label="Total Material (Kit + Estrutura)" value={brlFull(data.materialTotal)} />
                  <Row label="Total com Adicionais" value={brlFull(data.materialWithAdditionalTotal)} />
                </div>

                {canAdjustFinancial && financialPreview && (
                  <>
                    <SectionLabel>Ajuste Financeiro</SectionLabel>
                    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2.5">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Ajuste no valor total
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            value={deltaTotalDraft}
                            onChange={(event) => setDeltaTotalDraft(event.target.value)}
                            disabled={savingFinancialAdjustment}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Ajuste no lucro
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            value={deltaProfitDraft}
                            onChange={(event) => setDeltaProfitDraft(event.target.value)}
                            disabled={savingFinancialAdjustment}
                            placeholder="0,00"
                          />
                        </div>
                      </div>

                      <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                          Preview
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Total atual</p>
                            <p className="font-semibold text-foreground">{brlFull(financialPreview.currentTotalValue)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Total estimado</p>
                            <p className="font-semibold text-foreground">{brlFull(financialPreview.estimatedTotalValue)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Lucro atual</p>
                            <p className="font-semibold text-foreground">{brlFull(financialPreview.currentProfitValue)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Lucro estimado</p>
                            <p className="font-semibold text-foreground">{brlFull(financialPreview.estimatedProfitValue)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Margem atual</p>
                            <p className="font-semibold text-foreground">{percent(financialPreview.currentMarginPercent)}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Margem estimada</p>
                            <p className="font-semibold text-foreground">{percent(financialPreview.estimatedMarginPercent)}</p>
                          </div>
                          <div className="col-span-2 space-y-0.5">
                            <p className="text-muted-foreground">Variação</p>
                            <p className="font-semibold text-foreground">
                              {financialPreview.marginDeltaPercentagePoints != null
                                ? `${financialPreview.marginDeltaPercentagePoints >= 0 ? "+" : ""}${financialPreview.marginDeltaPercentagePoints.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} p.p.`
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-red-600">
                          {financialPreview.totalWouldBeNegative ? "O valor total final não pode ficar negativo." : ""}
                        </p>
                        <Button
                          onClick={handleSaveFinancialAdjustment}
                          disabled={
                            savingFinancialAdjustment ||
                            financialPreview.totalWouldBeNegative ||
                            !hasFinancialDelta
                          }
                          size="sm"
                        >
                          {savingFinancialAdjustment ? "Salvando..." : "Salvar ajuste financeiro"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {!canAdjustFinancial && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ajuste financeiro disponível apenas para administradores.
                  </p>
                )}

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

              <div className="space-y-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
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

                <SectionLabel>Equipamentos</SectionLabel>
                <div className="rounded-lg border border-border bg-card px-3 py-1">
                  <Row label="Módulo" value={data.moduleName ?? "—"} />
                  <Row
                    label="Tipo Inversor"
                    value={data.inverterType ?? "—"}
                  />
                  <Row
                    label="Inversor"
                    value={data.inverterNames.length > 0 ? inverterLabel : "—"}
                  />
                  <Row
                    label="Quantidade de inversores"
                    value={
                      data.inverterTotalQuantity != null
                        ? data.inverterTotalQuantity.toLocaleString("pt-BR")
                        : "—"
                    }
                  />
                  {data.inverterItems.length > 0 && (
                    <div className="py-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Modelos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {data.inverterItems.map((item) => (
                          <span
                            key={`${item.name}-${item.quantity}`}
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                          >
                            {item.quantity}x {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
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

                <SectionLabel>Acompanhamento</SectionLabel>
                {panelLoading && <FollowupPanelSkeleton />}
                {!panelLoading && panelData && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border bg-card p-2.5">
                      {panelData.timeline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhum feedback registrado ainda.
                        </p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {panelData.timeline.map((message) => (
                            <div key={message.id} className="rounded-md border border-border/70 bg-muted/20 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {message.role === "analyst" ? "Analista" : (message.userName ?? "Usuário")}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {formatDateTimeInCuiaba(message.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{message.content}</p>
                              {message.statusSuggestion && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  Sugestão de status:{" "}
                                  <strong>{STATUS_LABELS[message.statusSuggestion] ?? message.statusSuggestion}</strong>
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
                      <Textarea
                        rows={2}
                        value={feedbackDraft}
                        onChange={(event) => setFeedbackDraft(event.target.value)}
                        placeholder="Registre aqui o feedback deste orçamento..."
                        disabled={savingFeedback}
                        className="text-xs"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveFeedback}
                          disabled={savingFeedback || !feedbackDraft.trim()}
                          size="sm"
                        >
                          {savingFeedback ? "Salvando..." : "Salvar feedback"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <SectionLabel>Lembretes</SectionLabel>
                {panelLoading && <FollowupPanelSkeleton />}
                {!panelLoading && panelData && (
                  <div className="rounded-lg border border-border bg-card p-2.5 space-y-2.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Lembrete manual
                      </label>
                      <Input
                        type="datetime-local"
                        value={manualReminderDraft}
                        onChange={(event) => setManualReminderDraft(event.target.value)}
                        disabled={savingReminder}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Notificado em: {formatDateTimeInCuiaba(panelData.reminder.followupNotifiedAt)}
                      </p>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={autoReminderEnabledDraft}
                        onChange={(event) => setAutoReminderEnabledDraft(event.target.checked)}
                        disabled={savingReminder}
                        className="h-4 w-4 rounded border-border"
                      />
                      Lembrete automático ativo (a cada 2 dias)
                    </label>

                    <p className="text-xs text-muted-foreground">
                      {nextAutoReminderLabel}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Status atual: {STATUS_LABELS[panelData.reminder.negotiationStatus] ?? panelData.reminder.negotiationStatus}
                    </p>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveReminder}
                        disabled={savingReminder}
                        size="sm"
                      >
                        {savingReminder ? "Salvando..." : "Salvar lembretes"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
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
