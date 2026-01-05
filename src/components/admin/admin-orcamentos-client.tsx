"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileText, ExternalLink, Loader2 } from "lucide-react"

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
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import type { Database } from "@/types/database"

type Orcamento = Database["public"]["Tables"]["orcamentos"]["Row"] & {
    users: {
        name: string | null
        email: string
    } | null
}

interface AdminOrcamentosClientProps {
    initialOrcamentos: Orcamento[]
}

export function AdminOrcamentosClient({ initialOrcamentos }: AdminOrcamentosClientProps) {
    const [orcamentos, setOrcamentos] = useState<Orcamento[]>(initialOrcamentos)
    const { showToast } = useToast()
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const handleStatusChange = async (id: string, newStatus: "VISUALIZADO" | "RESPONDIDO") => {
        setLoadingId(id)
        try {
            const { error } = await supabase
                .from("orcamentos")
                .update({ status: newStatus })
                .eq("id", id)

            if (error) throw error

            setOrcamentos((prev) =>
                prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
            )
            showToast({ variant: "success", title: "Status atualizado" })
        } catch (error) {
            console.error(error)
            showToast({ variant: "error", title: "Erro ao atualizar status" })
        } finally {
            setLoadingId(null)
        }
    }

    const formatCurrency = (value: number | null) => {
        if (value === null || value === undefined) return "—"
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    }

    return (
        <div className="rounded-md border bg-background">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Gasto Mensal</TableHead>
                        <TableHead>B-Optante</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {orcamentos.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                Nenhum orçamento encontrado.
                            </TableCell>
                        </TableRow>
                    ) : orcamentos.map((orcamento) => (
                        <TableRow key={orcamento.id}>
                            <TableCell className="text-muted-foreground">
                                {format(new Date(orcamento.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-medium">{orcamento.cliente_nome}</TableCell>
                            <TableCell>{formatCurrency(orcamento.cliente_gasto_mensal)}</TableCell>
                            <TableCell>
                                {orcamento.is_b_optante ? (
                                    <Badge variant="secondary">Sim</Badge>
                                ) : (
                                    <span className="text-muted-foreground text-sm">Não</span>
                                )}
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="text-sm">{orcamento.users?.name || "Sem nome"}</span>
                                    <span className="text-xs text-muted-foreground">{orcamento.users?.email}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge
                                    variant={
                                        orcamento.status === "PENDENTE"
                                            ? "default" // or generic
                                            : orcamento.status === "VISUALIZADO"
                                                ? "outline"
                                                : "secondary"
                                    }
                                    className={
                                        orcamento.status === 'PENDENTE' ? 'bg-yellow-500 hover:bg-yellow-600' :
                                            orcamento.status === 'VISUALIZADO' ? 'bg-blue-500 hover:bg-blue-600 text-white' :
                                                'bg-green-600 hover:bg-green-700 text-white'
                                    }
                                >
                                    {orcamento.status}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {orcamento.conta_energia_url ? (
                                    <a
                                        href={orcamento.conta_energia_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                                    >
                                        <FileText className="h-4 w-4" />
                                        Abrir
                                    </a>
                                ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    {orcamento.status === "PENDENTE" && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleStatusChange(orcamento.id, "VISUALIZADO")}
                                            disabled={loadingId === orcamento.id}
                                        >
                                            {loadingId === orcamento.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Marcar Visualizado"}
                                        </Button>
                                    )}
                                    {orcamento.status !== "RESPONDIDO" && (
                                        <Button
                                            size="sm"
                                            variant="default" // primary
                                            onClick={() => handleStatusChange(orcamento.id, "RESPONDIDO")}
                                            disabled={loadingId === orcamento.id}
                                        >
                                            {loadingId === orcamento.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Concluir"}
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
