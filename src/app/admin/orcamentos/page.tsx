
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"
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

export default async function ProposalsPage() {
    const supabase = await createClient()

    // Fetch proposals with seller info
    // For MVP just fetch raw
    const { data: proposals } = await supabase
        .from('proposals')
        .select(`
            *,
            seller:users(name)
        `)
        .order('created_at', { ascending: false })

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Orçamentos</h2>
                <div className="flex items-center space-x-2">
                    <Link href="/admin/orcamentos/novo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo Orçamento
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!proposals || proposals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                    Nenhum orçamento encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            proposals.map((proposal) => (
                                <TableRow key={proposal.id}>
                                    <TableCell>{format(new Date(proposal.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                                    <TableCell>{proposal.seller?.name || 'Sistema'}</TableCell>
                                    <TableCell>{proposal.valid_until ? format(new Date(proposal.valid_until), 'dd/MM/yyyy') : '-'}</TableCell>
                                    <TableCell className="capitalize">{proposal.status}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {proposal.total_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
