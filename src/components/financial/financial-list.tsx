"use client"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface Transaction {
    id: string
    created_at: string
    amount: number
    type: string
    status: string
    description: string | null
    beneficiary: { name: string; email: string } | null
    creator: { name: string } | null
}

export function FinancialList({ transactions }: { transactions: Transaction[] }) {
    return (
        <div className="rounded-md border bg-white">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                Nenhuma transação registrada.
                            </TableCell>
                        </TableRow>
                    ) : (
                        transactions.map((tx) => (
                            <TableRow key={tx.id}>
                                <TableCell>
                                    {format(new Date(tx.created_at), "dd/MM/yyyy", { locale: ptBR })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">{tx.beneficiary?.name || "—"}</span>
                                        <span className="text-xs text-muted-foreground">{tx.beneficiary?.email}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="capitalize">{tx.type.replace("_", " ")}</TableCell>
                                <TableCell className="text-muted-foreground">{tx.description || "—"}</TableCell>
                                <TableCell className={`text-right font-medium ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {new Intl.NumberFormat("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                    }).format(tx.amount)}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={tx.status === "pago" ? "success" : "secondary"}>
                                        {tx.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
