"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Sparkles, Loader2 } from "lucide-react"
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
import { numberToWordsPtBr } from "@/lib/number-to-words-ptbr"
import { useToast } from "@/hooks/use-toast"
import type { Brand } from "@/lib/auth"

import { createIndicationAction } from "@/app/actions/indicacoes"

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
  marca: z.enum(["rental", "dorata"]),
  tipoPessoa: z.enum(["PF", "PJ"]),
  vendedorId: z.string().min(1, "Vendedor obrigatório"),
  status: z.enum(["EM_ANALISE", "APROVADA", "REJEITADA", "CONCLUIDA"]),

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

  localizacaoUC: z.string().optional(),

  // New Contract Fields
  precoKwh: z.coerce.number().optional(), // Preço Energisa
  desconto: z.coerce.number().optional(), // % Desconto (20, 25...)
  consumos: z.array(z.coerce.number()).optional(), // Array de consumos mensais
  prazoContrato: z.string().optional(),
  avisoPrevio: z.string().optional(),
  outrasUcs: z.array(z.object({
    codigoInstalacao: z.string().optional(),
    localizacaoUC: z.string().optional(),
  })).optional(),

  // Rental PF Specific
  cpfCnpj: z.string().optional(),
  rg: z.string().optional(),
  whatsappSignatarioPF: z.string().optional(),
  telefoneCobrancaPF: z.string().optional(),
  emailBoletos: z.string().optional(),
  dataVendaPF: z.coerce.date().optional(),
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
  dataVenda: z.coerce.date().optional(),

  // Dorata Specific
  producaoDesejada: z.string().optional(),
  tipoTelhado: z.string().optional(),
  tipoEstrutura: TipoEstruturaEnum.optional(),
}).superRefine((data, ctx) => {
  // ======================
  // RENTAL VALIDATION
  // ======================
  if (data.marca === 'rental') {
    if (!data.codigoClienteEnergia) ctx.addIssue({ path: ['codigoClienteEnergia'], code: z.ZodIssueCode.custom, message: "Informe o código do cliente (UC)" })
    if (!data.codigoInstalacao) ctx.addIssue({ path: ['codigoInstalacao'], code: z.ZodIssueCode.custom, message: "Informe o código da instalação" })

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
  userRole?: string
  subordinates?: Array<{ id: string, name: string, email: string }>
  onCreated?: () => Promise<void> | void
  isInternalRegistration?: boolean
}

export function IndicacaoForm({
  userId,
  allowedBrands,
  userRole,
  subordinates = [],
  onCreated,
  isInternalRegistration = false
}: IndicacaoFormProps) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    resolver: zodResolver(unifiedSchema) as any,
    defaultValues: {
      tipoPessoa: "PF",
      marca: initialBrand,
      codigoClienteEnergia: "",
      codigoInstalacao: "",
      localizacaoUC: "",
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
      precoKwh: 0.95, // Default Value
      desconto: 20,   // Default Value 20%
      prazoContrato: "",
      avisoPrevio: "",
      outrasUcs: [],
    },
  })

  const {
    fields: outrasUcsFields,
    append: appendOutraUc,
    remove: removeOutraUc,
  } = useFieldArray({
    control: form.control,
    name: "outrasUcs",
  })

  const tipoPessoa = form.watch("tipoPessoa")
  const precoKwh = Number(form.watch("precoKwh") ?? 0)
  const desconto = Number(form.watch("desconto") ?? 0)
  const consumoMedioPF = Number(form.watch("consumoMedioPF") ?? 0)
  const descontoPercent = Number.isFinite(desconto) ? Math.min(Math.max(desconto, 0), 100) : 0
  const valorLocacaoTotalPreview = Math.floor(Math.max(0, consumoMedioPF) * Math.max(0, precoKwh) * (1 - descontoPercent / 100))
  const valorLocacaoExtensoPreview =
    consumoMedioPF > 0 && precoKwh > 0 ? numberToWordsPtBr(valorLocacaoTotalPreview) : ""

  useEffect(() => {
    if (!allowedBrands.includes(form.getValues("marca"))) {
      form.setValue("marca", initialBrand)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedBrands])

  // =============================
  // AI Autofill
  // =============================
  const [isAiLoading, setIsAiLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAiSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsAiLoading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        body: formData
      })
      const json = await res.json()

      if (!json.success) throw new Error(json.error || "Failed to extract data")

      const data = json.data
      if (data) {
        if (data.nome) form.setValue("nomeCliente", data.nome)
        if (data.cpf) form.setValue("cpfCnpj", formatCpf(data.cpf))
        if (data.rg) form.setValue("rg", data.rg)
        if (data.endereco) form.setValue("endereco", data.endereco)
        if (data.cidade) form.setValue("cidade", data.cidade)
        if (data.uf) form.setValue("estado", data.uf)
        if (data.cep) form.setValue("cep", formatCep(data.cep))
        if (data.consumo) form.setValue("consumoMedioPF", Number(data.consumo))
        if (data.valor) form.setValue("valorContaEnergia", Number(data.valor))
        if (data.codigo_conta_energia) form.setValue("codigoClienteEnergia", data.codigo_conta_energia)
        if (data.codigo_instalacao) form.setValue("codigoInstalacao", data.codigo_instalacao)

        showToast({ variant: "success", title: "IA Finalizada", description: "Campos preenchidos automaticamente!" })
      }

    } catch (error) {
      console.error("AI Error:", error)
      showToast({ variant: "error", title: "Erro na IA", description: "Não conseguimos ler o documento." })
    } finally {
      setIsAiLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

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
    // Se isInternalRegistration for true, ignoramos essa validação
    if (values.marca === 'rental' && !isInternalRegistration) {
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

    setIsSubmitting(true)

    // Inserção na tabela indicacoes via Server Action
    const displayName = values.tipoPessoa === "PF" ? values.nomeCliente : values.nomeEmpresa
    const displayEmail = values.tipoPessoa === "PF" ? values.emailCliente : values.emailSignatario
    const displayPhone = values.tipoPessoa === "PF" ? values.telefoneCliente : values.telefoneCobranca

    const codigoInstalacao = values.codigoInstalacao?.trim()
    const payload = {
      tipo: values.tipoPessoa,
      nome: (displayName ?? "").trim(),
      email: (displayEmail ?? "").toLowerCase().trim(),
      telefone: onlyDigits(displayPhone ?? ""),
      status: "EM_ANALISE",
      user_id: values.vendedorId, // Use the selected salesperson ID
      marca: values.marca,
      documento: values.tipoPessoa === "PF" ? onlyDigits(values.cpfCnpj ?? "") : onlyDigits(values.cnpj ?? ""),
      unidade_consumidora: values.localizacaoUC || null,
      codigo_cliente: values.codigoClienteEnergia,
      ...(codigoInstalacao ? { codigo_instalacao: codigoInstalacao } : {}),
    }

    const { success, id: indicationId, message } = await createIndicationAction(payload)

    if (!success || !indicationId) {
      showToast({ variant: "error", title: "Erro ao cadastrar", description: message || "Não foi possível registrar a indicação." })
      setIsSubmitting(false)
      return
    }

    const storageOwnerId = values.vendedorId || userId

    // Salvar metadata completo no Storage
    const storageClient = supabase.storage.from(STORAGE_BUCKET)
    const metadata = { ...values }
    const metadataUpload = await storageClient.upload(
      `${storageOwnerId}/${indicationId}/metadata.json`,
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      { upsert: true, cacheControl: "3600", contentType: "application/json" }
    )

    if (metadataUpload.error) {
      console.error("Storage Upload Error (Metadata):", metadataUpload.error)
      showToast({ variant: "error", title: "Dados complementares", description: "Não foi possível salvar os detalhes." })
    }

    // Upload de documentos
    const uploads: Array<Promise<unknown>> = []
    const pushUpload = (name: string, f: File | null) => {
      if (!f) return
      const path = `${storageOwnerId}/${indicationId}/${name}`
      const uploadPromise = storageClient.upload(path, f, { upsert: true, cacheControl: "3600" })

      uploadPromise.then(({ error }) => {
        if (error) console.error(`File Upload Error (${name}):`, error)
      })

      uploads.push(uploadPromise)
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
    form.reset({ ...form.getValues(), codigoClienteEnergia: "", codigoInstalacao: "" })
    setIsSubmitting(false)
  }

  // =============================
  // UI
  // =============================
  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Nova indicação</h2>
          <p className="text-sm text-muted-foreground">Preencha os dados do contato e nós cuidamos do restante.</p>
        </div>
        {(userRole === 'adm_mestre' || userRole === 'adm_dorata') && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleAiSelect}
            />
            <Button
              variant="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAiLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              PREENCHER COM IA
            </Button>
          </div>
        )}
      </div>

      <Form {...form}>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-4">
            {/* Supervisor attribution field */}
            {userRole === 'supervisor' && subordinates.length > 0 && (
              <FormField
                control={form.control}
                name="vendedorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-blue-700 font-bold">Vendedor Responsável</FormLabel>
                    <FormControl>
                      <select
                        className="border-blue-200 text-blue-900 bg-blue-50/50 text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none focus:ring-2 focus:ring-blue-500"
                        {...field}
                      >
                        <option value={userId}>Eu mesmo (Supervisor)</option>
                        {subordinates.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name || sub.email}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                    <FormLabel>Código do cliente (UC)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 6/4724252-4" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {form.watch('marca') === 'rental' && (
              <FormField
                control={form.control}
                name="codigoInstalacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código da instalação</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 00002157080" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {form.watch('marca') === 'rental' && (
              <FormField
                control={form.control}
                name="localizacaoUC"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização UC</FormLabel>
                    <FormControl>
                      <Input placeholder="Endereço da unidade consumidora" {...field} />
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
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
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

                  {/* DADOS CONTRATO (PF) */}
                  <div className="rounded-md border p-4 bg-slate-50 mb-4">
                    <h3 className="text-sm font-semibold mb-3 text-blue-700">Dados do Contrato</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField control={form.control} name="precoKwh" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preço kWh (Energisa)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="desconto" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Desconto (%)</FormLabel>
                          <FormControl><Input type="number" step="1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="prazoContrato" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prazo de contrato</FormLabel>
                          <FormControl><Input placeholder="Ex: 60 meses" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField control={form.control} name="avisoPrevio" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aviso prévio</FormLabel>
                          <FormControl><Input placeholder="Ex: 60 dias" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="grid gap-2 md:col-span-2">
                        <label className="text-sm font-medium text-foreground">Valor locação (por extenso)</label>
                        <Input
                          value={valorLocacaoExtensoPreview}
                          placeholder="Preencha consumo e preço para gerar"
                          readOnly
                        />
                      </div>
                    </div>
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

                  <div className="rounded-md border p-4 bg-slate-50 mb-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-700">Outras UCs (opcional)</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendOutraUc({ codigoInstalacao: "", localizacaoUC: "" })}
                        disabled={outrasUcsFields.length >= 9}
                      >
                        Adicionar UC
                      </Button>
                    </div>

                    {outrasUcsFields.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Adicione outras unidades consumidoras se houver.
                      </p>
                    ) : (
                      <div className="grid gap-4">
                        {outrasUcsFields.map((field, index) => (
                          <div key={field.id} className="grid gap-4 md:grid-cols-3 items-end">
                            <FormField
                              control={form.control}
                              name={`outrasUcs.${index}.codigoInstalacao` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Código da instalação</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`outrasUcs.${index}.localizacaoUC` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Localização UC</FormLabel>
                                  <FormControl><Input {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-9"
                              onClick={() => removeOutraUc(index)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Documentos (PDF/JPG/PNG) {isInternalRegistration ? "— opcional (Admin)" : "— obrigatórios"}
                    </label>
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

                  {/* DADOS CONTRATO (PJ) */}
                  <div className="rounded-md border p-4 bg-slate-50 mb-4">
                    <h3 className="text-sm font-semibold mb-3 text-blue-700">Dados do Contrato</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField control={form.control} name="precoKwh" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preço kWh (Energisa)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="desconto" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Desconto (%)</FormLabel>
                          <FormControl><Input type="number" step="1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="consumoMedioKwh" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consumo Médio (kWh)</FormLabel>
                          <FormControl><Input type="number" min={0} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="dataVenda" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data da venda</FormLabel>
                        <FormControl><Input type="date" value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""} onChange={(e) => field.onChange(e.target.value)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Documentos (PDF/JPG/PNG) {isInternalRegistration ? "— opcional (Admin)" : "— obrigatórios"}
                    </label>
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
