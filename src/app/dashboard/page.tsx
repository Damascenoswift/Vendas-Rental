"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuthSession } from "@/hooks/use-auth-session"
import type { Brand } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { QuickIndicationDialog } from "@/components/forms/quick-indication-dialog"
import { RentalCalculator } from "@/components/calculators/rental-calculator"
import { IndicationProgressDialog } from "@/components/indicacoes/indication-progress-dialog"

type StatusKey = "EM_ANALISE" | "APROVADA" | "REJEITADA" | "CONCLUIDA"
type DocValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "INCOMPLETE" | null

const brandLabels: Record<Brand, string> = {
  rental: "Rental",
  dorata: "Dorata",
}

type RecentIndicacao = {
  id: string
  nome: string
  status: string
  created_at: string
  updated_at: string
  marca: Brand
  doc_validation_status: DocValidationStatus
  contrato_enviado_em: string | null
  assinada_em: string | null
}

type DashboardActivity = {
  id: string
  indicacao_id: string
  indicacao_nome: string
  title: string
  description: string
  actor: string
  created_at: string
  kind: "MILESTONE" | "INTERACTION" | "ENERGISA"
}

type DashboardMetrics = {
  total: number
  porStatus: Record<StatusKey, number>
  ultimaIndicacao: string | null
  porMarca: Record<Brand, number>
  recentes: RecentIndicacao[]
  activity: DashboardActivity[]
}

const emptyMetrics: DashboardMetrics = {
  total: 0,
  porStatus: {
    EM_ANALISE: 0,
    APROVADA: 0,
    REJEITADA: 0,
    CONCLUIDA: 0,
  },
  ultimaIndicacao: null,
  porMarca: {
    rental: 0,
    dorata: 0,
  },
  recentes: [],
  activity: [],
}

const statusBadgeConfig: Record<string, { label: string; className: string }> = {
  EM_ANALISE: { label: "Em análise", className: "bg-amber-100/80 text-amber-700" },
  AGUARDANDO_ASSINATURA: { label: "Aguardando assinatura", className: "bg-violet-100/80 text-violet-700" },
  FALTANDO_DOCUMENTACAO: { label: "Faltando documentação", className: "bg-orange-100/80 text-orange-700" },
  ENERGISA_ANALISE: { label: "Energisa em análise", className: "bg-cyan-100/80 text-cyan-700" },
  ENERGISA_APROVADO: { label: "Energisa aprovado", className: "bg-teal-100/80 text-teal-700" },
  INSTALACAO_AGENDADA: { label: "Instalação agendada", className: "bg-indigo-100/80 text-indigo-700" },
  APROVADA: { label: "Aprovada", className: "bg-emerald-100/80 text-emerald-700" },
  REJEITADA: { label: "Rejeitada", className: "bg-rose-100/80 text-rose-700" },
  CONCLUIDA: { label: "Concluída", className: "bg-sky-100/80 text-sky-700" },
}

const interactionTypeLabels: Record<string, string> = {
  STATUS_CHANGE: "Status atualizado",
  DOC_APPROVAL: "Validação de documentação",
  DOC_REQUEST: "Solicitação de documentação",
  COMMENT: "Comentário interno",
}

const energisaActionLabels: Record<string, string> = {
  DOC_SUBMITTED: "Energisa: Protocolo de entrada",
  PENDING_INFO: "Energisa: Pendência de informação",
  REJECTION: "Energisa: Rejeição / indeferimento",
  RESUBMISSION: "Energisa: Reentrada / recurso",
  APPROVED: "Energisa: Aprovação / parecer",
  METER_CHANGE: "Energisa: Troca de medidor",
  TRANSFER_SUCCESS: "Energisa: Titularidade concluída",
}

const getMetricBucket = (status: string): StatusKey => {
  if (status === "APROVADA") return "APROVADA"
  if (status === "REJEITADA") return "REJEITADA"
  if (status === "CONCLUIDA") return "CONCLUIDA"
  return "EM_ANALISE"
}

const getCurrentStepLabel = (indicacao: {
  status: string
  doc_validation_status: DocValidationStatus
  contrato_enviado_em: string | null
  assinada_em: string | null
}) => {
  if (indicacao.status === "REJEITADA") return "Rejeitada"
  if (indicacao.status === "CONCLUIDA" || indicacao.assinada_em) return "Contrato assinado"
  if (indicacao.status === "AGUARDANDO_ASSINATURA" || indicacao.contrato_enviado_em) {
    return "Aguardando assinatura"
  }
  if (indicacao.status === "ENERGISA_ANALISE") return "Energisa em análise"
  if (indicacao.status === "ENERGISA_APROVADO") return "Energisa aprovado"
  if (indicacao.status === "INSTALACAO_AGENDADA") return "Instalação agendada"
  if (indicacao.doc_validation_status === "INCOMPLETE" || indicacao.status === "FALTANDO_DOCUMENTACAO") {
    return "Documentação pendente"
  }
  if (indicacao.doc_validation_status === "APPROVED" || indicacao.status === "APROVADA") {
    return "Documentação aprovada"
  }
  return "Em análise"
}

