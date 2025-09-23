"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { IndicacaoForm } from "@/components/forms/indicacao-form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"
import { useAuthSession } from "@/hooks/use-auth-session"
import { formatPhone } from "@/lib/formatters"
import type { Brand } from "@/lib/auth"

const STORAGE_BUCKET = "indicacoes"

const statusConfig = {
  EM_ANALISE: {
    label: "Em análise",
    className: "bg-amber-100/80 text-amber-700",
  },
  APROVADA: {
    label: "Aprovada",
    className: "bg-emerald-100/80 text-emerald-700",
  },
  REJEITADA: {
    label: "Rejeitada",
    className: "bg-rose-100/80 text-rose-700",
  },
  CONCLUIDA: {
    label: "Concluída",
    className: "bg-sky-100/80 text-sky-700",
  },
} as const

const brandLabels: Record<Brand, string> = {
  rental: "Rental",
  dorata: "Dorata",
}

type StatusKey = keyof typeof statusConfig

type IndicacaoRow = {
  id: string
  nome: string
  email: string
  telefone: string
  status: StatusKey
  created_at: string
  marca: Brand
}

type AttachmentInfo = {
  name: string
  path: string
  signedUrl: string | null
  size: number | null
}

export default function IndicacoesPage() {
  const { session, profile } = useAuthSession()
  const [indicacoes, setIndicacoes] = useState<IndicacaoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null)
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, AttachmentInfo[]>>({})
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false)

  const isMounted = useRef(true)

  const userId = session?.user.id
  const allowedBrands = useMemo(() => profile?.allowedBrands ?? ["rental"], [profile])

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const loadAttachments = useCallback(
    async (rows: IndicacaoRow[]) => {
      if (!isMounted.current) {
        return
      }

      if (!userId || rows.length === 0) {
        setAttachmentsMap({})
        setAttachmentsError(null)
        setIsLoadingAttachments(false)
        return
      }

      setIsLoadingAttachments(true)
      setAttachmentsError(null)

      const storageClient = supabase.storage.from(STORAGE_BUCKET)
      const attachmentsEntries: Array<[string, AttachmentInfo[]]> = []
      let hasErrors = false

      for (const indicacao of rows) {
        const prefix = `${userId}/${indicacao.id}`

        const { data: files, error } = await storageClient.list(prefix, {
          limit: 20,
          sortBy: {
            column: "created_at",
            order: "desc",
          },
        })

        if (error) {
          hasErrors = true
          continue
        }

        const filteredFiles = (files ?? []).filter(
          (file) => file.name !== "metadata.json"
        )

        const attachments: AttachmentInfo[] = []

        for (const file of filteredFiles) {
          const relativePath = `${prefix}/${file.name}`
          const { data: signed, error: signedError } = await storageClient.createSignedUrl(
            relativePath,
            60 * 60
          )

          if (signedError) {
            hasErrors = true
            continue
          }

          attachments.push({
            name: file.name,
            path: relativePath,
            signedUrl: signed?.signedUrl ?? null,
            size: file?.metadata?.size ?? null,
          })
        }

        attachmentsEntries.push([indicacao.id, attachments])
      }

      if (!isMounted.current) {
        return
      }

      setAttachmentsMap(Object.fromEntries(attachmentsEntries))
      setAttachmentsError(
        hasErrors ? "Alguns anexos não puderam ser carregados." : null
      )
      setIsLoadingAttachments(false)
    },
    [userId]
  )

  const loadIndicacoes = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!isMounted.current) {
        return
      }

      if (!userId) {
        setIndicacoes([])
        setIsLoading(false)
        setFetchError(null)
        setAttachmentsMap({})
        setAttachmentsError(null)
        return
      }

      if (showLoading) {
        setIsLoading(true)
        setFetchError(null)
      }

      let query = supabase
        .from("indicacoes")
        .select("id, nome, email, telefone, status, created_at, marca")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (allowedBrands.length > 0) {
        query = query.in("marca", allowedBrands)
      }

      const { data, error } = await query

      if (!isMounted.current) {
        return
      }

      if (error) {
        setFetchError("Não foi possível carregar as indicações.")
        setIndicacoes([])
        setAttachmentsMap({})
      } else {
        setFetchError(null)
        const rows = (data ?? []) as IndicacaoRow[]
        setIndicacoes(rows)
        await loadAttachments(rows)
      }

      setIsLoading(false)
    },
    [userId, allowedBrands, loadAttachments]
  )

  useEffect(() => {
    if (!userId) {
      setIndicacoes([])
      setIsLoading(false)
      return
    }

    void loadIndicacoes()
  }, [userId, loadIndicacoes])

  useEffect(() => {
    if (!userId) {
      return
    }

    const channel = supabase
      .channel(`indicacoes-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "indicacoes",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadIndicacoes({ showLoading: false })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, loadIndicacoes])

  const emptyStateCopy = useMemo(() => {
    if (isLoading) {
      return "Buscando suas indicações..."
    }

    if (fetchError) {
      return fetchError
    }

    return "Você ainda não possui indicações cadastradas. Assim que registrar uma nova, ela aparecerá aqui."
  }, [fetchError, isLoading])

  const formatDate = (value: string) => {
    if (!value) return "—"

    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    } catch {
      return "—"
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Minhas indicações
        </h1>
        <p className="text-muted-foreground">
          Consulte rapidamente o status e detalhes das indicações enviadas.
        </p>
      </header>

      {userId ? (
        <IndicacaoForm
          allowedBrands={allowedBrands}
          onCreated={() => loadIndicacoes()}
          userId={userId}
        />
      ) : null}

      {fetchError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fetchError}
        </div>
      ) : null}

      {attachmentsError ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-100/40 px-3 py-2 text-sm text-amber-700">
          {attachmentsError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        {indicacoes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead>Anexos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {indicacoes.map((indicacao) => (
                <TableRow key={indicacao.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {indicacao.nome}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {indicacao.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusConfig[indicacao.status].className}`}
                    >
                      {statusConfig[indicacao.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {brandLabels[indicacao.marca]}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPhone(indicacao.telefone)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(indicacao.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {isLoadingAttachments ? (
                      <span>Carregando…</span>
                    ) : attachmentsMap[indicacao.id]?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {attachmentsMap[indicacao.id].map((file) => (
                          <a
                            key={file.path}
                            className="inline-flex items-center gap-1 rounded-full border border-input px-2 py-1 text-xs transition-colors hover:border-ring hover:text-foreground"
                            href={file.signedUrl ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span>{file.name}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-48 items-center justify-center px-4 text-sm text-muted-foreground">
            {emptyStateCopy}
          </div>
        )}
      </div>
    </div>
  )
}
