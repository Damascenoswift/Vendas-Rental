"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
    upsertDorataSaleCommissionPercent,
    upsertRentalDefaultCommissionPercent,
    upsertRentalManagerOverridePercent,
    upsertSellerRentalCommissionPercent,
} from "@/app/actions/financial"

type SellerRateItem = {
    userId: string
    name: string
    email: string
    percent: number
    isCustom: boolean
}

type ClientRateItem = {
    leadId: string
    clientName: string
    sellerName: string
    percent: number
    isCustom: boolean
}

type RentalCommissionSettingsProps = {
    managerName: string
    defaultPercent: number
    managerOverridePercent: number
    sellerRates: SellerRateItem[]
    clientRates: ClientRateItem[]
}

export function RentalCommissionSettings({
    managerName,
    defaultPercent,
    managerOverridePercent,
    sellerRates,
    clientRates,
}: RentalCommissionSettingsProps) {
    const { showToast } = useToast()
    const [defaultValue, setDefaultValue] = useState<number>(defaultPercent)
    const [overrideValue, setOverrideValue] = useState<number>(managerOverridePercent)
    const [sellerValues, setSellerValues] = useState<Record<string, number>>({})
    const [clientValues, setClientValues] = useState<Record<string, number>>({})
    const [showDorataOverrides, setShowDorataOverrides] = useState(false)
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

    const tableRows = useMemo(() => {
        return sellerRates.map((item) => ({
            ...item,
            currentPercent: sellerValues[item.userId] ?? item.percent,
        }))
    }, [sellerRates, sellerValues])

    const clientTableRows = useMemo(() => {
        return clientRates.map((item) => ({
            ...item,
            currentPercent: clientValues[item.leadId] ?? item.percent,
        }))
    }, [clientRates, clientValues])

    const setLoading = (key: string, value: boolean) => {
        setLoadingMap((prev) => ({ ...prev, [key]: value }))
    }

    const saveDefaultPercent = async () => {
        const key = "default"
        setLoading(key, true)
        const result = await upsertRentalDefaultCommissionPercent({ percent: Number(defaultValue) })
        setLoading(key, false)

        if (!result.success) {
            showToast({ variant: "error", title: "Erro", description: result.message })
            return
        }

        showToast({ variant: "success", title: "Atualizado", description: result.message })
    }

    const saveManagerOverride = async () => {
        const key = "override"
        setLoading(key, true)
        const result = await upsertRentalManagerOverridePercent({ percent: Number(overrideValue) })
        setLoading(key, false)

        if (!result.success) {
            showToast({ variant: "error", title: "Erro", description: result.message })
            return
        }

        showToast({ variant: "success", title: "Atualizado", description: result.message })
    }

    const saveSellerPercent = async (userId: string) => {
        const key = `seller:${userId}`
        const percent = Number(sellerValues[userId] ?? sellerRates.find((row) => row.userId === userId)?.percent ?? 0)
        setLoading(key, true)

        const result = await upsertSellerRentalCommissionPercent({
            userId,
            percent,
        })

        setLoading(key, false)

        if (!result.success) {
            showToast({ variant: "error", title: "Erro", description: result.message })
            return
        }

        showToast({ variant: "success", title: "Atualizado", description: result.message })
    }

    const saveClientPercent = async (leadId: string) => {
        const key = `client:${leadId}`
        const percent = Number(clientValues[leadId] ?? clientRates.find((row) => row.leadId === leadId)?.percent ?? 0)
        setLoading(key, true)

        const result = await upsertDorataSaleCommissionPercent({
            saleId: leadId,
            percent,
        })

        setLoading(key, false)

        if (!result.success) {
            showToast({ variant: "error", title: "Erro", description: result.message })
            return
        }

        showToast({ variant: "success", title: "Atualizado", description: result.message })
    }

    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Configuração de Comissão Rental</h2>
                <p className="text-sm text-muted-foreground">
                    Ajuste o percentual por vendedor e o override de {managerName}.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium">Comissão padrão Rental (%)</p>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={defaultValue}
                            onChange={(event) => setDefaultValue(Number(event.target.value))}
                        />
                        <Button onClick={saveDefaultPercent} disabled={loadingMap.default}>
                            {loadingMap.default ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-sm font-medium">Override gestor ({managerName}) %</p>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={overrideValue}
                            onChange={(event) => setOverrideValue(Number(event.target.value))}
                        />
                        <Button onClick={saveManagerOverride} disabled={loadingMap.override}>
                            {loadingMap.override ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="w-[160px]">Comissão (%)</TableHead>
                            <TableHead className="w-[120px]">Origem</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tableRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                    Nenhum vendedor encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            tableRows.map((row) => {
                                const loadingKey = `seller:${row.userId}`
                                return (
                                    <TableRow key={row.userId}>
                                        <TableCell className="font-medium">{row.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{row.email}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                value={row.currentPercent}
                                                onChange={(event) =>
                                                    setSellerValues((prev) => ({
                                                        ...prev,
                                                        [row.userId]: Number(event.target.value),
                                                    }))
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {row.isCustom ? "Personalizada" : "Padrão"}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => saveSellerPercent(row.userId)}
                                                disabled={loadingMap[loadingKey]}
                                            >
                                                {loadingMap[loadingKey] ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Save className="h-4 w-4 text-green-600" />
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="rounded-md border">
                <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setShowDorataOverrides((prev) => !prev)}
                >
                    <div>
                        <h3 className="text-sm font-semibold">Comissão individual por cliente (Dorata)</h3>
                        <p className="text-xs text-muted-foreground">
                            Casos esporádicos. Clique para {showDorataOverrides ? "ocultar" : "abrir"} a lista.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{clientTableRows.length} vendas</span>
                        {showDorataOverrides ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                </button>

                {showDorataOverrides ? (
                    <div className="border-t max-h-[440px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Vendedor</TableHead>
                                    <TableHead className="w-[160px]">Comissão (%)</TableHead>
                                    <TableHead className="w-[120px]">Origem</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clientTableRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                            Nenhuma venda Dorata encontrada para o filtro atual.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    clientTableRows.map((row) => {
                                        const loadingKey = `client:${row.leadId}`
                                        return (
                                            <TableRow key={row.leadId}>
                                                <TableCell className="font-medium">{row.clientName}</TableCell>
                                                <TableCell className="text-muted-foreground">{row.sellerName}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        max="100"
                                                        value={row.currentPercent}
                                                        onChange={(event) =>
                                                            setClientValues((prev) => ({
                                                                ...prev,
                                                                [row.leadId]: Number(event.target.value),
                                                            }))
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {row.isCustom ? "Personalizada" : "Orçamento/Padrão"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => saveClientPercent(row.leadId)}
                                                        disabled={loadingMap[loadingKey]}
                                                    >
                                                        {loadingMap[loadingKey] ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Save className="h-4 w-4 text-green-600" />
                                                        )}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
