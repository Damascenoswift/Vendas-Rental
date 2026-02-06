"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { generateIndicacoesFromTemplate, importTemplateItemsFromCsv } from "@/app/actions/indicacao-templates"

type Template = {
  id: string
  name: string
  vendedor_id: string
  base_payload?: any
}

type Item = {
  id: string
  codigo_instalacao: string
  codigo_cliente: string | null
  unidade_consumidora: string | null
  status: string
  indicacao_id: string | null
  error_message: string | null
  created_at: string
}

type Vendor = {
  id: string
  name?: string | null
  email?: string | null
}

type Props = {
  template: Template
  items: Item[]
  vendor?: Vendor | null
}

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CREATED: "bg-emerald-100 text-emerald-700",
  ERROR: "bg-rose-100 text-rose-700",
}

export function IndicationTemplateItems({ template, items, vendor }: Props) {
  const { showToast } = useToast()
  const router = useRouter()
  const [rawCsv, setRawCsv] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isGenerating, startGenerating] = useTransition()
  const [lastErrors, setLastErrors] = useState<Array<{ line: number; reason: string; codigo_instalacao?: string | null }>>([])

  const handleImport = () => {
    if (!rawCsv.trim()) {
      showToast({ variant: "error", title: "CSV vazio", description: "Cole os dados do CSV no campo." })
      return
    }

    startTransition(async () => {
      const result = await importTemplateItemsFromCsv({
        templateId: template.id,
        rawCsv,
      })
      if (!result.success) {
        showToast({ variant: "error", title: "Erro ao importar", description: result.message })
        if (result.errors) {
          setLastErrors(result.errors.slice(0, 5))
        }
        return
      }

      setRawCsv("")
      setLastErrors(result.errors?.slice(0, 5) ?? [])
      showToast({
        variant: "success",
        title: "Importação concluída",
        description: `${result.inserted} item(ns) inserido(s). ${result.skipped ? `${result.skipped} ignorado(s).` : ""}`,
      })
      router.refresh()
    })
  }

  const handleGenerate = () => {
    const confirmed = confirm("Gerar indicações para todos os itens pendentes? Isso cria tarefas e CRM automaticamente.")
    if (!confirmed) return

    startGenerating(async () => {
      const result = await generateIndicacoesFromTemplate(template.id)
      if (!result.success) {
        showToast({ variant: "error", title: "Erro ao gerar", description: result.message })
        return
      }
      showToast({
        variant: "success",
        title: "Geração concluída",
        description: `${result.created} criada(s), ${result.skipped} ignorada(s), ${result.failed} com erro.`,
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{template.name}</CardTitle>
          <CardDescription>
            Vendedor: {vendor?.name || vendor?.email || template.vendedor_id}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">Modelo CSV</div>
            <div className="text-muted-foreground">
              Cabeçalho obrigatório. Use ponto e vírgula para separar campos.
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-xs">
{`codigo_instalacao;codigo_cliente;unidade_consumidora
1234567890;UC-001;Rua Exemplo, 100 - Centro - Cidade/UF
1234567891;UC-002;Av. Principal, 200 - Bairro - Cidade/UF`}
            </pre>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">CSV</label>
            <Textarea
              value={rawCsv}
              onChange={(e) => setRawCsv(e.target.value)}
              rows={8}
              placeholder="Cole aqui o CSV com cabeçalho..."
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={isPending}>
              {isPending ? "Importando..." : "Importar UCs"}
            </Button>
            <Button variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Gerando..." : "Gerar Indicações"}
            </Button>
          </div>

          {lastErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="font-medium text-amber-900">Erros recentes</div>
              <ul className="mt-2 space-y-1 text-amber-800">
                {lastErrors.map((err, idx) => (
                  <li key={`${err.line}-${idx}`}>
                    Linha {err.line}: {err.reason}
                    {err.codigo_instalacao ? ` (Código: ${err.codigo_instalacao})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens do Template</CardTitle>
          <CardDescription>
            Itens pendentes viram indicações. Os códigos duplicados ficam com status de erro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item importado ainda.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[160px_160px_1fr_120px_1fr]"
                >
                  <div className="font-medium">{item.codigo_instalacao}</div>
                  <div>{item.codigo_cliente || "-"}</div>
                  <div className="truncate" title={item.unidade_consumidora || ""}>
                    {item.unidade_consumidora || "-"}
                  </div>
                  <div>
                    <Badge className={statusStyles[item.status] || "bg-slate-100 text-slate-700"}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.indicacao_id ? `Indicação: ${item.indicacao_id.slice(0, 8)}` : item.error_message || ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