const normalizeActor = (user: { name?: string | null; email?: string | null } | null | undefined) => {
  return user?.name ?? user?.email ?? "Sistema"
}

const getJourneyProgress = (indicacao: {
  status: string
  doc_validation_status: DocValidationStatus
  contrato_enviado_em: string | null
  assinada_em: string | null
}) => {
  const total = 5
  let done = 1 // Indicação registrada

  const docsDone = indicacao.doc_validation_status === "APPROVED"
  const docsBlocked =
    indicacao.doc_validation_status === "INCOMPLETE" ||
    indicacao.doc_validation_status === "REJECTED" ||
    indicacao.status === "FALTANDO_DOCUMENTACAO" ||
    indicacao.status === "REJEITADA"

  if (docsDone || docsBlocked) done += 1
  if (indicacao.contrato_enviado_em || indicacao.status === "AGUARDANDO_ASSINATURA" || indicacao.status === "CONCLUIDA") {
    done += 1
  }
  if (indicacao.assinada_em || indicacao.status === "CONCLUIDA") {
    done += 1
  }
  if (indicacao.status === "CONCLUIDA" || indicacao.status === "REJEITADA") {
    done += 1
  }

  const percent = Math.min(100, Math.round((done / total) * 100))
  return { done, total, percent }
}

