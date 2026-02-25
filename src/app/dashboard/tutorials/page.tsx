"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, PlayCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthSession } from "@/hooks/use-auth-session"
import { hasSalesAccess } from "@/lib/sales-access"
import { supabase } from "@/lib/supabase"

type TutorialRow = {
  id: string
  title: string
  summary: string | null
  module: string
  video_url: string
  tags: string[] | null
  sort_order: number
  updated_at: string
}

type FaqRow = {
  id: string
  module: string
  question: string
  priority: number
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("pt-BR")
}

export default function DashboardTutorialsPage() {
  const { status, profile } = useAuthSession()
  const [tutorials, setTutorials] = useState<TutorialRow[]>([])
  const [faqHighlights, setFaqHighlights] = useState<FaqRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canAccessTutorials = useMemo(
    () =>
      hasSalesAccess({
        role: profile?.role,
        sales_access: profile?.salesAccess ?? null,
      }),
    [profile?.role, profile?.salesAccess]
  )

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (status === "loading") return

      if (!canAccessTutorials) {
        if (!mounted) return
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      const [tutorialsResult, faqResult] = await Promise.all([
        supabase
          .from("knowledge_tutorials")
          .select("id, title, summary, module, video_url, tags, sort_order, updated_at")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("updated_at", { ascending: false }),
        supabase
          .from("knowledge_faq")
          .select("id, module, question, priority")
          .eq("is_active", true)
          .order("priority", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(8),
      ])

      if (!mounted) return

      if (tutorialsResult.error) {
        setError(tutorialsResult.error.message)
        setTutorials([])
        setFaqHighlights([])
        setIsLoading(false)
        return
      }

      if (faqResult.error) {
        setError(faqResult.error.message)
      }

      setTutorials((tutorialsResult.data ?? []) as TutorialRow[])
      setFaqHighlights((faqResult.data ?? []) as FaqRow[])
      setIsLoading(false)
    }

    void load()

    return () => {
      mounted = false
    }
  }, [canAccessTutorials, status])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <Badge variant="secondary">Base de Ajuda</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Tutoriais</h1>
        <p className="text-muted-foreground">
          Vídeos e perguntas frequentes para acelerar seu atendimento e tirar dúvidas do fluxo.
        </p>
      </header>

      {!canAccessTutorials && status !== "loading" ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso indisponível</CardTitle>
            <CardDescription>
              Seu perfil não possui acesso aos tutoriais. Solicite a liberação para o time gestor.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">Erro ao carregar conteúdo: {error}</p> : null}

      {canAccessTutorials ? (
        <section className="grid gap-4 md:grid-cols-2">
          {isLoading
            ? Array.from({ length: 4 }).map((_, idx) => (
                <Card key={`tutorial-skeleton-${idx}`} className="animate-pulse">
                  <CardHeader>
                    <CardDescription>Carregando...</CardDescription>
                    <CardTitle>Buscando tutoriais</CardTitle>
                  </CardHeader>
                </Card>
              ))
            : tutorials.map((tutorial) => (
                <Card key={tutorial.id}>
                  <CardHeader>
                    <CardDescription className="capitalize">{tutorial.module}</CardDescription>
                    <CardTitle>{tutorial.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {tutorial.summary || "Sem descrição cadastrada para este tutorial."}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(tutorial.tags ?? []).slice(0, 4).map((tag) => (
                        <Badge key={`${tutorial.id}-${tag}`} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Atualizado em {formatDate(tutorial.updated_at)}
                      </span>
                      <a href={tutorial.video_url} target="_blank" rel="noreferrer noopener">
                        <Button size="sm" className="gap-1">
                          <PlayCircle className="h-4 w-4" />
                          Ver vídeo
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </section>
      ) : null}

      {canAccessTutorials && !isLoading ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Perguntas frequentes em destaque</CardTitle>
              <CardDescription>
                Esses itens também alimentam as respostas do agente de ajuda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {faqHighlights.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma FAQ cadastrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {faqHighlights.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium text-foreground">{item.question}</p>
                      <p className="text-xs text-muted-foreground capitalize">Módulo: {item.module}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  )
}
