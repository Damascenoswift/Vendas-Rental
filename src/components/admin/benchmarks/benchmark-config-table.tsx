"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { updateBenchmark, type TaskTimeBenchmark } from "@/services/task-benchmark-service"

const DEPARTMENT_LABELS: Record<string, string> = {
    vendas: "Vendas",
    cadastro: "Cadastro",
    energia: "Energia",
    juridico: "Jurídico",
    financeiro: "Financeiro",
    ti: "TI",
    diretoria: "Diretoria",
    obras: "Obras",
    outro: "Outro",
}

export function BenchmarkConfigTable({ initialBenchmarks }: { initialBenchmarks: TaskTimeBenchmark[] }) {
    const [benchmarks, setBenchmarks] = useState(initialBenchmarks)
    const [loading, setLoading] = useState<string | null>(null)

    async function handleToggleActive(id: string, current: boolean) {
        setLoading(id)
        const result = await updateBenchmark(id, { active: !current })
        if (!result.error) {
            setBenchmarks((prev) =>
                prev.map((b) => (b.id === id ? { ...b, active: !current } : b))
            )
        }
        setLoading(null)
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Setor</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">Dias úteis esperados</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {benchmarks.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                                Nenhum benchmark cadastrado.
                            </TableCell>
                        </TableRow>
                    )}
                    {benchmarks.map((b) => (
                        <TableRow key={b.id}>
                            <TableCell className="font-medium">
                                {DEPARTMENT_LABELS[b.department] ?? b.department}
                            </TableCell>
                            <TableCell>{b.label}</TableCell>
                            <TableCell className="text-center">{b.expected_business_days}d</TableCell>
                            <TableCell className="text-center">
                                <Badge variant={b.active ? "default" : "secondary"}>
                                    {b.active ? "Ativo" : "Inativo"}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loading === b.id}
                                    onClick={() => handleToggleActive(b.id, b.active)}
                                >
                                    {b.active ? "Desativar" : "Ativar"}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
