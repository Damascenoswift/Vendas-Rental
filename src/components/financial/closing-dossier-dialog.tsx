"use client"

import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export type FinancialClosingDossierItem = {
    id: string
    brand: "rental" | "dorata"
    beneficiaryName: string
    beneficiaryEmail: string
    transactionType: string
    sourceKind: "rental_sistema" | "dorata_sistema" | "manual_elyakim"
    sourceRefId: string
    originLeadId: string | null
    description: string | null
    clientName: string | null
    valueReleased: number
    valuePaid: number
    paymentDate: string | null
    createdAt: string | null
}

export type FinancialClosingDossier = {
    id: string
    code: string
    status: string
    competencia: string | null
    closedAt: string | null
    createdAt: string | null
    closedByName: string
    observation: string | null
    itemCount: number
    totalValue: number
    items: FinancialClosingDossierItem[]
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value)
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    return new Date(value).toLocaleDateString("pt-BR")
}

function formatTransactionType(value: string) {
    return value.replaceAll("_", " ")
}

function formatSourceKind(value: FinancialClosingDossierItem["sourceKind"]) {
    if (value === "manual_elyakim") return "Manual Elyakim"
    if (value === "dorata_sistema") return "Sistema Dorata"
    return "Sistema Rental"
}

function statusVariant(status: string) {
    if (status === "fechado") return "success" as const
    if (status === "cancelado") return "destructive" as const
    return "secondary" as const
}

export function FinancialClosingDossierDialog({ closing }: { closing: FinancialClosingDossier }) {
    const paidItems = closing.items.filter((item) => item.transactionType !== "despesa")
    const expenseItems = closing.items.filter((item) => item.transactionType === "despesa")
    const grossPaid = paidItems.reduce((sum, item) => sum + item.valuePaid, 0)
    const totalExpenses = expenseItems.reduce((sum, item) => sum + item.valuePaid, 0)
    const netPaid = grossPaid - totalExpenses

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="text-left font-semibold text-primary underline-offset-4 hover:underline"
                >
                    {closing.code}
                </button>
            </DialogTrigger>

            <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-0">
                <div className="space-y-6 p-6">
                    <DialogHeader className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <DialogTitle className="text-2xl">Dossiê do Fechamento</DialogTitle>
                                <DialogDescription className="text-sm">
                                    Detalhamento completo do lote {closing.code}, com comissões pagas, despesas abatidas e rastreio dos itens.
                                </DialogDescription>
                            </div>
                            <Badge variant={statusVariant(closing.status)}>
                                {closing.status}
                            </Badge>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border bg-muted/30 p-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Competência</p>
                                <p className="mt-2 text-base font-semibold">{formatDate(closing.competencia)}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fechado em</p>
                                <p className="mt-2 text-base font-semibold">{formatDate(closing.closedAt || closing.createdAt)}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fechado por</p>
                                <p className="mt-2 text-base font-semibold">{closing.closedByName}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-4">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Itens do lote</p>
                                <p className="mt-2 text-base font-semibold">{closing.itemCount}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border bg-emerald-50 p-5">
                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Comissões pagas</p>
                            <p className="mt-2 text-2xl font-bold text-emerald-800">{formatCurrency(grossPaid)}</p>
                            <p className="mt-1 text-xs text-emerald-700">Soma dos itens de crédito do lote.</p>
                        </div>
                        <div className="rounded-xl border bg-rose-50 p-5">
                            <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Despesas abatidas</p>
                            <p className="mt-2 text-2xl font-bold text-rose-800">{formatCurrency(totalExpenses)}</p>
                            <p className="mt-1 text-xs text-rose-700">Descontos lançados dentro do próprio fechamento.</p>
                        </div>
                        <div className="rounded-xl border bg-slate-900 p-5 text-white">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Total líquido</p>
                            <p className="mt-2 text-2xl font-bold">{formatCurrency(closing.totalValue || netPaid)}</p>
                            <p className="mt-1 text-xs text-slate-300">Valor final efetivamente pago no lote.</p>
                        </div>
                    </div>

                    {closing.observation ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Observação do fechamento</p>
                            <p className="mt-2 text-sm text-amber-900">{closing.observation}</p>
                        </div>
                    ) : null}

                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold">Itens pagos</h3>
                            <p className="text-sm text-muted-foreground">
                                Comissões e créditos incluídos neste fechamento.
                            </p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Marca</TableHead>
                                        <TableHead>Beneficiário</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Origem</TableHead>
                                        <TableHead>Pagamento</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paidItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                                Nenhum item de crédito encontrado neste lote.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paidItems.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <Badge variant={item.brand === "rental" ? "secondary" : "default"}>
                                                        {item.brand === "rental" ? "Rental" : "Dorata"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{item.beneficiaryName}</span>
                                                        <span className="text-xs text-muted-foreground">{item.beneficiaryEmail || "—"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{item.clientName || "—"}</span>
                                                        <span className="text-xs text-muted-foreground">{item.description || "Sem descrição"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="capitalize">{formatTransactionType(item.transactionType)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{formatSourceKind(item.sourceKind)}</span>
                                                        <span className="text-xs text-muted-foreground">{item.originLeadId || item.sourceRefId}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{formatDate(item.paymentDate || item.createdAt)}</TableCell>
                                                <TableCell className="text-right font-semibold text-emerald-700">
                                                    {formatCurrency(item.valuePaid)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <h3 className="text-lg font-semibold">Despesas e abatimentos</h3>
                            <p className="text-sm text-muted-foreground">
                                Valores descontados do fechamento antes do total líquido.
                            </p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Marca</TableHead>
                                        <TableHead>Beneficiário</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead>Origem</TableHead>
                                        <TableHead>Pagamento</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenseItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                                Nenhuma despesa lançada neste fechamento.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        expenseItems.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <Badge variant={item.brand === "rental" ? "secondary" : "default"}>
                                                        {item.brand === "rental" ? "Rental" : "Dorata"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{item.beneficiaryName}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span>{item.description || "Despesa sem descrição"}</span>
                                                        <span className="text-xs text-muted-foreground">{item.clientName || "Sem cliente"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{formatSourceKind(item.sourceKind)}</TableCell>
                                                <TableCell>{formatDate(item.paymentDate || item.createdAt)}</TableCell>
                                                <TableCell className="text-right font-semibold text-rose-700">
                                                    {formatCurrency(item.valuePaid)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
