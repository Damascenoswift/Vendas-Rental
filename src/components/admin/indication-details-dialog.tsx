"use client"

import { useEffect, useState } from "react"
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
import type { ReactNode } from "react"




interface IndicationDetailsDialogProps {
    indicationId: string
    userId: string
    fallbackUserIds?: string[]
    initialData?: Record<string, unknown> | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    hideDefaultTrigger?: boolean
    trigger?: ReactNode
}

interface FileItem {
    name: string
    url: string | null
}

export function IndicationDetailsDialog({
    indicationId,
    userId,
    fallbackUserIds = [],
    initialData = null,
    open,
    onOpenChange,
    hideDefaultTrigger = false,
    trigger,
}: IndicationDetailsDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [metadata, setMetadata] = useState<any>(null)
    const [files, setFiles] = useState<FileItem[]>([])
    const { showToast } = useToast()
    const isControlled = typeof open === "boolean"
    const isOpen = isControlled ? open : internalOpen

    useEffect(() => {
        setMetadata(null)
        setFiles([])
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

    useEffect(() => {
        if (!isOpen) return
        if (metadata || files.length > 0) return
        fetchDetails()
    }, [isOpen, indicationId, userId])

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


                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="dados">Dados & Docs</TabsTrigger>
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
