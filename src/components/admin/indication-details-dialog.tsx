"use client"

import { useState } from "react"
import { Eye, FileText, Download, Loader2 } from "lucide-react"
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

interface IndicationDetailsDialogProps {
    indicationId: string
    userId: string
}

interface FileItem {
    name: string
    url: string | null
}

export function IndicationDetailsDialog({ indicationId, userId }: IndicationDetailsDialogProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [metadata, setMetadata] = useState<any>(null)
    const [files, setFiles] = useState<FileItem[]>([])
    const { showToast } = useToast()

    const fetchDetails = async () => {
        setIsLoading(true)
        try {
            console.log("🔍 Fetching details for:", { userId, indicationId })

            // 1. Fetch Metadata
            const path = `${userId}/${indicationId}/metadata.json`
            console.log("📂 Metadata path:", path)

            const { data: metaData, error: metaError } = await supabase.storage
                .from("indicacoes")
                .download(path)

            if (metaError) {
                console.error("Error fetching metadata:", metaError)
                // Don't throw, maybe only files exist
            } else if (metaData) {
                const text = await metaData.text()
                setMetadata(JSON.parse(text))
            }

            // 2. List Files
            const { data: fileList, error: listError } = await supabase.storage
                .from("indicacoes")
                .list(`${userId}/${indicationId}`)

            if (listError) throw listError

            if (fileList) {
                // Filter out metadata.json and map to signed URLs
                const validFiles = fileList.filter(f => f.name !== 'metadata.json')

                const filesWithUrls = await Promise.all(validFiles.map(async (f) => {
                    const { data } = await supabase.storage
                        .from("indicacoes")
                        .createSignedUrl(`${userId}/${indicationId}/${f.name}`, 3600) // 1 hour link

                    return {
                        name: f.name,
                        url: data?.signedUrl || null
                    }
                }))

                setFiles(filesWithUrls)
            }

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
        setIsOpen(open)
        if (open && !metadata && files.length === 0) {
            fetchDetails()
        }
    }

    const formatLabel = (key: string) => {
        // Simple formatter: camelCase to Title Case
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                    <Eye className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Detalhes da Indicação</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Tabs defaultValue="dados" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="dados">Dados do Formulário</TabsTrigger>
                            <TabsTrigger value="arquivos">Arquivos Anexados ({files.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="dados" className="mt-4">
                            {metadata ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    )
}
