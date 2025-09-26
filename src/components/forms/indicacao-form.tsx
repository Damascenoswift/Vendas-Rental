"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { Indicacao } from "@/lib/validations/indicacao"
import { indicacaoSchema } from "@/lib/validations/indicacao"
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

const pfFields = ["cpf", "rg", "endereco", "cep", "cidade", "estado"] as const
const pjFields = [
  "cnpj",
  "razao_social",
  "nome_fantasia",
  "endereco",
  "cep",
  "cidade",
  "estado",
  "responsavel",
] as const

const STORAGE_BUCKET = "indicacoes"
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_FILES = 5

type IndicacaoFormProps = {
  userId: string
  allowedBrands: Brand[]
  onCreated?: () => Promise<void> | void
}

type IndicacaoFormValues = Indicacao

const defaultPfValues: Omit<IndicacaoFormValues, "marca"> = {
  tipo: "PF",
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  rg: "",
  endereco: "",
  cep: "",
  cidade: "",
  estado: "",
}

const defaultPjValues: Omit<IndicacaoFormValues, "marca"> = {
  tipo: "PJ",
  nome: "",
  email: "",
  telefone: "",
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  endereco: "",
  cep: "",
  cidade: "",
  estado: "",
  responsavel: "",
}

export function IndicacaoForm({
  userId,
  allowedBrands,
  onCreated,
}: IndicacaoFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { showToast } = useToast()

  const initialBrand = allowedBrands[0] ?? "rental"

  const form = useForm<IndicacaoFormValues>({
    resolver: zodResolver(indicacaoSchema),
    defaultValues: {
      ...defaultPfValues,
      marca: initialBrand,
    },
  })

  const tipo = form.watch("tipo")
  const marca = form.watch("marca")

  useEffect(() => {
    if (tipo === "PF") {
      pjFields.forEach((field) => form.unregister(field))
    } else {
      pfFields.forEach((field) => form.unregister(field))
    }
  }, [tipo, form])

  useEffect(() => {
    if (!allowedBrands.includes(marca)) {
      form.setValue("marca", allowedBrands[0] ?? "rental")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedBrands])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])

    if (selectedFiles.length > MAX_FILES) {
      showToast({
        variant: "error",
        title: "Limite de arquivos",
        description: `Selecione no máximo ${MAX_FILES} arquivos por indicação.`,
      })
      event.target.value = ""
      return
    }

    const invalidFile = selectedFiles.find((file) => file.size > MAX_FILE_SIZE)
    if (invalidFile) {
      showToast({
        variant: "error",
        title: "Arquivo muito grande",
        description: `${invalidFile.name} excede o limite de 5MB.`,
      })
      event.target.value = ""
      return
    }

    setFiles(selectedFiles)
  }

  const resetFiles = () => {
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSubmit = async (values: IndicacaoFormValues) => {
    setIsSubmitting(true)

    const payload = {
      tipo: values.tipo,
      nome: values.nome.trim(),
      email: values.email.trim().toLowerCase(),
      telefone: onlyDigits(values.telefone),
      user_id: userId,
      status: "EM_ANALISE" as const,
      marca: values.marca,
    }

    const cpfNormalized = values.tipo === "PF" ? onlyDigits(values.cpf ?? "") : undefined
    const cnpjNormalized = values.tipo === "PJ" ? onlyDigits(values.cnpj ?? "") : undefined
    const cepNormalized = onlyDigits(values.cep ?? "")

    const { data, error } = await supabase
      .from("indicacoes")
      .insert(payload)
      .select("id")
      .single()

    if (error || !data?.id) {
      setIsSubmitting(false)
      showToast({
        variant: "error",
        title: "Erro ao cadastrar",
        description: "Não foi possível registrar a indicação. Tente novamente.",
      })
      return
    }

    const storageClient = supabase.storage.from(STORAGE_BUCKET)

    const metadata = {
      ...payload,
      documento:
        values.tipo === "PF"
          ? {
              cpf: cpfNormalized,
              rg: values.rg?.trim() ?? null,
              endereco: values.endereco?.trim() ?? null,
              cep: cepNormalized || null,
              cidade: values.cidade?.trim() ?? null,
              estado: values.estado?.trim().toUpperCase() ?? null,
            }
          : {
              cnpj: cnpjNormalized,
              razao_social: values.razao_social?.trim() ?? null,
              nome_fantasia: values.nome_fantasia?.trim() ?? null,
              responsavel: values.responsavel?.trim() ?? null,
              endereco: values.endereco?.trim() ?? null,
              cep: cepNormalized || null,
              cidade: values.cidade?.trim() ?? null,
              estado: values.estado?.trim().toUpperCase() ?? null,
            },
    }

    const metadataUpload = await storageClient.upload(
      `${userId}/${data.id}/metadata.json`,
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      {
        upsert: true,
        cacheControl: "3600",
        contentType: "application/json",
      }
    )

    if (metadataUpload.error) {
      showToast({
        variant: "error",
        title: "Dados complementares",
        description: "Não foi possível salvar os detalhes da indicação.",
      })
    }

    if (files.length > 0) {
      const slugBase = values.nome
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      const safeSlug = slugBase.length > 0 ? slugBase : "indicacao"
      const uploads = await Promise.all(
        files.map((file, index) => {
          const extension = file.name.split(".").pop() ?? "dat"
          const filePath = `${userId}/${data.id}/${safeSlug}-${Date.now()}-${index}.${extension}`
          return storageClient.upload(filePath, file, {
            upsert: true,
            cacheControl: "3600",
          })
        })
      )

      const firstUploadError = uploads.find((result) => result.error)?.error

      if (firstUploadError) {
        showToast({
          variant: "error",
          title: "Anexos não enviados",
          description: "Os documentos não puderam ser enviados. Tente novamente mais tarde.",
        })
      } else {
        showToast({
          variant: "success",
          title: "Anexos enviados",
          description: "Documentos recebidos com sucesso.",
        })
      }
    }

    if (onCreated) {
      await onCreated()
    }

    resetFiles()
    setIsSubmitting(false)
    showToast({
      variant: "success",
      title: "Indicação criada",
      description: "Nós avisaremos o time interno para dar continuidade.",
    })

    const currentBrand = values.marca
    const baseDefaults =
      tipo === "PF"
        ? ({ ...defaultPfValues, marca: currentBrand } as IndicacaoFormValues)
        : ({ ...defaultPjValues, marca: currentBrand } as IndicacaoFormValues)

    form.reset(baseDefaults)
  }

  return (
    <div className="rounded-xl border bg-background p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Nova indicação</h2>
        <p className="text-sm text-muted-foreground">
          Preencha os dados do contato e nós cuidamos do restante.
        </p>
      </div>

      <Form {...form}>
        <form className="grid gap-4" onSubmit={form.handleSubmit(handleSubmit)}>
          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de indicação</FormLabel>
                <FormControl>
                  <select
                    className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    {...field}
                  >
                    <option value="PF">Pessoa física</option>
                    <option value="PJ">Pessoa jurídica</option>
                  </select>
                </FormControl>
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
                  <select
                    className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    {...field}
                    disabled={allowedBrands.length === 1}
                  >
                    {allowedBrands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand === "rental" ? "Rental" : "Dorata"}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormDescription>
                  Escolha qual marca receberá esta indicação.
                </FormDescription>
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Maria da Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="email"
                      inputMode="email"
                      placeholder="maria@email.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          <FormField
            control={form.control}
            name="telefone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(11) 99999-9999"
                    {...field}
                    onChange={(event) => field.onChange(formatPhone(event.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          </div>

          {tipo === "PF" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="000.000.000-00"
                        {...field}
                        onChange={(event) => field.onChange(formatCpf(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RG</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000-0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua, número e complemento" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="00000-000"
                        {...field}
                        onChange={(event) => field.onChange(formatCep(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="São Paulo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <Input placeholder="SP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="00.000.000/0000-00"
                        {...field}
                        onChange={(event) => field.onChange(formatCnpj(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="razao_social"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão social</FormLabel>
                    <FormControl>
                      <Input placeholder="Empresa Exemplo LTDA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nome_fantasia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome fantasia</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome comercial (opcional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl>
                      <Input placeholder="Contato principal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua, número e complemento" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="00000-000"
                        {...field}
                        onChange={(event) => field.onChange(formatCep(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="São Paulo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <Input placeholder="SP" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                Anexos (PDF ou imagens)
              </label>
              <input
                ref={fileInputRef}
                accept="application/pdf,image/*"
                className="border-input text-foreground bg-transparent text-sm h-9 w-full rounded-md border px-3 py-1 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                multiple
                type="file"
                onChange={handleFileChange}
              />
              {files.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {files.length} arquivo(s) selecionado(s)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Máximo recomendado: 5MB por arquivo.
                </p>
              )}
            </div>

            <Button className="w-full md:w-auto" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Enviando…" : "Enviar indicação"}
            </Button>
          </div>
        </form>
      </Form>

      <p className="mt-4 text-sm text-muted-foreground">
        Todos os campos marcados como obrigatórios garantem que a equipe interna
        avance com a análise sem retrabalho.
      </p>
    </div>
  )
}
