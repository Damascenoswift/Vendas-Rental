"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createBenchmark, updateBenchmark } from "@/services/task-benchmark-actions"
import type { TaskTimeBenchmark } from "@/services/task-benchmark-service"
import type { Department } from "@/services/task-service"

const DEPARTMENTS = [
    { value: "vendas", label: "Vendas" },
    { value: "cadastro", label: "Cadastro" },
    { value: "energia", label: "Energia" },
    { value: "juridico", label: "Jurídico" },
    { value: "financeiro", label: "Financeiro" },
    { value: "ti", label: "TI" },
    { value: "diretoria", label: "Diretoria" },
    { value: "obras", label: "Obras" },
    { value: "outro", label: "Outro" },
] as const

const DEPARTMENT_LABELS: Record<string, string> = Object.fromEntries(
    DEPARTMENTS.map(({ value, label }) => [value, label])
)

const DEFAULT_FORM = { department: "", label: "", expected_business_days: "" }

export function BenchmarkConfigTable({ initialBenchmarks }: { initialBenchmarks: TaskTimeBenchmark[] }) {
    const [benchmarks, setBenchmarks] = useState(initialBenchmarks)
    const [loading, setLoading] = useState<string | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [form, setForm] = useState(DEFAULT_FORM)
    const [formError, setFormError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

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

    async function handleCreate() {
        const days = Number(form.expected_business_days)
        if (!form.department || !form.label.trim() || !days || days < 1) {
            setFormError("Preencha todos os campos corretamente.")
            return
        }
        setSaving(true)
        setFormError(null)
        const result = await createBenchmark({
            department: form.department as Department,
            label: form.label.trim(),
            expected_business_days: days,
        })
        setSaving(false)
        if (result.error) {
            setFormError(result.error)
            return
        }
        // Refresh the table by reloading the page (server component will re-fetch)
        setDialogOpen(false)
        setForm(DEFAULT_FORM)
        window.location.reload()
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar benchmark
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Novo benchmark de tempo</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Setor</Label>
                                <Select
                                    value={form.department}
                                    onValueChange={(v) => setForm((f) => ({ ...f, department: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o setor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEPARTMENTS.map(({ value, label }) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Categoria</Label>
                                <Input
                                    placeholder="Ex: Contrato de Aluguel"
                                    value={form.label}
                                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Dias úteis esperados</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="5"
                                    value={form.expected_business_days}
                                    onChange={(e) => setForm((f) => ({ ...f, expected_business_days: e.target.value }))}
                                />
                            </div>
                            {formError && <p className="text-sm text-destructive">{formError}</p>}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreate} disabled={saving}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

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
        </div>
    )
}
