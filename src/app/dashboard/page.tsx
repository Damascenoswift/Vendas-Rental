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
import { useAuthSession } from "@/hooks/use-auth-session"
import type { Brand } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { QuickIndicationDialog } from "@/components/forms/quick-indication-dialog"

type StatusKey = "EM_ANALISE" | "APROVADA" | "REJEITADA" | "CONCLUIDA"

const brandLabels: Record<Brand, string> = {
  rental: "Rental",
  dorata: "Dorata",
}

type DashboardMetrics = {
  total: number
  porStatus: Record<StatusKey, number>
  ultimaIndicacao: string | null
  porMarca: Record<Brand, number>
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
        status: StatusKey
        created_at: string
        marca: Brand
      }

      let query = supabase
        .from("indicacoes")
        .select("id, status, created_at, marca")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

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
          porStatus[row.status] += 1
          porMarca[row.marca] += 1
        })

        setMetrics({
          total: rows.length,
          porStatus,
          ultimaIndicacao: rows[0]?.created_at ?? null,
          porMarca,
        })
        setMetricsError(null)
      }

      setIsLoadingMetrics(false)
    },
    [userId, allowedBrands]
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
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadMetrics({ showLoading: false })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, loadMetrics])

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
          <Link href="/indicacoes">
            <Button size="sm">Nova indicação</Button>
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
    </div>
  )
}
