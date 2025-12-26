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
import { format } from "date-fns"

export const dynamic = "force-dynamic"

export default async function MeusClientesPage() {
    const supabase = await createClient()

    // RLS: "Investor view own allocations" policy ensures filter
    const { data: alocacoes } = await supabase
        .from("alocacoes_clientes")
        .select(`
            id,
            percentual_alocado,
            quantidade_kwh_alocado,
            data_inicio,
            status,
            usina:usinas(nome),
            cliente:indicacoes(nome, cidade, estado)
        `)
        .eq("status", "ATIVO")
        .order("created_at", { ascending: false })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Meus Clientes</h1>
                <p className="text-muted-foreground">Unidades consumidoras utilizando energia de suas usinas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Alocações Ativas</CardTitle>
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
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(!alocacoes || alocacoes.length === 0) ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                        Nenhum cliente alocado no momento.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                alocacoes.map((item: any) => (
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
                                            <Badge className="bg-green-600">
                                                {item.status}
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
