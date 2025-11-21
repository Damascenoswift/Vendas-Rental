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
// =============================
// Zod Schemas (Unified)
// =============================

// Enum para Tipo de Estrutura
const TipoEstruturaEnum = z.enum(["Solo", "Telhado", "Carport"])

const unifiedSchema = z.object({
  marca: z.enum(["rental", "dorata"]).default("rental"),
  tipoPessoa: z.enum(["PF", "PJ"]).default("PF"),
  vendedorId: z.string().min(1, "Vendedor obrigatório"),
  status: z.enum(["EM_ANALISE", "APROVADA", "REJEITADA", "CONCLUIDA"]).default("EM_ANALISE"),

  // Common / Rental Fields
  codigoClienteEnergia: z.string().optional(),
  nomeCliente: z.string().optional(),
  emailCliente: z.string().optional(),
  telefoneCliente: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
  consumoMedioKwh: z.coerce.number().optional(),
  valorContaEnergia: z.coerce.number().optional(),

  // Rental PF Specific
  cpfCnpj: z.string().optional(),
  rg: z.string().optional(),
  whatsappSignatarioPF: z.string().optional(),
  telefoneCobrancaPF: z.string().optional(),
  emailBoletos: z.string().optional(),
  dataVendaPF: z.coerce.date().optional(),
  vendedorNomePF: z.string().optional(),
  vendedorTelefonePF: z.string().optional(),
  vendedorCPF: z.string().optional(),
  consumoMedioPF: z.coerce.number().optional(),

  // Rental PJ Specific
  nomeEmpresa: z.string().optional(),
  cnpj: z.string().optional(),
  logradouro: z.string().optional(),
  complemento: z.string().optional(),
  representanteLegal: z.string().optional(),
  cpfRepresentante: z.string().optional(),
  rgRepresentante: z.string().optional(),
  emailSignatario: z.string().optional(),
  emailFatura: z.string().optional(),
  telefoneCobranca: z.string().optional(),
  whatsappSignatario: z.string().optional(),
  codigoInstalacao: z.string().optional(),
  localizacaoUC: z.string().optional(),
  dataVenda: z.coerce.date().optional(),
  vendedorNome: z.string().optional(),
  vendedorTelefone: z.string().optional(),
  vendedorCNPJ: z.string().optional(),

  // Dorata Specific
  producaoDesejada: z.string().optional(),
  tipoTelhado: z.string().optional(),
  tipoEstrutura: TipoEstruturaEnum.optional(),
}).superRefine((data, ctx) => {
  // ======================
  // RENTAL VALIDATION
  // ======================
  if (data.marca === 'rental') {
    if (!data.codigoClienteEnergia) ctx.addIssue({ path: ['codigoClienteEnergia'], code: z.ZodIssueCode.custom, message: "Informe o código da conta" })

    if (data.tipoPessoa === 'PF') {
      if (!data.nomeCliente) ctx.addIssue({ path: ['nomeCliente'], code: z.ZodIssueCode.custom, message: "Nome é obrigatório" })
      if (!data.cpfCnpj || data.cpfCnpj.length < 11) ctx.addIssue({ path: ['cpfCnpj'], code: z.ZodIssueCode.custom, message: "CPF inválido" })
      if (!data.rg) ctx.addIssue({ path: ['rg'], code: z.ZodIssueCode.custom, message: "RG é obrigatório" })
      if (!data.emailBoletos) ctx.addIssue({ path: ['emailBoletos'], code: z.ZodIssueCode.custom, message: "Email para boletos obrigatório" })
      if (!data.consumoMedioPF) ctx.addIssue({ path: ['consumoMedioPF'], code: z.ZodIssueCode.custom, message: "Consumo médio obrigatório" })
      // ... add other strict rental PF checks if needed
    } else {
      // PJ
      if (!data.nomeEmpresa) ctx.addIssue({ path: ['nomeEmpresa'], code: z.ZodIssueCode.custom, message: "Razão social obrigatória" })
      if (!data.cnpj || data.cnpj.length < 14) ctx.addIssue({ path: ['cnpj'], code: z.ZodIssueCode.custom, message: "CNPJ inválido" })
      if (!data.representanteLegal) ctx.addIssue({ path: ['representanteLegal'], code: z.ZodIssueCode.custom, message: "Representante legal obrigatório" })
      // ... add other strict rental PJ checks
    }
  }

  // ======================
  // DORATA VALIDATION
  // ======================
  if (data.marca === 'dorata') {
    if (!data.nomeCliente) ctx.addIssue({ path: ['nomeCliente'], code: z.ZodIssueCode.custom, message: "Nome é obrigatório" })
    if (!data.telefoneCliente) ctx.addIssue({ path: ['telefoneCliente'], code: z.ZodIssueCode.custom, message: "WhatsApp é obrigatório" })
    if (!data.producaoDesejada) ctx.addIssue({ path: ['producaoDesejada'], code: z.ZodIssueCode.custom, message: "Informe a produção desejada" })
    if (!data.tipoTelhado) ctx.addIssue({ path: ['tipoTelhado'], code: z.ZodIssueCode.custom, message: "Informe o tipo de telha" })
    if (!data.tipoEstrutura) ctx.addIssue({ path: ['tipoEstrutura'], code: z.ZodIssueCode.custom, message: "Selecione o tipo de estrutura" })

    // Location
    if (!data.cidade) ctx.addIssue({ path: ['cidade'], code: z.ZodIssueCode.custom, message: "Cidade é obrigatória" })
    if (!data.estado) ctx.addIssue({ path: ['estado'], code: z.ZodIssueCode.custom, message: "Estado é obrigatório" })
    if (!data.bairro) ctx.addIssue({ path: ['bairro'], code: z.ZodIssueCode.custom, message: "Bairro é obrigatório" })
    if (!data.endereco) ctx.addIssue({ path: ['endereco'], code: z.ZodIssueCode.custom, message: "Rua é obrigatória" })
    if (!data.numero) ctx.addIssue({ path: ['numero'], code: z.ZodIssueCode.custom, message: "Número é obrigatório" })
  }
})

