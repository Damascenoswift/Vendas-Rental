"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { importContacts } from "@/services/contacts-service"
import { FileText, Loader2, Upload, X } from "lucide-react"

export function ContactsImportCard() {
    const [csvText, setCsvText] = useState("")
    const [source, setSource] = useState("importacao_csv")
    const [fileName, setFileName] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const { showToast } = useToast()

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            setCsvText(String(reader.result ?? ""))
            setFileName(file.name)
        }
        reader.readAsText(file)
    }

    const handleImport = async () => {
        if (!csvText.trim()) {
            showToast({ variant: "error", title: "Erro", description: "Cole ou envie um CSV válido." })
            return
        }

        setIsLoading(true)
        const result = await importContacts({
            rawCsv: csvText,
            source: source.trim() || undefined,
        })
        setIsLoading(false)

        if (result.success) {
            showToast({
                variant: "success",
                title: "Importação concluída",
                description: `${result.imported} contato(s) importado(s).${result.skipped ? ` ${result.skipped} ignorado(s).` : ""}`,
            })
            setJsonText("")
            setFileName(null)
        } else {
            showToast({ variant: "error", title: "Erro na importação", description: result.error })
        }
    }

    const handleClear = () => {
        setCsvText("")
        setFileName(null)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Importar contatos (CSV)</CardTitle>
                <CardDescription>
                    Cole o CSV exportado ou faça upload de um arquivo .csv com os contatos.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Origem</label>
                    <Input
                        value={source}
                        onChange={(event) => setSource(event.target.value)}
                        placeholder="Ex: crm_externo"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Arquivo CSV</label>
                    <Input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
                </div>

                {fileName && (
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <FileText className="h-4 w-4" />
                        <span>{fileName}</span>
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium">CSV</label>
                    <Textarea
                        value={csvText}
                        onChange={(event) => setCsvText(event.target.value)}
                        rows={10}
                        placeholder="Ex: id,firstname,lastname,email,whatsapp"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleImport} disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importando...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Importar contatos
                            </>
                        )}
                    </Button>
                    <Button variant="outline" onClick={handleClear} disabled={isLoading}>
                        <X className="mr-2 h-4 w-4" />
                        Limpar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
