"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, Eye, Plus, Factory } from "lucide-react"

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
import type { Database } from "@/types/database"

type Usina = Database["public"]["Tables"]["usinas"]["Row"]

interface UsinasListClientProps {
    initialUsinas: Usina[]
}

export function UsinasListClient({ initialUsinas }: UsinasListClientProps) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Factory className="h-5 w-5" />
                    Usinas
                </h2>
                <Link href="/admin/energia/usinas/novo">
                    <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Usina
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Capacidade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialUsinas.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                    Nenhuma usina cadastrada.
                                </TableCell>
                            </TableRow>
                        ) : initialUsinas.map((usina) => (
                            <TableRow key={usina.id}>
                                <TableCell className="font-medium">{usina.nome}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="uppercase text-xs">
                                        {usina.tipo}
                                    </Badge>
                                </TableCell>
                                <TableCell>{usina.capacidade_total} kWh</TableCell>
                                <TableCell>
                                    <Badge
                                        className={
                                            usina.status === 'ATIVA' ? 'bg-green-600 hover:bg-green-700' :
                                                usina.status === 'MANUTENCAO' ? 'bg-yellow-500 hover:bg-yellow-600' :
                                                    'bg-gray-500'
                                        }
                                    >
                                        {usina.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Link href={`/admin/energia/usinas/${usina.id}`}>
                                            <Button size="icon" variant="ghost" title="Detalhes">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
