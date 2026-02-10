"use client"

import { useMemo, useState } from "react"
import { Loader2, Save } from "lucide-react"

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

type RentalCommissionSettingsProps = {
    managerName: string
    defaultPercent: number
    managerOverridePercent: number
    sellerRates: SellerRateItem[]
}

export function RentalCommissionSettings({
    managerName,
    defaultPercent,
    managerOverridePercent,
    sellerRates,
}: RentalCommissionSettingsProps) {
    const { showToast } = useToast()
    const [defaultValue, setDefaultValue] = useState<number>(defaultPercent)
    const [overrideValue, setOverrideValue] = useState<number>(managerOverridePercent)
    const [sellerValues, setSellerValues] = useState<Record<string, number>>({})
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})

    const tableRows = useMemo(() => {
        return sellerRates.map((item) => ({
            ...item,
            currentPercent: sellerValues[item.userId] ?? item.percent,
        }))
    }, [sellerRates, sellerValues])

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
        </div>
    )
}

