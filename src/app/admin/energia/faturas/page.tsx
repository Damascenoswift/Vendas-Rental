import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, Plus } from "lucide-react"
import Link from "next/link"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserBadge } from "@/components/ui/user-badge"

export const dynamic = "force-dynamic"

export default async function FaturasPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: faturas, error } = await supabase
        .from("faturas_conciliacao")
        .select(`
            id,
            mes_ano,
            valor_fatura,
            kwh_compensado,
            status_pagamento,
            usina:usinas(nome),
            cliente:indicacoes(nome),
            creator:users!created_by(id, name, email)
        `)
        .order("mes_ano", { ascending: false })

    if (error) {
        return <div className="p-8">Erro ao carregar: {error.message}</div>
    }

    const list = (faturas as any[]) || []

    return (
        <div className="max-w-5xl mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Faturas e Conciliação
                </h2>
                <Link href="/admin/energia/faturas/novo">
                    <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Fatura
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Mês/Ano</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Usina</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Compensação</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[50px]">Auditoria</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    Nenhuma fatura registrada.
                                </TableCell>
                            </TableRow>
                        ) : list.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium capitalize">
                                    {format(new Date(item.mes_ano), 'MMMM yyyy', { locale: ptBR })}
                                </TableCell>
                                <TableCell>{item.cliente?.nome || 'Cliente removido'}</TableCell>
                                <TableCell>{item.usina?.nome || 'Usina removida'}</TableCell>
                                <TableCell>
                                    {item.valor_fatura ?
                                        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_fatura)
                                        : '-'}
                                </TableCell>
                                <TableCell>
                                    {item.kwh_compensado ? `${item.kwh_compensado.toLocaleString('pt-BR')} kWh` : '-'}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={
                                            item.status_pagamento === 'PAGO' ? 'default' :
                                                item.status_pagamento === 'ATRASADO' ? 'destructive' : 'secondary'
                                        }
                                        className={item.status_pagamento === 'PAGO' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    >
                                        {item.status_pagamento}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {item.creator && (
                                        <UserBadge
                                            name={item.creator.name}
                                            email={item.creator.email}
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
