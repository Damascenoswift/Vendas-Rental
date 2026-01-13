"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { importConsumerUnits } from "@/services/import-service"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileSpice, Loader2 } from "lucide-react"

export default function ImportPage() {
    const [file, setFile] = useState<File | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const handleUpload = async () => {
        if (!file) {
            toast({ title: "Erro", description: "Selecione um arquivo.", variant: "destructive" })
            return
        }

        setIsLoading(true)
        const formData = new FormData()
        formData.append('file', file)

        const result = await importConsumerUnits(formData)

        if (result.success) {
            toast({
                title: "Sucesso!",
                description: `${result.count} registro(s) importado(s).`,
                variant: "success" // Or default if success variant not in toaster
            })
            setFile(null)
            // Reset input?
        } else {
            toast({
                title: "Erro na Importação",
                description: result.error,
                variant: "destructive"
            })
        }
        setIsLoading(false)
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Importação de Dados</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Importar Unidades Consumidoras</CardTitle>
                        <CardDescription>
                            Faça upload da planilha Excel (.xlsx) contendo os dados das unidades.
                            <br />
                            Certifique-se que o cabeçalho esteja na primeira linha.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Input
                                id="excel-file"
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                            />
                        </div>

                        {file && (
                            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                                <FileSpice className="h-4 w-4" />
                                {file.name} ({(file.size / 1024).toFixed(2)} KB)
                            </div>
                        )}

                        <Button onClick={handleUpload} disabled={isLoading || !file}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Importando...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Iniciar Importação
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
