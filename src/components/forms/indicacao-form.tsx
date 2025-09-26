"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  onlyDigits,
} from "@/lib/formatters"
import { useToast } from "@/hooks/use-toast"
import type { Brand } from "@/lib/auth"

const STORAGE_BUCKET = "indicacoes"

// =============================
// Zod Schemas (PF/PJ)
// =============================
const baseSchema = z.object({
  marca: z.enum(["rental", "dorata"]).default("rental"),
  tipoPessoa: z.enum(["PF", "PJ"]),
  codigoClienteEnergia: z.string().min(1, "Informe o código da conta"),
  nomeCliente: z.string().min(1, "Nome é obrigatório").optional(),
  emailCliente: z.string().email("Email inválido").optional(),
  telefoneCliente: z.string().min(10, "Telefone inválido").optional(),
  endereco: z.string().min(1, "Endereço é obrigatório").optional(),
  cidade: z.string().min(1, "Cidade é obrigatória").optional(),
  estado: z.string().min(2, "Estado é obrigatório").optional(),
  cep: z.string().min(8, "CEP inválido").optional(),
  consumoMedioKwh: z.coerce.number().positive().max(99999).optional(),
  valorContaEnergia: z.coerce.number().positive().optional(),
  vendedorId: z.string().min(1, "Vendedor obrigatório"),
  status: z.enum(["nova", "em_analise", "aprovada", "rejeitada"]).default("nova"),
})

const pfSchema = baseSchema.extend({
  tipoPessoa: z.literal("PF"),
  cpfCnpj: z.string().min(11, "CPF inválido"),
  rg: z.string().min(1, "RG é obrigatório"),
  whatsappSignatarioPF: z.string().min(10, "WhatsApp inválido"),
  telefoneCobrancaPF: z.string().min(10, "Telefone cobrança inválido"),
  emailBoletos: z.string().email("Email inválido"),
  dataVendaPF: z.coerce.date(),
  vendedorNomePF: z.string().min(1),
  vendedorTelefonePF: z.string().min(10),
  vendedorCPF: z.string().min(11),
  consumoMedioPF: z.coerce.number().positive().max(99999),
})

const pjSchema = baseSchema.extend({
  tipoPessoa: z.literal("PJ"),
  nomeEmpresa: z.string().min(1, "Razão social obrigatória"),
  cnpj: z.string().min(14, "CNPJ inválido"),
  cpfCnpj: z.string().min(14, "CNPJ inválido"),
  logradouro: z.string().min(1),
  numero: z.string().min(1),
  bairro: z.string().min(1),
  complemento: z.string().optional(),
  representanteLegal: z.string().min(1),
  cpfRepresentante: z.string().min(11),
  rgRepresentante: z.string().min(1),
  emailSignatario: z.string().email(),
  emailFatura: z.string().email(),
  telefoneCobranca: z.string().min(10),
  whatsappSignatario: z.string().min(10),
  codigoInstalacao: z.string().min(1),
  localizacaoUC: z.string().min(1),
  dataVenda: z.coerce.date(),
  vendedorNome: z.string().min(1),
  vendedorTelefone: z.string().min(10),
  vendedorCNPJ: z.string().min(14),
})

const formSchema = z.discriminatedUnion("tipoPessoa", [pfSchema, pjSchema])

export type IndicacaoFormValues = z.infer<typeof formSchema>

// =============================
// Props
// =============================
export type IndicacaoFormProps = {
  userId: string
  allowedBrands: Brand[]
  onCreated?: () => Promise<void> | void
}

