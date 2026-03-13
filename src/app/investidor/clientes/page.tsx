import Link from "next/link"
import { format } from "date-fns"

import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type ClientesSearchParams = {
    usina?: string
    status?: string
}

type InvestorUsinaOption = {
    id: string
    nome: string
}

type InvestorAllocationRow = {
    id: string
    cliente_id: string
    usina_id: string
    percentual_alocado: number | null
    quantidade_kwh_alocado: number | null
    data_inicio: string
    status: "ATIVO" | "INATIVO"
    usina: { nome: string } | null
    cliente: { nome: string; cidade: string | null; estado: string | null } | null
}

type InvestorInvoiceRow = {
    id: string
    cliente_id: string
    usina_id: string
    mes_ano: string
    valor_fatura: number | null
    origem_integracao: "MANUAL" | "COGNI" | null
    boleto_url: string | null
    boleto_linha_digitavel: string | null
}

export const dynamic = "force-dynamic"

export default async function MeusClientesPage({
    searchParams,
}: {
    searchParams?: Promise<ClientesSearchParams>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const usinaFilter = resolvedSearchParams?.usina?.trim() || ""
    const statusFilter = resolvedSearchParams?.status?.trim() || "ATIVO"

    const supabase = await createClient()

    const { data: usinasData } = await supabase
        .from("usinas")
        .select("id, nome")
        .order("nome", { ascending: true })
    const usinas = (usinasData ?? []) as InvestorUsinaOption[]

    let alocacoesQuery = supabase
        .from("alocacoes_clientes")
        .select(`
            id,
            cliente_id,
            usina_id,
            percentual_alocado,
            quantidade_kwh_alocado,
            data_inicio,
            status,
            usina:usinas(nome),
            cliente:indicacoes(nome, cidade, estado)
        `)
        .order("created_at", { ascending: false })

    if (usinaFilter) {
        alocacoesQuery = alocacoesQuery.eq("usina_id", usinaFilter)
    }

    if (statusFilter && statusFilter !== "TODOS") {
        alocacoesQuery = alocacoesQuery.eq("status", statusFilter)
    }

    const { data: alocacoesData } = await alocacoesQuery
    const alocacoes = (alocacoesData ?? []) as InvestorAllocationRow[]

    const clienteIds = Array.from(new Set(alocacoes.map((item) => item.cliente_id).filter(Boolean)))
    const usinaIds = Array.from(new Set(alocacoes.map((item) => item.usina_id).filter(Boolean)))

    const latestInvoiceByPair = new Map<string, InvestorInvoiceRow>()

    if (clienteIds.length > 0 && usinaIds.length > 0) {
        const { data: faturas } = await supabase
            .from("faturas_conciliacao")
            .select("id, cliente_id, usina_id, mes_ano, valor_fatura, origem_integracao, boleto_url, boleto_linha_digitavel")
            .in("cliente_id", clienteIds)
            .in("usina_id", usinaIds)
            .order("mes_ano", { ascending: false })

        for (const fatura of (faturas ?? []) as InvestorInvoiceRow[]) {
            const key = `${fatura.usina_id}:${fatura.cliente_id}`
            if (!latestInvoiceByPair.has(key)) {
                latestInvoiceByPair.set(key, fatura)
            }
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Meus Clientes</h1>
                <p className="text-muted-foreground">Unidades consumidoras e último faturamento rastreado.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-3 md:grid-cols-3">
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
                            <option value="ATIVO">ATIVO</option>
                            <option value="INATIVO">INATIVO</option>
                            <option value="TODOS">TODOS</option>
                        </select>

                        <div className="flex gap-2">
                            <Button type="submit" size="sm">Aplicar</Button>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/investidor/clientes">Limpar</Link>
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Alocações</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Local</TableHead>
                                <TableHead>Usina</TableHead>
                                <TableHead>Alocação</TableHead>
                                <TableHead>Início</TableHead>
                                <TableHead>Última Fatura</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead>Boleto</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {alocacoes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                                        Nenhum cliente alocado no momento.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                alocacoes.map((item) => {
                                    const invoiceKey = `${item.usina_id}:${item.cliente_id}`
                                    const latestInvoice = latestInvoiceByPair.get(invoiceKey)

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.cliente?.nome}</TableCell>
                                            <TableCell>
                                                {item.cliente?.cidade ? `${item.cliente.cidade}/${item.cliente.estado}` : '-'}
                                            </TableCell>
                                            <TableCell>{item.usina?.nome}</TableCell>
                                            <TableCell>
                                                {item.percentual_alocado ? `${item.percentual_alocado}%` :
                                                    item.quantidade_kwh_alocado ? `${item.quantidade_kwh_alocado} kWh` : '-'}
                                            </TableCell>
                                            <TableCell>{format(new Date(item.data_inicio), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>
                                                {latestInvoice?.valor_fatura
                                                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(latestInvoice.valor_fatura)
                                                    : '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={latestInvoice?.origem_integracao === "COGNI" ? "default" : "secondary"}>
                                                    {latestInvoice?.origem_integracao || "MANUAL"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {latestInvoice?.boleto_url ? (
                                                    <a
                                                        href={latestInvoice.boleto_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        Abrir
                                                    </a>
                                                ) : latestInvoice?.boleto_linha_digitavel ? (
                                                    <span className="text-xs text-muted-foreground">Linha disponível</span>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={item.status === "ATIVO" ? "bg-green-600" : ""}>
                                                    {item.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
