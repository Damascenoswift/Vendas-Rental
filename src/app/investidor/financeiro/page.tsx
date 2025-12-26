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

export const dynamic = "force-dynamic"

export default async function FinanceiroInvestorPage() {
    const supabase = await createClient()

    // RLS ensures only faturas from my usinas are returned
    const { data: faturas } = await supabase
        .from("faturas_conciliacao")
        .select(`
            id,
            mes_ano,
            valor_fatura,
            kwh_compensado,
            status_pagamento,
            usina:usinas(nome),
            cliente:indicacoes(nome)
        `)
        .order("mes_ano", { ascending: false })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Relatório Financeiro</h1>
                <p className="text-muted-foreground">Histórico de faturas geradas e status de recebimento.</p>
            </div>

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
                                <TableHead>Cliente (Unidade)</TableHead>
                                <TableHead>Energia (kWh)</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(!faturas || faturas.length === 0) ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                        Nenhum registro financeiro encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                faturas.map((item: any) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="capitalize">
                                            {format(new Date(item.mes_ano), 'MMMM yyyy', { locale: ptBR })}
                                        </TableCell>
                                        <TableCell>{item.usina?.nome}</TableCell>
                                        <TableCell>{item.cliente?.nome}</TableCell>
                                        <TableCell>{item.kwh_compensado} kWh</TableCell>
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
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