export type IndicacaoFormValues = z.infer<typeof unifiedSchema>

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
    resolver: zodResolver(unifiedSchema),
    defaultValues: {
      tipoPessoa: "PF",
      marca: initialBrand,
      codigoClienteEnergia: "",
      vendedorId: userId,
      status: "EM_ANALISE",
      // PF defaults
      nomeCliente: "",
      emailCliente: "",
      telefoneCliente: "",
      endereco: "",
      numero: "",
      bairro: "",
      cidade: "",
      estado: "",
      cep: "",
      // Dorata defaults
      producaoDesejada: "",
      tipoTelhado: "",
      tipoEstrutura: undefined,
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
    // Checagem de documentos obrigatórios (APENAS RENTAL)
    if (values.marca === 'rental') {
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

    // Dispara Clicksign via Zapier (não bloqueia salva/UX)
    try {
      const { ClicksignService } = await import("@/lib/integrations/clicksign")
      const payload = ClicksignService.prepararDados({
        id: data.id,
        tipoPessoa: values.tipoPessoa,
        nomeCliente: values.nomeCliente,
        emailCliente: values.emailCliente,
        telefoneCliente: values.telefoneCliente,
        endereco: values.endereco,
        cidade: values.cidade,
        estado: values.estado,
        cep: values.cep,
        consumoMedioKwh: (values as any).consumoMedioKwh ?? (values as any).consumoMedioPF,
        valorContaEnergia: values.valorContaEnergia,
        vendedorId: userId,
        vendedorNome: (values as any).vendedorNome ?? (values as any).vendedorNomePF,
        vendedorTelefone: (values as any).vendedorTelefone ?? (values as any).vendedorTelefonePF,
        vendedorCPF: (values as any).vendedorCPF,
        vendedorCNPJ: (values as any).vendedorCNPJ,
        dataVenda: (values as any).dataVenda,
        dataVendaPF: (values as any).dataVendaPF,
        cpfCnpj: (values as any).cpfCnpj,
        rg: (values as any).rg,
        nomeEmpresa: (values as any).nomeEmpresa,
        representanteLegal: (values as any).representanteLegal,
        cpfRepresentante: (values as any).cpfRepresentante,
        rgRepresentante: (values as any).rgRepresentante,
        logradouro: (values as any).logradouro,
        numero: (values as any).numero,
        bairro: (values as any).bairro,
        emailSignatario: (values as any).emailSignatario,
        emailFatura: (values as any).emailFatura,
        telefoneCobranca: (values as any).telefoneCobranca,
        whatsappSignatario: (values as any).whatsappSignatario ?? (values as any).whatsappSignatarioPF,
        codigoClienteEnergia: values.codigoClienteEnergia,
        createdAt: new Date(),
        status: 'EM_ANALISE',
      })
      // fire-and-forget (sem travar UX)
      void ClicksignService.criarContrato(payload)
    } catch (e) {
      console.error('Zapier/Clicksign não disparado:', e)
    }

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

            {form.watch('marca') === 'rental' && (
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
            )}
          </div>

          {/* ========================== */}
          {/* DORATA FORM (SIMPLIFIED)   */}
          {/* ========================== */}
          {form.watch('marca') === 'dorata' && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="nomeCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do cliente</FormLabel>
                    <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefoneCliente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl><Input placeholder="(00) 00000-0000" {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="producaoDesejada" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produção Desejada</FormLabel>
                    <FormControl><Input placeholder="Ex: 500 kWh" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipoTelhado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Telha</FormLabel>
                    <FormControl><Input placeholder="Ex: Barro, Fibrocimento..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipoEstrutura" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Estrutura</FormLabel>
                    <FormControl>
                      <select className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none" {...field}>
                        <option value="">Selecione...</option>
                        <option value="Solo">Solo</option>
                        <option value="Telhado">Telhado</option>
                        <option value="Carport">Carport</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl><Input placeholder="00000-000" {...field} onChange={(e) => field.onChange(formatCep(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl><Input placeholder="UF" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endereco" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rua</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="numero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          )}

          {/* ========================== */}
          {/* RENTAL FORM (ORIGINAL)     */}
          {/* ========================== */}
          {form.watch('marca') === 'rental' && (
            <>
              {tipoPessoa === "PF" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="nomeCliente" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do cliente</FormLabel>
                        <FormControl><Input placeholder="Maria da Silva" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cpfCnpj" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF</FormLabel>
                        <FormControl><Input {...field} placeholder="000.000.000-00" onChange={(e) => field.onChange(formatCpf(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailCliente" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="telefoneCliente" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rg" render={({ field }) => (
                      <FormItem>
                        <FormLabel>RG</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="whatsappSignatarioPF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp do signatário</FormLabel>
                        <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="telefoneCobrancaPF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone de cobrança</FormLabel>
                        <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailBoletos" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email para boletos</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="endereco" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="estado" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <FormControl><Input {...field} placeholder="SP" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cep" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP</FormLabel>
                        <FormControl><Input {...field} placeholder="00000-000" onChange={(e) => field.onChange(formatCep(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="consumoMedioPF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Consumo médio (kWh)</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="valorContaEnergia" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor da conta (R$)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min={0} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dataVendaPF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data da venda</FormLabel>
                        <FormControl><Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(e.target.value)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="vendedorNomePF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (nome)</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vendedorTelefonePF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (telefone)</FormLabel>
                        <FormControl><Input {...field} placeholder="(11) 99999-9999" onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vendedorCPF" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (CPF)</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatCpf(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Documentos (PDF/JPG/PNG) — obrigatórios</label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <span className="text-xs text-muted-foreground">Fatura de energia</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPF((s) => ({ ...s, faturaEnergia: f })))} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Documento com foto (RG/CNH)</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPF((s) => ({ ...s, documentoComFoto: f })))} />
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
                    )} />
                    <FormField control={form.control} name="cnpj" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CNPJ</FormLabel>
                        <FormControl><Input {...field} placeholder="00.000.000/0000-00" onChange={(e) => {
                          const v = formatCnpj(e.target.value); field.onChange(v); form.setValue('cpfCnpj', v)
                        }} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="representanteLegal" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Representante legal</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailSignatario" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email do signatário</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="logradouro" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Logradouro</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="numero" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="bairro" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bairro</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="estado" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <FormControl><Input placeholder="SP" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cep" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP</FormLabel>
                        <FormControl><Input {...field} placeholder="00000-000" onChange={(e) => field.onChange(formatCep(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="cpfRepresentante" render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF representante</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatCpf(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rgRepresentante" render={({ field }) => (
                      <FormItem>
                        <FormLabel>RG representante</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailFatura" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email para fatura</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="telefoneCobranca" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone cobrança</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="whatsappSignatario" render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp signatário</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="codigoInstalacao" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código instalação</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="localizacaoUC" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Localização UC</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dataVenda" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data da venda</FormLabel>
                        <FormControl><Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(e.target.value)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="vendedorNome" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (nome)</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vendedorTelefone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (telefone)</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vendedorCNPJ" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendedor (CNPJ)</FormLabel>
                        <FormControl><Input {...field} onChange={(e) => field.onChange(formatCnpj(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Documentos (PDF/JPG/PNG) — obrigatórios</label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <span className="text-xs text-muted-foreground">Fatura de energia</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPJ((s) => ({ ...s, faturaEnergia: f })))} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Documento com foto (representante)</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPJ((s) => ({ ...s, documentoComFoto: f })))} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Contrato social</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPJ((s) => ({ ...s, contratoSocial: f })))} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Cartão CNPJ</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPJ((s) => ({ ...s, cartaoCNPJ: f })))} />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Documento representante (RG/CNH)</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={pickSingle("*", (f) => setFilesPJ((s) => ({ ...s, documentoRepresentante: f })))} />
                      </div>
                    </div>
                  </div>
                </>
              )}
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
