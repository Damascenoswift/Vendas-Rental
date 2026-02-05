"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, FileText, Download, Loader2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { LeadInteractions } from "./interactions/lead-interactions"
import { EnergisaActions } from "./interactions/energisa-actions"
import { DocChecklist } from "./interactions/doc-checklist"
import { getProposalsForIndication } from "@/app/actions/proposals"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"




interface IndicationDetailsDialogProps {
    indicationId: string
    userId: string
    fallbackUserIds?: string[]
    initialData?: Record<string, unknown> | null
    brand?: "rental" | "dorata" | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    hideDefaultTrigger?: boolean
    trigger?: ReactNode
}

interface FileItem {
    name: string
    url: string | null
}

type ProposalSummary = {
    id: string
    created_at: string
    status: string | null
    total_value: number | null
    total_power: number | null
    calculation?: {
        commission?: {
            percent?: number
            value?: number
        }
    } | null
    seller?: {
        name?: string | null
        email?: string | null
    } | null
}

export function IndicationDetailsDialog({
    indicationId,
    userId,
    fallbackUserIds = [],
    initialData = null,
    brand,
    open,
    onOpenChange,
    hideDefaultTrigger = false,
    trigger,
}: IndicationDetailsDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [metadata, setMetadata] = useState<any>(null)
    const [files, setFiles] = useState<FileItem[]>([])
    const [proposals, setProposals] = useState<ProposalSummary[]>([])
    const [proposalError, setProposalError] = useState<string | null>(null)
    const [proposalLoading, setProposalLoading] = useState(false)
    const [hasLoadedProposals, setHasLoadedProposals] = useState(false)
    const { showToast } = useToast()
    const isControlled = typeof open === "boolean"
    const isOpen = isControlled ? open : internalOpen

    const resolvedBrand = useMemo(() => {
        if (brand) return brand
        const fromInitial = (initialData as any)?.marca
        return fromInitial === "rental" || fromInitial === "dorata" ? fromInitial : null
    }, [brand, initialData])

    const isDorata = resolvedBrand === "dorata"

    useEffect(() => {
        setMetadata(null)
        setFiles([])
        setProposals([])
        setProposalError(null)
        setHasLoadedProposals(false)
    }, [indicationId, userId])

    const toDisplayMetadata = (value: Record<string, unknown> | null) => {
        if (!value) return null
        const filteredEntries = Object.entries(value).filter(([, item]) => {
            if (item === null || item === undefined || item === "") return false
            if (typeof item === "object") return false
            return true
        })

        if (filteredEntries.length === 0) return null
        return Object.fromEntries(filteredEntries)
    }

    const listFilesForOwner = async (ownerId: string) => {
        const { data: fileList } = await supabase.storage
            .from("indicacoes")
            .list(`${ownerId}/${indicationId}`)

        if (!fileList) return []

        const validFiles = fileList.filter((file) => file.name !== "metadata.json")
        if (validFiles.length === 0) return []

        return Promise.all(
            validFiles.map(async (file) => {
                const { data } = await supabase.storage
                    .from("indicacoes")
                    .createSignedUrl(`${ownerId}/${indicationId}/${file.name}`, 3600)

                return {
                    name: file.name,
                    url: data?.signedUrl || null,
                }
            })
        )
    }

    const readMetadataForOwner = async (ownerId: string) => {
        const { data: metadataFile } = await supabase.storage
            .from("indicacoes")
            .download(`${ownerId}/${indicationId}/metadata.json`)

        if (!metadataFile) return null

        try {
            const text = await metadataFile.text()
            const parsed = JSON.parse(text)
            return parsed as Record<string, unknown>
        } catch {
            return null
        }
    }

    const fetchDetails = async () => {
        setIsLoading(true)
        try {
            const candidateOwnerIds = Array.from(
                new Set([userId, ...fallbackUserIds].map((value) => value?.trim()).filter(Boolean) as string[])
            )

            let finalMetadata: Record<string, unknown> | null = null
            let finalFiles: FileItem[] = []
            for (const ownerId of candidateOwnerIds) {
                const [ownerMetadata, ownerFiles] = await Promise.all([
                    readMetadataForOwner(ownerId),
                    listFilesForOwner(ownerId),
                ])

                if (ownerMetadata || ownerFiles.length > 0) {
                    finalMetadata = ownerMetadata
                    finalFiles = ownerFiles
                    break
                }
            }

            if (!finalMetadata && finalFiles.length === 0) {
                const { data: rootItems } = await supabase.storage
                    .from("indicacoes")
                    .list("", { limit: 1000 })

                const scannedOwnerIds = (rootItems ?? [])
                    .map((item) => item.name)
                    .filter((name) => name && !candidateOwnerIds.includes(name))

                for (const ownerId of scannedOwnerIds) {
                    const metadataFromScan = await readMetadataForOwner(ownerId)
                    if (metadataFromScan) {
                        finalMetadata = metadataFromScan
                        finalFiles = await listFilesForOwner(ownerId)
                        break
                    }
                }
            }

            setMetadata(toDisplayMetadata(finalMetadata ?? initialData))
            setFiles(finalFiles)
        } catch (error) {
            console.error("Error loading details:", error)
            showToast({
                title: "Erro ao carregar detalhes",
                description: "Não foi possível buscar as informações.",
                variant: "error"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleOpenChange = (open: boolean) => {
        if (!isControlled) {
            setInternalOpen(open)
        }
        onOpenChange?.(open)
    }

    const formatCurrency = (value?: number | null) => {
        if (typeof value !== "number") return "—"
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    }

    const formatDateTime = (value?: string | null) => {
        if (!value) return "—"
        try {
            return new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }).format(new Date(value))
        } catch {
            return "—"
        }
    }

    const proposalStatusLabels: Record<string, string> = {
        draft: "Rascunho",
        sent: "Enviado",
        accepted: "Aceito",
        rejected: "Rejeitado",
        expired: "Expirado",
    }

    useEffect(() => {
        if (!isOpen) return
        if (metadata || files.length > 0) return
        fetchDetails()
    }, [isOpen, indicationId, userId])

    useEffect(() => {
        if (!isOpen || !isDorata) return
        if (hasLoadedProposals || proposalLoading) return

        const loadProposals = async () => {
            setProposalLoading(true)
            const result = await getProposalsForIndication(indicationId)
            if (result?.error) {
                setProposalError(result.error)
                setProposals([])
            } else {
                setProposalError(null)
                setProposals((result as any).data ?? [])
            }
            setProposalLoading(false)
            setHasLoadedProposals(true)
        }

        void loadProposals()
    }, [isOpen, isDorata, indicationId, proposalLoading, hasLoadedProposals])

    const formatLabel = (key: string) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    }

    const [isCopied, setIsCopied] = useState(false)

    const handleCopy = () => {
        if (!metadata) return
        let text = ""
        Object.entries(metadata).forEach(([key, value]) => {
            if (typeof value === 'object' || !value) return
            text += `*${formatLabel(key)}:*\n${value}\n\n`
        })
        navigator.clipboard.writeText(text)
        setIsCopied(true)
        showToast({ title: "Copiado!", description: "Dados copiados." })
        setTimeout(() => setIsCopied(false), 2000)
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {!hideDefaultTrigger ? (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            <Eye className="h-4 w-4" />
                        </Button>
                    )}
                </DialogTrigger>
            ) : null}
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                    <DialogTitle>Detalhes da Indicação</DialogTitle>
                    {metadata && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            className="gap-2 mr-6" // margem para não colar no X
                        >
                            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {isCopied ? "Copiado" : "Copiar Dados"}
                        </Button>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="flex-1 py-4">
                        <Tabs defaultValue="dados" className="w-full">


                            <TabsList className={cn("grid w-full", isDorata ? "grid-cols-5" : "grid-cols-4")}>
                                <TabsTrigger value="dados">Dados & Docs</TabsTrigger>
                                {isDorata ? <TabsTrigger value="orcamento">Orçamento</TabsTrigger> : null}
                                <TabsTrigger value="arquivos">Arquivos ({files.length})</TabsTrigger>
                                <TabsTrigger value="energisa">Energisa</TabsTrigger>
                                <TabsTrigger value="atividades">Atividades & Chat</TabsTrigger>
                            </TabsList>

                            <TabsContent value="dados" className="space-y-4 mt-4">
                                <DocChecklist indicacaoId={indicationId} />
                                {/* ... metadata details ... */}
                                {metadata ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
                                        {Object.entries(metadata).map(([key, value]) => {
                                            if (typeof value === 'object' || !value) return null
                                            return (
                                                <div key={key} className="space-y-1 border-b pb-2">
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                        {formatLabel(key)}
                                                    </span>
                                                    <p className="text-sm font-medium break-words">
                                                        {String(value)}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        Nenhum dado adicional encontrado.
                                    </div>
                                )}
                            </TabsContent>

                            {isDorata ? (
                                <TabsContent value="orcamento" className="space-y-4 mt-4">
                                    {proposalLoading ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        </div>
                                    ) : proposalError ? (
                                        <div className="text-sm text-destructive">{proposalError}</div>
                                    ) : proposals.length === 0 ? (
                                        <div className="text-center py-6 text-muted-foreground">
                                            Nenhum orçamento encontrado para esta indicação.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {proposals.map((proposal) => {
                                                const commissionValue = proposal.calculation?.commission?.value
                                                const commissionPercent = proposal.calculation?.commission?.percent
                                                const statusLabel = proposal.status
                                                    ? proposalStatusLabels[proposal.status] ?? proposal.status
                                                    : "—"

                                                return (
                                                    <div key={proposal.id} className="rounded-lg border p-4 space-y-2">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-semibold">
                                                                    Orçamento #{proposal.id.slice(0, 8)}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Criado em {formatDateTime(proposal.created_at)}
                                                                </p>
                                                            </div>
                                                            <Badge variant="secondary">{statusLabel}</Badge>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Valor total</p>
                                                                <p className="font-medium">{formatCurrency(proposal.total_value)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Potência total</p>
                                                                <p className="font-medium">
                                                                    {typeof proposal.total_power === "number"
                                                                        ? `${proposal.total_power.toFixed(2)} kWp`
                                                                        : "—"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Comissão</p>
                                                                <p className="font-medium">
                                                                    {commissionValue
                                                                        ? `${formatCurrency(commissionValue)} (${((commissionPercent ?? 0) * 100).toFixed(1)}%)`
                                                                        : "—"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Vendedor: {proposal.seller?.name || proposal.seller?.email || "Sistema"}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </TabsContent>
                            ) : null}

                            <TabsContent value="arquivos" className="mt-4">
                                {files.length > 0 ? (
                                    <div className="grid gap-2">
                                        {files.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-5 w-5 text-blue-500" />
                                                    <span className="text-sm font-medium">{file.name}</span>
                                                </div>
                                                {file.url ? (
                                                    <Button size="sm" variant="outline" asChild>
                                                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                                                            <Download className="h-4 w-4" />
                                                            Baixar
                                                        </a>
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-red-500">Erro no link</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        Nenhum arquivo anexado.
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="energisa" className="mt-4 h-full">
                                <EnergisaActions indicacaoId={indicationId} />
                            </TabsContent>

                            <TabsContent value="atividades" className="mt-4 h-full">
                                <LeadInteractions indicacaoId={indicationId} />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </DialogContent>
        </Dialog >
    )
}
