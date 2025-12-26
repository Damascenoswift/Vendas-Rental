import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Zap, Plus } from "lucide-react"
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

export const dynamic = "force-dynamic"

export default async function ProducaoPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: producoes, error } = await supabase
        .from("historico_producao")
        .select(`
            id,
            mes_ano,
            kwh_gerado,
            usina:usinas(nome)
        `)
        .order("mes_ano", { ascending: false })

    if (error) {
        return <div className="p-8">Erro ao carregar: {error.message}</div>
    }

    // Manual typing for joined data
    const list = (producoes as any[]) || []

    return (
        <div className="max-w-5xl mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Histórico de Produção
                </h2>
                <Link href="/admin/energia/producao/novo">
                    <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Registrar Produção
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Mês/Ano</TableHead>
                            <TableHead>Usina</TableHead>
                            <TableHead>Geração (kWh)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {list.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                    Nenhuma produção registrada.
                                </TableCell>
                            </TableRow>
                        ) : list.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium capitalize">
                                    {format(new Date(item.mes_ano), 'MMMM yyyy', { locale: ptBR })}
                                </TableCell>
                                <TableCell>{item.usina?.nome || 'Usina desconhecida'}</TableCell>
                                <TableCell>{item.kwh_gerado.toLocaleString('pt-BR')} kWh</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
