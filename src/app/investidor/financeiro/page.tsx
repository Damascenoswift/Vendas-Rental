import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type FinanceiroSearchParams = {
    usina?: string
    status?: string
    competencia?: string
}

type InvestorUsinaOption = {
    id: string
    nome: string
}

type InvestorFinanceiroRow = {
    id: string
    mes_ano: string
    valor_fatura: number | null
    kwh_compensado: number | null
    status_pagamento: "ABERTO" | "PAGO" | "ATRASADO" | "CANCELADO"
    origem_integracao: "MANUAL" | "COGNI" | null
    boleto_url: string | null
    boleto_linha_digitavel: string | null
    usina: Array<{ nome: string }> | null
    cliente: Array<{ nome: string }> | null
}

function normalizeCompetenciaFilter(raw?: string) {
    if (!raw) return null
    const value = raw.trim()
    if (!value) return null

    const match = value.match(/^(\d{4})-(\d{2})$/)
    if (!match) return null

    return `${match[1]}-${match[2]}-01`
}

export const dynamic = "force-dynamic"

export default async function FinanceiroInvestorPage({
    searchParams,
}: {
    searchParams?: Promise<FinanceiroSearchParams>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined

    const usinaFilter = resolvedSearchParams?.usina?.trim() || ""
    const statusFilter = resolvedSearchParams?.status?.trim() || ""
    const competenciaFilterRaw = resolvedSearchParams?.competencia?.trim() || ""
    const competenciaFilter = normalizeCompetenciaFilter(competenciaFilterRaw)

    const supabase = await createClient()

    const { data: usinasData } = await supabase
        .from("usinas")
        .select("id, nome")
        .order("nome", { ascending: true })
    const usinas = (usinasData ?? []) as InvestorUsinaOption[]

    let faturasQuery = supabase
        .from("faturas_conciliacao")
        .select(`
            id,
            mes_ano,
            valor_fatura,
            kwh_compensado,
            status_pagamento,
            origem_integracao,
            boleto_url,
            boleto_linha_digitavel,
            usina:usinas(nome),
            cliente:indicacoes(nome)
        `)
        .order("mes_ano", { ascending: false })

    if (usinaFilter) {
        faturasQuery = faturasQuery.eq("usina_id", usinaFilter)
    }

    if (statusFilter) {
        faturasQuery = faturasQuery.eq("status_pagamento", statusFilter)
    }

    if (competenciaFilter) {
        faturasQuery = faturasQuery.eq("mes_ano", competenciaFilter)
    }

    const { data: faturasData } = await faturasQuery
    const faturas = (faturasData ?? []) as InvestorFinanceiroRow[]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Relatório Financeiro</h1>
                <p className="text-muted-foreground">Histórico de faturas geradas, status e boletos.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-3 md:grid-cols-4">
                        <select
                            name="usina"
                            defaultValue={usinaFilter}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Todas as usinas</option>
                            {usinas.map((usina) => (
                                <option key={usina.id} value={usina.id}>
                                    {usina.nome}
                                </option>
                            ))}
                        </select>

                        <select
                            name="status"
                            defaultValue={statusFilter}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Todos os status</option>
                            <option value="ABERTO">ABERTO</option>
                            <option value="PAGO">PAGO</option>
                            <option value="ATRASADO">ATRASADO</option>
                            <option value="CANCELADO">CANCELADO</option>
                        </select>

                        <input
                            type="month"
                            name="competencia"
                            defaultValue={competenciaFilterRaw}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />

                        <div className="flex gap-2">
                            <Button type="submit" size="sm">Aplicar</Button>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/investidor/financeiro">Limpar</Link>
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Últimos Lançamentos</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Mês/Ano</TableHead>
                                <TableHead>Usina</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Energia</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead>Boleto</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {faturas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                                        Nenhum registro financeiro encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                faturas.map((item) => {
                                    const firstUsina = item.usina?.[0] ?? null
                                    const firstCliente = item.cliente?.[0] ?? null

                                    return (
                                    <TableRow key={item.id}>
                                        <TableCell className="capitalize">
                                            {format(new Date(item.mes_ano), 'MMMM yyyy', { locale: ptBR })}
                                        </TableCell>
                                        <TableCell>{firstUsina?.nome}</TableCell>
                                        <TableCell>{firstCliente?.nome}</TableCell>
                                        <TableCell>{item.kwh_compensado ? `${item.kwh_compensado} kWh` : "-"}</TableCell>
                                        <TableCell>
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_fatura || 0)}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    item.status_pagamento === 'PAGO' ? 'default' :
                                                        item.status_pagamento === 'ATRASADO' ? 'destructive' : 'secondary'
                                                }
                                                className={item.status_pagamento === 'PAGO' ? 'bg-green-600' : ''}
                                            >
                                                {item.status_pagamento}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={item.origem_integracao === "COGNI" ? "default" : "secondary"}>
                                                {item.origem_integracao || "MANUAL"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {item.boleto_url ? (
                                                <a
                                                    href={item.boleto_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    Abrir
                                                </a>
                                            ) : item.boleto_linha_digitavel ? (
                                                <span className="text-xs text-muted-foreground">Linha disponível</span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )})
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
