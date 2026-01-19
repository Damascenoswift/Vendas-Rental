"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
})

const tariffFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
})

const numberFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
})

const monthSeries = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
const barMultipliers = [0.78, 0.92, 0.86, 0.8, 0.9, 1.04, 0.96, 1.02, 1.08, 0.92, 1.06, 0.88]

const invoiceStyles: CSSProperties = {
    "--invoice-ink": "#0b0c0f",
    "--invoice-accent": "#f7d046",
    "--invoice-lime": "#7ee081",
    "--invoice-cyan": "#63b7ff",
}

const formatCurrency = (value: number) => currencyFormatter.format(value)
const formatTariff = (value: number) => tariffFormatter.format(value)
const formatNumber = (value: number) => numberFormatter.format(value)
const formatPercent = (value: number) => `${percentFormatter.format(value)}%`

const toNumber = (value: string) => {
    const next = Number(value)
    if (!Number.isFinite(next)) {
        return 0
    }
    return Math.max(0, next)
}

export function RentalCalculator() {
    const [clienteNome, setClienteNome] = useState("DANIELA RODRIGUES")
    const [referencia, setReferencia] = useState("10/2025")
    const [numeroFatura, setNumeroFatura] = useState("600021380")
    const [instalacao, setInstalacao] = useState("W0013703062")
    const [vencimento, setVencimento] = useState("10/11/25")

    const [valorLocacao, setValorLocacao] = useState(10050.24)
    const [valorPagoEnergisa, setValorPagoEnergisa] = useState(0)
    const [valorDesconto, setValorDesconto] = useState(3350.08)
    const [consumoAnual, setConsumoAnual] = useState(147816)

    const consumoMensal = useMemo(() => consumoAnual / 12, [consumoAnual])
    const consumoMensalArredondado = useMemo(() => Math.round(consumoMensal), [consumoMensal])

    const valorSemDesconto = useMemo(
        () => valorLocacao + valorPagoEnergisa + valorDesconto,
        [valorLocacao, valorPagoEnergisa, valorDesconto]
    )

    const valorAPagar = useMemo(
        () => valorLocacao + valorPagoEnergisa,
        [valorLocacao, valorPagoEnergisa]
    )

    const economiaMes = useMemo(() => Math.max(0, valorDesconto), [valorDesconto])
    const economiaAno = useMemo(() => economiaMes * 12, [economiaMes])

    const descontoPercentual = useMemo(() => {
        if (valorSemDesconto <= 0) {
            return 0
        }
        return (valorDesconto / valorSemDesconto) * 100
    }, [valorDesconto, valorSemDesconto])

    const tarifaSemDesconto = useMemo(() => {
        if (consumoMensal <= 0) {
            return 0
        }
        return valorSemDesconto / consumoMensal
    }, [valorSemDesconto, consumoMensal])

    const monthlySeries = useMemo(
        () =>
            barMultipliers.map((multiplier) => ({
                locacao: valorAPagar * multiplier,
                economia: economiaMes * multiplier,
            })),
        [valorAPagar, economiaMes]
    )

    const maxBar = useMemo(() => {
        const maxValue = Math.max(...monthlySeries.map((item) => item.locacao + item.economia))
        return maxValue > 0 ? maxValue : 1
    }, [monthlySeries])

    const tarifaLabel = consumoMensal > 0 ? formatTariff(tarifaSemDesconto) : "--"

    return (
        <Card className="border-dashed bg-muted/40">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                    Simulador de fatura do cliente
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--invoice-ink)] text-white shadow-2xl"
                        style={invoiceStyles}
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(247,208,70,0.18),_transparent_55%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.05),_transparent_45%)]" />
                        <div className="relative space-y-6 p-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                                        Rental energia
                                    </p>
                                    <h3 className="text-xl font-semibold">Fatura simulada</h3>
                                    <div className="mt-3 space-y-1 text-xs text-white/70">
                                        <p>
                                            Locatario:{" "}
                                            <span className="text-white">{clienteNome}</span>
                                        </p>
                                        <p>Referencia: {referencia}</p>
                                        <p>
                                            Consumo medio anual: {formatNumber(consumoAnual)} kWh
                                        </p>
                                    </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-[11px] uppercase tracking-wide text-white/60">
                                            Numero da fatura
                                        </p>
                                        <p className="text-lg font-semibold">{numeroFatura}</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-[11px] uppercase tracking-wide text-white/60">
                                            Instalacao
                                        </p>
                                        <p className="text-lg font-semibold">{instalacao}</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-[11px] uppercase tracking-wide text-white/60">
                                            Vencimento
                                        </p>
                                        <p className="text-lg font-semibold">{vencimento}</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-[var(--invoice-accent)]/10 p-3">
                                        <p className="text-[11px] uppercase tracking-wide text-white/60">
                                            Valor a pagar
                                        </p>
                                        <p className="text-lg font-semibold text-[var(--invoice-accent)]">
                                            {formatCurrency(valorAPagar)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-black/50 p-4">
                                <p className="text-xs text-white/60">
                                    Neste mes a sua cota locada gerou
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-[var(--invoice-accent)]">
                                    {formatCurrency(economiaMes)} de economia
                                </p>
                                <p className="text-xs text-white/60">
                                    Economia anual estimada: {formatCurrency(economiaAno)}
                                </p>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[180px_1fr_180px]">
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Tarifa sem desconto
                                        </p>
                                        <p className="text-sm font-semibold">{tarifaLabel}</p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Valor sem desconto
                                        </p>
                                        <p className="text-sm font-semibold">
                                            {formatCurrency(valorSemDesconto)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Desconto aplicado
                                        </p>
                                        <p className="text-sm font-semibold">
                                            {formatPercent(descontoPercentual)}
                                        </p>
                                        <p className="text-xs text-white/60">
                                            {formatCurrency(valorDesconto)}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-center gap-4 text-xs text-white/60">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[var(--invoice-cyan)]" />
                                            Locacao
                                        </span>
                                        <span className="inline-flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[var(--invoice-lime)]" />
                                            Economia do mes
                                        </span>
                                    </div>
                                    <div className="mt-3 flex h-28 items-end gap-1">
                                        {monthlySeries.map((item, index) => {
                                            const locacaoHeight = (item.locacao / maxBar) * 100
                                            const economiaHeight = (item.economia / maxBar) * 100

                                            return (
                                                <div
                                                    key={`${index}-${item.locacao}`}
                                                    className="flex h-full flex-1 flex-col justify-end gap-[2px]"
                                                >
                                                    <div
                                                        className="rounded-sm bg-[var(--invoice-cyan)]"
                                                        style={{ height: `${locacaoHeight}%` }}
                                                    />
                                                    <div
                                                        className="rounded-sm bg-[var(--invoice-lime)]"
                                                        style={{ height: `${economiaHeight}%` }}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-3 grid grid-cols-12 gap-1 text-[10px] text-white/40">
                                        {monthSeries.map((month, index) => (
                                            <span key={`${month}-${index}`} className="text-center">
                                                {month}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Valor locacao
                                        </p>
                                        <p className="text-sm font-semibold">
                                            {formatCurrency(valorLocacao)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Fatura concessionaria
                                        </p>
                                        <p className="text-sm font-semibold">
                                            {formatCurrency(valorPagoEnergisa)}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                        <p className="text-[11px] uppercase text-white/60">
                                            Locacao + concessionaria
                                        </p>
                                        <p className="text-sm font-semibold">
                                            {formatCurrency(valorAPagar)}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] uppercase text-white/60">
                                        Economia do mes
                                    </p>
                                    <p className="text-2xl font-semibold">
                                        {formatCurrency(economiaMes)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] uppercase text-white/60">
                                        Economia anual
                                    </p>
                                    <p className="text-2xl font-semibold">
                                        {formatCurrency(economiaAno)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] uppercase text-white/60">
                                        Consumo medio mensal
                                    </p>
                                    <p className="text-2xl font-semibold">
                                        {formatNumber(consumoMensalArredondado)} kWh
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border bg-background p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold">Editar simulacao</p>
                                <span className="text-xs text-muted-foreground">
                                    Atualiza em tempo real
                                </span>
                            </div>
                            <div className="mt-4 grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="cliente-nome" className="text-xs">
                                        Nome do cliente
                                    </Label>
                                    <Input
                                        id="cliente-nome"
                                        className="h-9 text-sm"
                                        value={clienteNome}
                                        onChange={(event) => setClienteNome(event.target.value)}
                                    />
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="referencia" className="text-xs">
                                            Referencia
                                        </Label>
                                        <Input
                                            id="referencia"
                                            className="h-9 text-sm"
                                            value={referencia}
                                            onChange={(event) => setReferencia(event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="vencimento" className="text-xs">
                                            Vencimento
                                        </Label>
                                        <Input
                                            id="vencimento"
                                            className="h-9 text-sm"
                                            value={vencimento}
                                            onChange={(event) => setVencimento(event.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="numero-fatura" className="text-xs">
                                            Numero da fatura
                                        </Label>
                                        <Input
                                            id="numero-fatura"
                                            className="h-9 text-sm"
                                            value={numeroFatura}
                                            onChange={(event) => setNumeroFatura(event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="instalacao" className="text-xs">
                                            Instalacao
                                        </Label>
                                        <Input
                                            id="instalacao"
                                            className="h-9 text-sm"
                                            value={instalacao}
                                            onChange={(event) => setInstalacao(event.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="valor-locacao" className="text-xs">
                                            Valor locacao (R$)
                                        </Label>
                                        <Input
                                            id="valor-locacao"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            min="0"
                                            className="h-9 text-sm"
                                            value={valorLocacao}
                                            onChange={(event) => setValorLocacao(toNumber(event.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="valor-energisa" className="text-xs">
                                            Valor pago a Energisa (R$)
                                        </Label>
                                        <Input
                                            id="valor-energisa"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            min="0"
                                            className="h-9 text-sm"
                                            value={valorPagoEnergisa}
                                            onChange={(event) => setValorPagoEnergisa(toNumber(event.target.value))}
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="valor-desconto" className="text-xs">
                                            Valor do desconto (R$)
                                        </Label>
                                        <Input
                                            id="valor-desconto"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            min="0"
                                            className="h-9 text-sm"
                                            value={valorDesconto}
                                            onChange={(event) => setValorDesconto(toNumber(event.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="consumo-anual" className="text-xs">
                                            Consumo medio anual (kWh)
                                        </Label>
                                        <Input
                                            id="consumo-anual"
                                            type="number"
                                            inputMode="decimal"
                                            step="1"
                                            min="0"
                                            className="h-9 text-sm"
                                            value={consumoAnual}
                                            onChange={(event) => setConsumoAnual(toNumber(event.target.value))}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border bg-muted/40 p-4">
                            <p className="text-sm font-semibold">Resumo rapido</p>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Valor sem desconto</span>
                                    <span className="font-medium">
                                        {formatCurrency(valorSemDesconto)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Desconto (%)</span>
                                    <span className="font-medium">
                                        {formatPercent(descontoPercentual)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Economia anual</span>
                                    <span className="font-medium">
                                        {formatCurrency(economiaAno)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Tarifa sem desconto</span>
                                    <span className="font-medium">{tarifaLabel}</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </CardContent>
        </Card>
    )
}
