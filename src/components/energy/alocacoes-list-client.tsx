"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Plus } from "lucide-react"
import Link from "next/link"
import { UserBadge } from "@/components/ui/user-badge"

interface Alocacao {
    id: string
    percentual_alocado?: number
    quantidade_kwh_alocado?: number
    data_inicio: string
    status: string
    usina: { nome: string } | null
    uc: {
        codigo_uc_fatura?: string | null
        tipo_uc?: string | null
        cliente?: { nome?: string | null } | null
    } | null
    created_at?: string
    creator?: { id: string; name: string; email: string } | null
}

interface AlocacoesListClientProps {
    initialAlocacoes: Alocacao[]
}

export function AlocacoesListClient({ initialAlocacoes }: AlocacoesListClientProps) {
    const [alocacoes] = useState(initialAlocacoes)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Alocações</h1>
                    <p className="text-muted-foreground">
                        Gerencie a distribuição de energia entre usinas e clientes.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/admin/energia/alocacoes/novo">
                        <Plus className="mr-2 h-4 w-4" /> Nova Alocação
                    </Link>
                </Button>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Usina</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>UC</TableHead>
                            <TableHead>Alocação</TableHead>
                            <TableHead>Início</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px]">Auditoria</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {alocacoes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    Nenhuma alocação encontrada.
                                </TableCell>
                            </TableRow>
                        ) : (
                            alocacoes.map((alocacao) => (
                                <TableRow key={alocacao.id}>
                                    <TableCell className="font-medium">
                                        {alocacao.usina?.nome || "—"}
                                    </TableCell>
                                    <TableCell>{alocacao.uc?.cliente?.nome || "—"}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {alocacao.uc?.codigo_uc_fatura || "—"}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {alocacao.uc?.tipo_uc || "—"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span>
                                                {alocacao.percentual_alocado
                                                    ? `${alocacao.percentual_alocado}%`
                                                    : "—"}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {alocacao.quantidade_kwh_alocado} kWh
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(alocacao.data_inicio).toLocaleDateString("pt-BR")}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                alocacao.status === "ATIVO"
                                                    ? "success" // Assuming you have a success variant or similar
                                                    : "secondary"
                                            }
                                            className={
                                                alocacao.status === "ATIVO"
                                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                                    : ""
                                            }
                                        >
                                            {alocacao.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {alocacao.creator && (
                                                <UserBadge
                                                    name={alocacao.creator.name}
                                                    email={alocacao.creator.email}
                                                />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>Editar</DropdownMenuItem>
                                                <DropdownMenuItem className="text-red-600">
                                                    Encerrar Contrato
                                                </DropdownMenuItem>
                                                {/* Add more actions */}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
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
