"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { BarChart3, CircleCheckBig, Hourglass, Layers, Sparkles } from "lucide-react"

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
import { hasSalesAccess } from "@/lib/sales-access"
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
  pendentesAssinatura: RecentIndicacao[]
  assinadasRecentes: RecentIndicacao[]
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
  pendentesAssinatura: [],
  assinadasRecentes: [],
  activity: [],
}

const getTimestampValue = (value?: string | null) => {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const statusBadgeConfig: Record<string, { label: string; className: string }> = {
  EM_ANALISE: { label: "Em análise", className: "bg-amber-100/80 text-amber-700" },
  AGUARDANDO_ASSINATURA: { label: "Aguardando assinatura", className: "bg-sky-100/80 text-sky-700" },
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
  const canAccessTutorials = hasSalesAccess({
    role: profile?.role,
    sales_access: profile?.salesAccess ?? null,
  })

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

        const pendingSignatureRows = rentalRows
          .filter((row) => !row.assinada_em)
          .filter((row) => row.status !== "CONCLUIDA" && row.status !== "REJEITADA")
          .sort((a, b) => {
            const aCreatedAt = getTimestampValue(a.created_at)
            const bCreatedAt = getTimestampValue(b.created_at)
            if (aCreatedAt !== bCreatedAt) return aCreatedAt - bCreatedAt
            return getTimestampValue(a.updated_at) - getTimestampValue(b.updated_at)
          })
          .slice(0, 10)

        const recentlySignedRows = rentalRows
          .filter((row) => Boolean(row.assinada_em) || row.status === "CONCLUIDA")
          .sort((a, b) => {
            const aSignedAt = getTimestampValue(a.assinada_em || a.updated_at)
            const bSignedAt = getTimestampValue(b.assinada_em || b.updated_at)
            return bSignedAt - aSignedAt
          })
          .slice(0, 10)

        setMetrics({
          total: rows.length,
          porStatus,
          ultimaIndicacao: rows[0]?.created_at ?? null,
          porMarca,
          pendentesAssinatura: pendingSignatureRows,
          assinadasRecentes: recentlySignedRows,
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
  const todayReference = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    []
  )

  const brandCards = useMemo(
    () =>
      allowedBrands.map((brand) => ({
        brand,
        title: `Indicações ${brandLabels[brand as keyof typeof brandLabels]}`,
        subtitle: `Total enviado para ${brandLabels[brand as keyof typeof brandLabels]}`,
        value: metrics.porMarca[brand as keyof typeof metrics.porMarca],
      })),
    [allowedBrands, metrics]
  )

  const metricCards = useMemo(
    () => [
      {
        title: "Total de indicações",
        value: metrics.total,
        subtitle: "Todo o histórico registrado",
        valueClass: "text-foreground",
        icon: Layers,
        toneClass: "from-slate-500/15 to-slate-500/5 text-slate-700 dark:text-slate-200",
      },
      {
        title: "Em análise",
        value: metrics.porStatus.EM_ANALISE,
        subtitle: "Aguardando avaliação",
        valueClass: "text-amber-600",
        icon: Hourglass,
        toneClass: "from-amber-500/22 to-amber-500/5 text-amber-700 dark:text-amber-300",
      },
      {
        title: "Aprovadas",
        value: metrics.porStatus.APROVADA,
        subtitle: "Próximas etapas em andamento",
        valueClass: "text-emerald-600",
        icon: CircleCheckBig,
        toneClass: "from-emerald-500/22 to-emerald-500/5 text-emerald-700 dark:text-emerald-300",
      },
      {
        title: "Concluídas",
        value: metrics.porStatus.CONCLUIDA,
        subtitle: "Processos finalizados",
        valueClass: "text-sky-600",
        icon: BarChart3,
        toneClass: "from-sky-500/22 to-sky-500/5 text-sky-700 dark:text-sky-300",
      },
    ],
    [metrics]
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="glass-surface relative overflow-hidden rounded-3xl border border-border/70 p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(45,212,191,0.15),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(56,189,248,0.12),transparent_42%)]" />
        <div className="relative space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Resumo diário
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Dashboard
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Olá, {displayName}. Aqui você acompanha a evolução das suas indicações.
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
            Atualizado em {todayReference}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
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
            <Link
              href={
                ['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(profile?.role ?? '')
                  ? "/admin/orcamentos/novo"
                  : "/dashboard/orcamentos/novo"
              }
            >
              <Button variant="secondary" size="sm">Solicitar Orçamento</Button>
            </Link>
            <QuickIndicationDialog />
            {canAccessTutorials ? (
              <Link href="/dashboard/tutorials" className="sm:ml-auto">
                <Button variant="outline" size="sm">Tutoriais</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {metricsError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {metricsError}
        </p>
      ) : null}

      <section className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <Card key={card.title} className={isLoadingMetrics ? "animate-pulse" : "animate-rise-in"}>
            <CardHeader className="pb-0">
              <div className={card.toneClass + " inline-flex h-9 w-9 items-center justify-center rounded-xl border border-current/20 bg-gradient-to-br"}>
                <card.icon className="h-4 w-4" />
              </div>
              <CardDescription>{card.subtitle}</CardDescription>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-semibold ${card.valueClass}`}>
                {formatNumber(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {brandCards.map((card) => (
          <Card key={card.brand} className={isLoadingMetrics ? "animate-pulse" : "animate-rise-in"}>
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

      <section className="grid gap-3 sm:gap-4">
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
            {metrics.pendentesAssinatura.length === 0 && metrics.assinadasRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma indicação encontrada para acompanhamento.
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Em andamento desde a indicação</h3>
                      <p className="text-xs text-muted-foreground">
                        Mostra o processo desde o cadastro inicial até a assinatura.
                      </p>
                    </div>
                    <Badge variant="secondary">{metrics.pendentesAssinatura.length}</Badge>
                  </div>

                  {metrics.pendentesAssinatura.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-background/50 p-4">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma indicação em andamento no momento.
                      </p>
                    </div>
                  ) : (
                    metrics.pendentesAssinatura.map((indicacao) => {
                      const status =
                        statusBadgeConfig[indicacao.status] ?? statusBadgeConfig.EM_ANALISE
                      const progress = getJourneyProgress(indicacao)

                      return (
                        <div
                          key={indicacao.id}
                          className="rounded-xl border border-border/70 bg-background/65 p-3 shadow-sm transition-all hover:border-primary/25 hover:shadow-md md:flex md:flex-row md:items-center md:justify-between"
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{indicacao.nome}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={status.className}>
                                {status.label}
                              </Badge>
                              <span>Etapa: {getCurrentStepLabel(indicacao)}</span>
                              <span>
                                Indicado: {formatDateTime(indicacao.created_at)}
                              </span>
                              <span>
                                Contrato enviado: {indicacao.contrato_enviado_em ? formatDateTime(indicacao.contrato_enviado_em) : "—"}
                              </span>
                            </div>
                            <div className="pt-1">
                              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all ${indicacao.status === "REJEITADA" ? "bg-rose-500" : "bg-emerald-500"}`}
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
                    })
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Últimos 10 assinados</h3>
                      <p className="text-xs text-muted-foreground">
                        Contratos assinados recentemente para seguir cobrando o cliente.
                      </p>
                    </div>
                    <Badge variant="secondary">{metrics.assinadasRecentes.length}</Badge>
                  </div>

                  {metrics.assinadasRecentes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-background/50 p-4">
                      <p className="text-sm text-muted-foreground">
                        Ainda não há contratos assinados recentes.
                      </p>
                    </div>
                  ) : (
                    metrics.assinadasRecentes.map((indicacao) => {
                      const status =
                        statusBadgeConfig[indicacao.status] ?? statusBadgeConfig.EM_ANALISE
                      const progress = getJourneyProgress(indicacao)

                      return (
                        <div
                          key={indicacao.id}
                          className="rounded-xl border border-border/70 bg-background/65 p-3 shadow-sm transition-all hover:border-primary/25 hover:shadow-md md:flex md:flex-row md:items-center md:justify-between"
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{indicacao.nome}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={status.className}>
                                {status.label}
                              </Badge>
                              <span>Etapa: {getCurrentStepLabel(indicacao)}</span>
                              <span>
                                Assinado: {indicacao.assinada_em ? formatDateTime(indicacao.assinada_em) : formatDateTime(indicacao.updated_at)}
                              </span>
                            </div>
                            <div className="pt-1">
                              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all ${indicacao.status === "REJEITADA" ? "bg-rose-500" : "bg-emerald-500"}`}
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
                    })
                  )}
                </div>
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
                  <div key={event.id} className="rounded-xl border border-border/70 bg-background/60 p-3 shadow-sm">
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
          <CardContent className="space-y-2 text-sm text-muted-foreground">
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