export function IndicacaoForm({ userId, allowedBrands, onCreated }: IndicacaoFormProps) {
  const { showToast } = useToast()

  const [filesPF, setFilesPF] = useState<{ faturaEnergia: File | null; documentoComFoto: File | null }>({
    faturaEnergia: null,
    documentoComFoto: null,
  })
  const [filesPJ, setFilesPJ] = useState<{
    faturaEnergia: File | null
    documentoComFoto: File | null
    contratoSocial: File | null
    cartaoCNPJ: File | null
    documentoRepresentante: File | null
  }>({
    faturaEnergia: null,
    documentoComFoto: null,
    contratoSocial: null,
    cartaoCNPJ: null,
    documentoRepresentante: null,
  })

  const initialBrand = allowedBrands[0] ?? "rental"

  const form = useForm<IndicacaoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipoPessoa: "PF",
      marca: initialBrand,
      codigoClienteEnergia: "",
      vendedorId: userId,
      status: "nova",
      // PF defaults
      nomeCliente: "",
      emailCliente: "",
      telefoneCliente: "",
      endereco: "",
      cidade: "",
      estado: "",
      cep: "",
    } as unknown as IndicacaoFormValues,
  })

  const tipoPessoa = form.watch("tipoPessoa")

  useEffect(() => {
    if (!allowedBrands.includes(form.getValues("marca"))) {
      form.setValue("marca", initialBrand)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedBrands])

  // =============================
  // Upload helpers
  // =============================
  const pickSingle = (accept: string, onPick: (f: File | null) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      onPick(null)
      return
    }
    const allowed = ["application/pdf", "image/png", "image/jpg", "image/jpeg"]
    if (!allowed.includes(f.type)) {
      showToast({ variant: "error", title: "Arquivo inválido", description: "Use PDF, JPG, JPEG ou PNG." })
      e.target.value = ""
      onPick(null)
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      showToast({ variant: "error", title: "Arquivo grande", description: "Máximo de 10MB por arquivo." })
      e.target.value = ""
      onPick(null)
      return
    }
    onPick(f)
  }

  // =============================
  // Submit
  // =============================
  const onSubmit = async (values: IndicacaoFormValues) => {
    // Checagem de documentos obrigatórios
    if (values.tipoPessoa === "PF") {
      if (!filesPF.faturaEnergia || !filesPF.documentoComFoto) {
        showToast({ variant: "error", title: "Documentos obrigatórios", description: "Fatura e documento com foto são obrigatórios." })
        return
      }
    } else {
      if (!filesPJ.faturaEnergia || !filesPJ.documentoComFoto || !filesPJ.contratoSocial || !filesPJ.cartaoCNPJ || !filesPJ.documentoRepresentante) {
        showToast({ variant: "error", title: "Documentos obrigatórios", description: "Envie todos os documentos exigidos para PJ." })
        return
      }
    }

    // Inserção minimal na tabela indicacoes (mantemos metadata completo no Storage)
    const displayName = values.tipoPessoa === "PF" ? values.nomeCliente : values.nomeEmpresa
    const displayEmail = values.tipoPessoa === "PF" ? values.emailCliente : values.emailSignatario
    const displayPhone = values.tipoPessoa === "PF" ? values.telefoneCliente : values.telefoneCobranca

    const { data, error } = await supabase
      .from("indicacoes")
      .insert({
        tipo: values.tipoPessoa,
        nome: (displayName ?? "").trim(),
        email: (displayEmail ?? "").toLowerCase().trim(),
        telefone: onlyDigits(displayPhone ?? ""),
        status: "EM_ANALISE",
        user_id: userId,
        marca: values.marca,
      })
      .select("id")
      .single()

    if (error || !data?.id) {
      showToast({ variant: "error", title: "Erro ao cadastrar", description: "Não foi possível registrar a indicação." })
      return
    }

    // Salvar metadata completo
    const storageClient = supabase.storage.from(STORAGE_BUCKET)
    const metadata = { ...values }
    const metadataUpload = await storageClient.upload(
      `${userId}/${data.id}/metadata.json`,
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      { upsert: true, cacheControl: "3600", contentType: "application/json" }
    )

    if (metadataUpload.error) {
      showToast({ variant: "error", title: "Dados complementares", description: "Não foi possível salvar os detalhes." })
    }

    // Upload de documentos
    const uploads: Array<Promise<unknown>> = []
    const pushUpload = (name: string, f: File | null) => {
      if (!f) return
      const path = `${userId}/${data.id}/${name}`
      uploads.push(storageClient.upload(path, f, { upsert: true, cacheControl: "3600" }))
    }

    if (values.tipoPessoa === "PF") {
      pushUpload("fatura_energia_pf", filesPF.faturaEnergia)
      pushUpload("documento_com_foto_pf", filesPF.documentoComFoto)
    } else {
      pushUpload("fatura_energia_pj", filesPJ.faturaEnergia)
      pushUpload("documento_com_foto_pj", filesPJ.documentoComFoto)
      pushUpload("contrato_social", filesPJ.contratoSocial)
      pushUpload("cartao_cnpj", filesPJ.cartaoCNPJ)
      pushUpload("doc_representante", filesPJ.documentoRepresentante)
    }

    await Promise.all(uploads)

    showToast({ variant: "success", title: "Indicação criada", description: "Documentos recebidos com sucesso." })
    if (onCreated) await onCreated()
    form.reset({ ...form.getValues(), codigoClienteEnergia: "" })
  }

  // =============================
  // UI
  // =============================
  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Nova indicação</h2>
        <p className="text-sm text-muted-foreground">Preencha os dados do contato e nós cuidamos do restante.</p>
      </div>

      <Form {...form}>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="tipoPessoa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de pessoa</FormLabel>
                  <FormControl>
                    <select className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none" {...field}>
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="marca"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <select className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none" {...field} disabled={allowedBrands.length === 1}>
                      {allowedBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand === "rental" ? "Rental" : "Dorata"}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="codigoClienteEnergia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código da conta de energia</FormLabel>
                  <FormControl>
                    <Input placeholder="Informe o código da conta" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {tipoPessoa === "PF" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="nomeCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do cliente</FormLabel>
                    <FormControl><Input placeholder="Maria da Silva" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl><Input {...field} placeholder="000.000.000-00" onChange={(e)=>field.onChange(formatCpf(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="emailCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="telefoneCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="rg" render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="whatsappSignatarioPF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp do signatário</FormLabel>
                    <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="telefoneCobrancaPF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone de cobrança</FormLabel>
                    <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="emailBoletos" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email para boletos</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="endereco" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl><Input {...field} placeholder="SP" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl><Input {...field} placeholder="00000-000" onChange={(e)=>field.onChange(formatCep(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="consumoMedioPF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consumo médio (kWh)</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="valorContaEnergia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor da conta (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.01" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="dataVendaPF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da venda</FormLabel>
                    <FormControl><Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0,10) : ""} onChange={(e)=>field.onChange(e.target.value)}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="vendedorNomePF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (nome)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="vendedorTelefonePF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (telefone)</FormLabel>
                    <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="vendedorCPF" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (CPF)</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatCpf(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Documentos (PDF/JPG/PNG) — obrigatórios</label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Fatura de energia</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPF((s)=>({...s,faturaEnergia:f})))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Documento com foto (RG/CNH)</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPF((s)=>({...s,documentoComFoto:f})))} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="nomeEmpresa" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão social</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl><Input {...field} placeholder="00.000.000/0000-00" onChange={(e)=>{
                      const v=formatCnpj(e.target.value); field.onChange(v); form.setValue('cpfCnpj', v)
                    }}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="representanteLegal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Representante legal</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="emailSignatario" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email do signatário</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="logradouro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="numero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl><Input placeholder="SP" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl><Input {...field} placeholder="00000-000" onChange={(e)=>field.onChange(formatCep(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="cpfRepresentante" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF representante</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatCpf(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="rgRepresentante" render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG representante</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="emailFatura" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email para fatura</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="telefoneCobranca" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone cobrança</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="whatsappSignatario" render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp signatário</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="codigoInstalacao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código instalação</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="localizacaoUC" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização UC</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="dataVenda" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da venda</FormLabel>
                    <FormControl><Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0,10) : ""} onChange={(e)=>field.onChange(e.target.value)}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="vendedorNome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (nome)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="vendedorTelefone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (telefone)</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatPhone(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
                <FormField control={form.control} name="vendedorCNPJ" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendedor (CNPJ)</FormLabel>
                    <FormControl><Input {...field} onChange={(e)=>field.onChange(formatCnpj(e.target.value))}/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}/>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Documentos (PDF/JPG/PNG) — obrigatórios</label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Fatura de energia</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPJ((s)=>({...s,faturaEnergia:f})))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Documento com foto (representante)</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPJ((s)=>({...s,documentoComFoto:f})))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Contrato social</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPJ((s)=>({...s,contratoSocial:f})))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Cartão CNPJ</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPJ((s)=>({...s,cartaoCNPJ:f})))} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Documento representante (RG/CNH)</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*",(f)=>setFilesPJ((s)=>({...s,documentoRepresentante:f})))} />
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <Button className="w-full md:w-auto" type="submit">Enviar indicação</Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
