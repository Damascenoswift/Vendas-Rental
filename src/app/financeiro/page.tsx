import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

type FinancialTransaction = {
    id: string
    created_at: string
    due_date: string | null
    amount: number
    type: string
    status: string
    description: string | null
    origin_lead_id: string | null
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value)
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(new Date(value))
    } catch {
        return "—"
    }
}

function formatType(value: string) {
    return value.replaceAll("_", " ")
}

export default async function MeuFinanceiroPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    if (!profile || !["supervisor", "vendedor_interno"].includes(profile.role)) {
        redirect("/dashboard")
    }

    const { data, error } = await supabase
        .from("financeiro_transacoes")
        .select("id, created_at, due_date, amount, type, status, description, origin_lead_id")
        .eq("beneficiary_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200)

    const transactions = (data ?? []) as FinancialTransaction[]

    const totalEntradas = transactions
        .filter((item) => item.amount > 0)
        .reduce((sum, item) => sum + item.amount, 0)
    const totalSaidas = transactions
        .filter((item) => item.amount < 0)
        .reduce((sum, item) => sum + Math.abs(item.amount), 0)
    const saldo = totalEntradas - totalSaidas

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Meu Financeiro</h1>
                <p className="text-sm text-muted-foreground">
                    Visualização somente leitura das suas transações financeiras.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Entradas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(totalEntradas)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Saídas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold text-rose-600">{formatCurrency(totalSaidas)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-2xl font-semibold ${saldo >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {formatCurrency(saldo)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Indicação</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {error ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-destructive">
                                    Erro ao carregar financeiro: {error.message}
                                </TableCell>
                            </TableRow>
                        ) : transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    Nenhuma transação encontrada.
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{formatDate(item.created_at)}</TableCell>
                                    <TableCell className="capitalize">{formatType(item.type)}</TableCell>
                                    <TableCell className="text-muted-foreground">{item.description || "—"}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {item.origin_lead_id ? item.origin_lead_id.slice(0, 8) : "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={item.status === "pago" ? "success" : "secondary"}>
                                            {item.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`text-right font-medium ${item.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                        {formatCurrency(item.amount)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
