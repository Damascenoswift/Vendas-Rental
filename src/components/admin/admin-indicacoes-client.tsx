"use client"

import { useState, useMemo } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { IndicationStatusSelect } from "@/components/admin/indication-status-select"
import { IndicationFlags } from "@/components/admin/indication-flags"
import { IndicationFillButton } from "@/components/admin/indication-fill-button"
import { IndicationValueEdit } from "@/components/admin/indication-value-edit"
import { IndicationDetailsDialog } from "@/components/admin/indication-details-dialog"
import { IndicationsChart } from "@/components/admin/indications-chart"
import { IndicationsFilter } from "@/components/admin/indications-filter"

interface AdminIndicacoesClientProps {
    initialIndicacoes: any[]
}

export function AdminIndicacoesClient({ initialIndicacoes }: AdminIndicacoesClientProps) {
    const [indicacoes, setIndicacoes] = useState(initialIndicacoes)
    const [selectedVendor, setSelectedVendor] = useState<string | "all">("all")
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")

    // Extract unique vendors
    const vendors = useMemo(() => {
        const uniqueVendors = new Set<string>()
        initialIndicacoes.forEach(ind => {
            const vendorName = (ind.users as any)?.name || (ind.users as any)?.email
            if (vendorName) uniqueVendors.add(vendorName)
        })
        return Array.from(uniqueVendors).sort()
    }, [initialIndicacoes])

    // Filter and Sort
    const filteredIndicacoes = useMemo(() => {
        let result = [...initialIndicacoes]

        // Filter by Vendor
        if (selectedVendor !== "all") {
            result = result.filter(ind => {
                const vendorName = (ind.users as any)?.name || (ind.users as any)?.email
                return vendorName === selectedVendor
            })
        }

        // Sort
        result.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime()
            const dateB = new Date(b.created_at).getTime()
            return sortOrder === "newest" ? dateB - dateA : dateA - dateB
        })

        return result
    }, [initialIndicacoes, selectedVendor, sortOrder])

    const handleClearFilters = () => {
        setSelectedVendor("all")
        setSortOrder("newest")
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <IndicationsFilter
                        vendors={vendors}
                        selectedVendor={selectedVendor}
                        sortOrder={sortOrder}
                        onVendorChange={setSelectedVendor}
                        onSortChange={setSortOrder}
                        onClearFilters={handleClearFilters}
                    />
                </div>
                <div>
                    <IndicationsChart data={filteredIndicacoes} />
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor Compensado</TableHead>
                            <TableHead>Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredIndicacoes.map((ind) => {
                            const vendedorInfo = (ind.users as any)?.name || (ind.users as any)?.email || ind.user_id

                            return (
                                <TableRow key={ind.id}>
                                    <TableCell>
                                        {new Intl.DateTimeFormat("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        }).format(new Date(ind.created_at))}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={ind.marca === "rental" ? "default" : "secondary"}>
                                            {ind.marca.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{ind.nome}</span>
                                            <span className="text-xs text-muted-foreground">{ind.email}</span>
                                            <span className="text-xs text-muted-foreground">{ind.telefone}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={vendedorInfo}>
                                        {vendedorInfo}
                                    </TableCell>
                                    <TableCell>
                                        <div className="w-[180px]">
                                            <IndicationStatusSelect id={ind.id} initialStatus={ind.status} />
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <IndicationValueEdit id={ind.id} initialValue={ind.valor} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <IndicationDetailsDialog indicationId={ind.id} userId={ind.user_id} />
                                            <IndicationFlags
                                                id={ind.id}
                                                assinadaEm={(ind as any).assinada_em ?? null}
                                                compensadaEm={(ind as any).compensada_em ?? null}
                                            />
                                            <IndicationFillButton
                                                indication={{
                                                    tipo: ind.tipo,
                                                    nome: ind.nome,
                                                    email: ind.email,
                                                    telefone: ind.telefone,
                                                    documento: ind.documento,
                                                }}
                                                vendedorName={vendedorInfo}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {filteredIndicacoes.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    Nenhuma indicação encontrada.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
