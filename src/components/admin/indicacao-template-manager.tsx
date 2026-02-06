"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { createIndicationTemplate } from "@/app/actions/indicacao-templates"

type Vendor = {
  id: string
  name?: string | null
  email?: string | null
}

type Template = {
  id: string
  name: string
  vendedor_id: string
  created_at: string
  base_payload?: any
}

type Props = {
  initialTemplates: Template[]
  vendors: Vendor[]
  currentUserId: string
}

export function IndicationTemplateManager({ initialTemplates, vendors, currentUserId }: Props) {
  const { showToast } = useToast()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: "",
    vendedor_id: currentUserId,
    cnpj: "",
    email: "",
    telefone: "",
    nome_empresa: "",
    representante_legal: "",
    cpf_representante: "",
    rg_representante: "",
  })

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = () => {
    if (!form.name || !form.vendedor_id || !form.cnpj || !form.email || !form.telefone) {
      showToast({
        variant: "error",
        title: "Campos obrigatórios",
        description: "Preencha nome, vendedor, CNPJ, email e telefone.",
      })
      return
    }

    startTransition(async () => {
      const result = await createIndicationTemplate(form)
      if (!result.success) {
        const message = result.message || "Não foi possível criar o template."
        showToast({ variant: "error", title: "Erro", description: message })
        return
      }
      showToast({ variant: "success", title: "Template criado", description: "Você já pode importar as UCs." })
      setForm({
        name: "",
        vendedor_id: currentUserId,
        cnpj: "",
        email: "",
        telefone: "",
        nome_empresa: "",
        representante_legal: "",
        cpf_representante: "",
        rg_representante: "",
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo Template</CardTitle>
          <CardDescription>
            Salve os dados fixos do PJ para reutilizar em cadastros em massa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome do Template</label>
              <Input
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Ex: Empresa XPTO - Rental"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Vendedor</label>
              <Select
                value={form.vendedor_id}
                onValueChange={(value) => handleChange("vendedor_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name || vendor.email || vendor.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">CNPJ</label>
              <Input
                value={form.cnpj}
                onChange={(e) => handleChange("cnpj", e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="financeiro@empresa.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Telefone</label>
              <Input
                value={form.telefone}
                onChange={(e) => handleChange("telefone", e.target.value)}
                placeholder="(99) 99999-9999"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Razão Social (opcional)</label>
              <Input
                value={form.nome_empresa}
                onChange={(e) => handleChange("nome_empresa", e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Representante Legal (opcional)</label>
              <Input
                value={form.representante_legal}
                onChange={(e) => handleChange("representante_legal", e.target.value)}
                placeholder="Nome do representante"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">CPF Representante (opcional)</label>
              <Input
                value={form.cpf_representante}
                onChange={(e) => handleChange("cpf_representante", e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">RG Representante (opcional)</label>
              <Input
                value={form.rg_representante}
                onChange={(e) => handleChange("rg_representante", e.target.value)}
                placeholder="MG-00.000.000"
              />
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar Template"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meus Templates</CardTitle>
          <CardDescription>Abra um template para importar as UCs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {initialTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum template criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {initialTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-muted-foreground text-xs">
                      Criado em {new Date(template.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/admin/indicacoes/templates/${template.id}`}>Abrir</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
