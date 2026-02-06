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
import { Button } from "@/components/ui/button"
import { Trash2, FileText, Loader2 } from "lucide-react"
import { generateContractFromIndication } from "@/app/actions/contracts-generation"

import type { UserProfile, UserRole } from "@/lib/auth"

interface AdminIndicacoesClientProps {
    initialIndicacoes: any[]
    role?: UserRole
    department?: UserProfile['department'] | null
}

import { IndicationsKanban } from "@/components/admin/indications-kanban"
import { LayoutGrid, List } from "lucide-react"

// ... imports remain the same

export function AdminIndicacoesClient({ initialIndicacoes, role, department }: AdminIndicacoesClientProps) {
    const [indicacoes, setIndicacoes] = useState(initialIndicacoes)
    const [selectedVendor, setSelectedVendor] = useState<string | "all">("all")
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")
    const [view, setView] = useState<"list" | "kanban">("list")

    // ... (useMemos remain the same) 
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

    const canDelete =
        role === 'adm_mestre' ||
        role === 'adm_dorata' ||
        role === 'funcionario_n1' ||
        department === 'financeiro'

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex bg-muted p-1 rounded-lg">
                    <Button
                        variant={view === 'list' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setView('list')}
                        className="h-8 px-3"
                    >
                        <List className="mr-2 h-4 w-4" />
                        Lista
                    </Button>
                    <Button
                        variant={view === 'kanban' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setView('kanban')}
                        className="h-8 px-3"
                    >
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        Kanban
                    </Button>
                </div>
            </div>

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

            {view === 'kanban' ? (
                <div className="h-[calc(100vh-300px)] min-h-[500px]">
                    <IndicationsKanban items={filteredIndicacoes} />
                </div>
            ) : (
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
                                                <IndicationStatusSelect id={ind.id} initialStatus={ind.status} brand={ind.marca} />
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <IndicationValueEdit id={ind.id} initialValue={ind.valor} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <IndicationDetailsDialog
                                                    indicationId={ind.id}
                                                    userId={ind.user_id}
                                                    fallbackUserIds={[
                                                        (ind as any).created_by_supervisor_id,
                                                    ].filter(Boolean)}
                                                    initialData={ind}
                                                />
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
                                                {/* Contract Generation Button */}
                                                {(role === 'adm_mestre' || role === 'adm_dorata' || role === 'funcionario_n1' || role === 'funcionario_n2') && (
                                                    <GenerateContractButton indicationId={ind.id} />
                                                )}
                                                {canDelete && (
                                                    <DeleteIndicationButton id={ind.id} />
                                                )}
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
            )}
        </div>
    )
}

import { deleteIndication } from "@/app/actions/admin-indications"
import { useToast } from "@/hooks/use-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

function DeleteIndicationButton({ id }: { id: string }) {
    const { showToast } = useToast()
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteIndication(id)
            if (result.error) {
                showToast({
                    variant: "error",
                    title: "Erro ao excluir",
                    description: result.error,
                })
            } else {
                showToast({
                    variant: "success",
                    title: "Indicação excluída",
                    description: "A indicação foi removida com sucesso.",
                })
            }
        } catch (error) {
            showToast({
                variant: "error",
                title: "Erro inesperado",
                description: "Ocorreu um erro ao tentar excluir.",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Isso excluirá permanentemente a indicação.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                        {isDeleting ? "Excluindo..." : "Excluir"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function GenerateContractButton({ indicationId }: { indicationId: string }) {
    const { showToast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    const handleGenerate = async () => {
        setIsLoading(true)
        try {
            const result = await generateContractFromIndication(indicationId)
            if (result.success) {
                showToast({
                    variant: "success",
                    title: "Sucesso!",
                    description: "Contrato gerado. O download iniciará em breve.",
                })
                // Open URL in new tab
                // Open URL in new tab using anchor to key avoid popup blockers
                if (result.url) {
                    const link = document.createElement('a');
                    link.href = result.url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                showToast({
                    variant: "error",
                    title: "Erro",
                    description: result.message,
                })
            }
        } catch (error) {
            console.error(error)
            showToast({
                variant: "error",
                title: "Erro",
                description: "Falha ao solicitar geração.",
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={handleGenerate}
            disabled={isLoading}
            title="Gerar Contrato Automático"
        >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        </Button>
    )
}
