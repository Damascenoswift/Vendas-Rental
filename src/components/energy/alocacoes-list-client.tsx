"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Users, Plus, Trash2 } from "lucide-react"

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

interface Alocacao {
    id: string
    usina: { nome: string } | null
    cliente: { nome: string } | null
    percentual_alocado: number | null
    quantidade_kwh_alocado: number | null
    data_inicio: string
    status: string
}

interface AlocacoesListClientProps {
    initialAlocacoes: Alocacao[]
}

export function AlocacoesListClient({ initialAlocacoes }: AlocacoesListClientProps) {
    // In a real app we might add delete functionality here using server actions or client-side supabase calls
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Alocações de Clientes
                </h2>
                <Link href="/admin/energia/alocacoes/novo">
                    <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Alocação
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Usina</TableHead>
                            <TableHead>Alocação</TableHead>
                            <TableHead>Início</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialAlocacoes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    Nenhuma alocação registrada.
                                </TableCell>
                            </TableRow>
                        ) : initialAlocacoes.map((alocacao) => (
                            <TableRow key={alocacao.id}>
                                <TableCell className="font-medium">{alocacao.cliente?.nome || 'Cliente Removido'}</TableCell>
                                <TableCell>{alocacao.usina?.nome || 'Usina Removida'}</TableCell>
                                <TableCell>
                                    {alocacao.percentual_alocado ? `${alocacao.percentual_alocado}%` :
                                        alocacao.quantidade_kwh_alocado ? `${alocacao.quantidade_kwh_alocado} kWh` : '-'}
                                </TableCell>
                                <TableCell>{format(new Date(alocacao.data_inicio), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>
                                    <Badge
                                        variant={alocacao.status === 'ATIVO' ? 'default' : 'secondary'}
                                        className={alocacao.status === 'ATIVO' ? 'bg-green-600' : ''}
                                    >
                                        {alocacao.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