export default function DashboardPage() {
  const { session, profile } = useAuthSession()
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const isMounted = useRef(true)

  const userId = session?.user.id
  const allowedBrands = useMemo(() => profile?.allowedBrands ?? ["rental"], [profile])

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const displayName = useMemo(() => {
    const metadataName = session?.user.user_metadata?.nome as string | undefined
    if (metadataName && metadataName.trim().length > 0) {
      return metadataName
    }

    const email = session?.user.email ?? ""
    return email.split("@")[0] || "Usuário"
  }, [session])

  const loadMetrics = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      if (!isMounted.current) {
        return
      }

      if (!userId) {
        setMetrics(emptyMetrics)
        setIsLoadingMetrics(false)
        return
      }

      if (showLoading) {
        setIsLoadingMetrics(true)
        setMetricsError(null)
      }

      type IndicacaoResumoRow = {
        id: string
        nome: string
        status: string
        created_at: string
        updated_at: string
        marca: Brand
        doc_validation_status: DocValidationStatus
        contrato_enviado_em: string | null
        assinada_em: string | null
      }

      type InteractionFeedRow = {
        id: string
        indicacao_id: string
        type: string
        content: string | null
        created_at: string
        metadata?: Record<string, unknown> | null
        user?: {
          name: string | null
          email: string | null
        } | null
      }

      type EnergisaFeedRow = {
        id: string
        indicacao_id: string
        action_type: string
        notes: string | null
        created_at: string
        user?: {
          name: string | null
          email: string | null
        } | null
      }

      let query = supabase
        .from("indicacoes")
        .select("id, nome, status, created_at, updated_at, marca, doc_validation_status, contrato_enviado_em, assinada_em")
        .order("created_at", { ascending: false })

      // Se NÃO for adm_mestre nem funcionario_n1/n2, filtra apenas as próprias indicações
      // Se for adm_mestre ou funcionario_n1/n2, não aplica filtro de user_id (vê tudo)
      if (!['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile?.role ?? '')) {
        query = query.eq("user_id", userId)
      }

      if (allowedBrands.length > 0) {
        query = query.in("marca", allowedBrands as any)
      }

      const { data, error } = await query

      if (!isMounted.current) {
        return
      }

      if (error) {
        setMetricsError("Não foi possível carregar as métricas.")
        setMetrics(emptyMetrics)
      } else {
        const rows = (data ?? []) as IndicacaoResumoRow[]
        const rentalRows = rows.filter((row) => row.marca === "rental")
        const latestRows = rentalRows.slice(0, 30)
        const nameById = new Map(latestRows.map((row) => [row.id, row.nome]))
        const porStatus: Record<StatusKey, number> = {
          EM_ANALISE: 0,
          APROVADA: 0,
          REJEITADA: 0,
          CONCLUIDA: 0,
        }

        const porMarca: Record<Brand, number> = {
          rental: 0,
          dorata: 0,
        }

        rows.forEach((row) => {
          porStatus[getMetricBucket(row.status)] += 1
          porMarca[row.marca] += 1
        })

        const activity: DashboardActivity[] = []

        for (const row of latestRows) {
          activity.push({
            id: `milestone-created-${row.id}`,
            indicacao_id: row.id,
            indicacao_nome: row.nome,
            title: "Indicação registrada",
            description: "Cadastro inicial recebido.",
            actor: "Sistema",
            created_at: row.created_at,
            kind: "MILESTONE",
          })

          if (row.contrato_enviado_em) {
            activity.push({
              id: `milestone-contract-sent-${row.id}`,
              indicacao_id: row.id,
              indicacao_nome: row.nome,
              title: "Contrato enviado",
              description: "Contrato enviado para assinatura.",
              actor: "Sistema",
              created_at: row.contrato_enviado_em,
              kind: "MILESTONE",
            })
          }

          if (row.assinada_em) {
            activity.push({
              id: `milestone-contract-signed-${row.id}`,
              indicacao_id: row.id,
              indicacao_nome: row.nome,
              title: "Contrato assinado",
              description: "Assinatura do contrato concluída.",
              actor: "Sistema",
              created_at: row.assinada_em,
              kind: "MILESTONE",
            })
          }
        }

        const indicacaoIds = latestRows.map((row) => row.id)
        if (indicacaoIds.length > 0) {
          const [{ data: interactionsData }, { data: energisaData }] = await Promise.all([
            supabase
              .from("indicacao_interactions")
              .select("id, indicacao_id, type, content, metadata, created_at, user:users(name, email)")
              .in("indicacao_id", indicacaoIds)
              .order("created_at", { ascending: false })
              .limit(100),
            supabase
              .from("energisa_logs")
              .select("id, indicacao_id, action_type, notes, created_at, user:users(name, email)")
              .in("indicacao_id", indicacaoIds)
              .order("created_at", { ascending: false })
              .limit(100),
          ])

          for (const interaction of (interactionsData ?? []) as unknown as InteractionFeedRow[]) {
            activity.push({
              id: `interaction-${interaction.id}`,
              indicacao_id: interaction.indicacao_id,
              indicacao_nome: nameById.get(interaction.indicacao_id) ?? "Indicação",
              title: interactionTypeLabels[interaction.type] ?? "Atualização interna",
              description: interaction.content || "Atualização registrada pela equipe.",
              actor: normalizeActor(interaction.user),
              created_at: interaction.created_at,
              kind: "INTERACTION",
            })
          }

          for (const log of (energisaData ?? []) as unknown as EnergisaFeedRow[]) {
            activity.push({
              id: `energisa-${log.id}`,
              indicacao_id: log.indicacao_id,
              indicacao_nome: nameById.get(log.indicacao_id) ?? "Indicação",
              title: energisaActionLabels[log.action_type] ?? `Energisa: ${log.action_type}`,
              description: log.notes || "Ação Energisa registrada sem observações.",
              actor: normalizeActor(log.user),
              created_at: log.created_at,
              kind: "ENERGISA",
            })
          }
        }

        const recentActivity = activity
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20)

        setMetrics({
          total: rows.length,
          porStatus,
          ultimaIndicacao: rows[0]?.created_at ?? null,
          porMarca,
          recentes: rentalRows.slice(0, 6),
          activity: recentActivity,
        })
        setMetricsError(null)
      }

      setIsLoadingMetrics(false)
    },
    [userId, allowedBrands, profile?.role]
  )

  useEffect(() => {
    if (!userId) {
      setMetrics(emptyMetrics)
      setIsLoadingMetrics(false)
      return
    }

    void loadMetrics()
  }, [userId, loadMetrics])

  useEffect(() => {
    if (!userId) {
      return
    }

    const channel = supabase
      .channel(`dashboard-indicacoes-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "indicacoes",
          filter: ['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile?.role ?? '')
            ? undefined
            : `user_id=eq.${userId}`,
        },
        () => {
          void loadMetrics({ showLoading: false })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "indicacao_interactions",
        },
        () => {
          void loadMetrics({ showLoading: false })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "energisa_logs",
        },
        () => {
          void loadMetrics({ showLoading: false })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, loadMetrics, profile?.role])

  const formattedUltimaIndicacao = useMemo(() => {
    if (!metrics.ultimaIndicacao) {
      return "—"
    }

    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(metrics.ultimaIndicacao))
    } catch {
      return "—"
    }
  }, [metrics.ultimaIndicacao])

  const formatNumber = useCallback((value: number) => value.toLocaleString("pt-BR"), [])
  const formatDateTime = useCallback((value: string) => {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    } catch {
      return "—"
    }
  }, [])

  const brandCards = useMemo(
    () =>
      allowedBrands.map((brand) => ({
        brand,
        title: `Indicações ${brandLabels[brand as keyof typeof brandLabels]}`,
        subtitle: `Total enviado para ${brandLabels[brand as keyof typeof brandLabels]}`,
        value: metrics.porMarca[brand as keyof typeof metrics.porMarca],
      })),
    [allowedBrands, metrics.porMarca]
  )

  const metricCards = useMemo(
    () => [
      {
        title: "Total de indicações",
        value: metrics.total,
        subtitle: "Todo o histórico registrado",
      },
      {
        title: "Em análise",
        value: metrics.porStatus.EM_ANALISE,
        subtitle: "Aguardando avaliação",
        accent: "text-amber-600",
      },
      {
        title: "Aprovadas",
        value: metrics.porStatus.APROVADA,
        subtitle: "Próximas etapas em andamento",
        accent: "text-emerald-600",
      },
      {
        title: "Concluídas",
        value: metrics.porStatus.CONCLUIDA,
        subtitle: "Processos finalizados",
        accent: "text-sky-600",
      },
    ],
    [metrics]
  )

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Olá, {displayName}. Aqui você acompanha a evolução das suas indicações.
        </p>
        <div className="pt-2 flex gap-2">
          {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile?.role ?? '') && (
            <Link href="/admin/indicacoes">
              <Button variant="outline" size="sm">
                Painel Admin
              </Button>
            </Link>
          )}
          <Link href="/indicacoes">
            <Button size="sm">Nova indicação</Button>
          </Link>
          <Link href="/dashboard/orcamentos/novo">
            <Button variant="secondary" size="sm">Solicitar Orçamento</Button>
          </Link>
          <QuickIndicationDialog />
        </div>
      </header>

      {metricsError ? (
        <p className="text-destructive text-sm">{metricsError}</p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.title} className={isLoadingMetrics ? "animate-pulse" : ""}>
            <CardHeader>
              <CardDescription>{card.subtitle}</CardDescription>
              <CardTitle className={card.accent}>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-foreground">
                {formatNumber(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {brandCards.map((card) => (
          <Card key={card.brand} className={isLoadingMetrics ? "animate-pulse" : ""}>
            <CardHeader>
              <CardDescription>{card.subtitle}</CardDescription>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-foreground">
                {formatNumber(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Processo das indicações</CardTitle>
              <CardDescription>
                Acompanhe cada etapa do Rental sem precisar acessar o CRM.
              </CardDescription>
            </div>
            <Link href="/indicacoes">
              <Button variant="outline" size="sm">Ver todas</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {metrics.recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma indicação encontrada para acompanhamento.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.recentes.map((indicacao) => {
                  const status =
                    statusBadgeConfig[indicacao.status] ?? statusBadgeConfig.EM_ANALISE
                  const progress = getJourneyProgress(indicacao)

                  return (
                    <div
                      key={indicacao.id}
                      className="rounded-lg border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{indicacao.nome}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                          <span>Etapa: {getCurrentStepLabel(indicacao)}</span>
                          <span>Atualizado: {formatDateTime(indicacao.updated_at)}</span>
                        </div>
                        <div className="pt-1">
                          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${indicacao.status === "REJEITADA" ? "bg-rose-500" : "bg-emerald-500"}`}
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {progress.done} de {progress.total} etapas concluídas
                          </p>
                        </div>
                      </div>
                      <IndicationProgressDialog indication={indicacao} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Movimentações da equipe</CardTitle>
            <CardDescription>
              Últimas ações registradas em tarefas, documentação e Energisa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há movimentações registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {metrics.activity.slice(0, 10).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <Badge variant="outline" className="text-[11px]">
                        {event.kind === "ENERGISA" ? "Energisa" : event.kind === "INTERACTION" ? "Equipe" : "Marco"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cliente: {event.indicacao_nome} • Registrado por: {event.actor}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Última indicação</CardTitle>
            <CardDescription>
              {formattedUltimaIndicacao === "—"
                ? "Cadastre uma indicação para começar a acompanhar aqui."
                : `Enviada em ${formattedUltimaIndicacao}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {isLoadingMetrics
              ? "Atualizando métricas..."
              : formattedUltimaIndicacao === "—"
                ? "Assim que uma nova indicação for registrada, você verá os detalhes aqui."
                : "Acompanhe o status em tempo real na aba de indicações."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
            <CardDescription>
              Estágio atual das integrações e melhorias planejadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>- Implementação do wizard PF/PJ com upload de documentos.</p>
            <p>- Alertas por email quando uma indicação mudar de status.</p>
            <p>- Painel com metas de conversão e funil de vendas.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-1">
        <RentalCalculator />
      </section>
    </div>
  )
}
