"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { importContacts } from "@/services/contacts-service"
import { FileText, Loader2, Upload, X } from "lucide-react"

export function ContactsImportCard() {
    const [jsonText, setJsonText] = useState("")
    const [source, setSource] = useState("importacao_json")
    const [fileName, setFileName] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const { showToast } = useToast()

    const preview = useMemo(() => {
        const trimmed = jsonText.trim()
        if (!trimmed) return null
        try {
            const parsed = JSON.parse(trimmed)
            const count = Array.isArray(parsed) ? parsed.length : 1
            return { count }
        } catch (error) {
            return { error: "JSON inválido. Verifique a formatação." }
        }
    }, [jsonText])

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = () => {
            setJsonText(String(reader.result ?? ""))
            setFileName(file.name)
        }
        reader.readAsText(file)
    }

    const handleImport = async () => {
        if (!jsonText.trim()) {
            showToast({ variant: "error", title: "Erro", description: "Cole ou envie um JSON válido." })
            return
        }

        if (preview?.error) {
            showToast({ variant: "error", title: "Erro", description: preview.error })
            return
        }

        setIsLoading(true)
        const result = await importContacts({
            rawJson: jsonText,
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
        setJsonText("")
        setFileName(null)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Importar contatos (JSON)</CardTitle>
                <CardDescription>
                    Cole o JSON exportado ou faça upload de um arquivo .json com os contatos.
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
                    <label className="text-sm font-medium">Arquivo JSON</label>
                    <Input type="file" accept=".json,application/json" onChange={handleFileChange} />
                </div>

                {fileName && (
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <FileText className="h-4 w-4" />
                        <span>{fileName}</span>
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium">JSON</label>
                    <Textarea
                        value={jsonText}
                        onChange={(event) => setJsonText(event.target.value)}
                        rows={10}
                        placeholder='Ex: [{"id": 1, "firstname": "João", "lastname": "Silva", "email": "joao@email.com"}]'
                    />
                </div>

                {preview?.count !== undefined && (
                    <div className="text-sm text-muted-foreground">
                        {preview.count} contato(s) detectado(s).
                    </div>
                )}
                {preview?.error && (
                    <div className="text-sm text-red-600">{preview.error}</div>
                )}

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
