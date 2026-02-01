"use client"

import Link from "next/link"
import { useState } from "react"
import { Plus } from "lucide-react"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface UcRow {
    id: string
    codigo_uc_fatura: string
    codigo_instalacao?: string | null
    tipo_uc: string
    atendido_via_consorcio: boolean
    transferida_para_consorcio: boolean
    ativo: boolean
    created_at?: string
    cliente?: { nome?: string | null; email?: string | null } | null
}

interface UcsListClientProps {
    initialUcs: UcRow[]
}

export function UcsListClient({ initialUcs }: UcsListClientProps) {
    const [ucs] = useState(initialUcs)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Unidades Consumidoras</h1>
                    <p className="text-muted-foreground">
                        Gerencie as UCs vinculadas aos clientes e consórcio.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/admin/energia/ucs/novo">
                        <Plus className="mr-2 h-4 w-4" />
                        Nova UC
                    </Link>
                </Button>
            </div>

            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>UC</TableHead>
                            <TableHead>Instalação</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Consórcio</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ucs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Nenhuma UC cadastrada.
                                </TableCell>
                            </TableRow>
                        ) : (
                            ucs.map((uc) => (
                                <TableRow key={uc.id}>
                                    <TableCell className="font-medium">{uc.codigo_uc_fatura}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {uc.codigo_instalacao || "—"}
                                    </TableCell>
                                    <TableCell>
                                        {uc.cliente?.nome || uc.cliente?.email || "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="uppercase text-xs">
                                            {uc.tipo_uc}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {uc.atendido_via_consorcio ? "Atendido via consórcio" : "Direto"}
                                        {uc.transferida_para_consorcio ? " • Transferida" : ""}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            className={
                                                uc.ativo
                                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                                    : "bg-muted text-muted-foreground"
                                            }
                                        >
                                            {uc.ativo ? "ATIVA" : "INATIVA"}
                                        </Badge>
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
