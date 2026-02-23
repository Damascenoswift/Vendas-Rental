"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { WorkCard } from "@/services/work-cards-service"
import { differenceInBusinessDays } from "@/lib/business-days"

function getStatusLabel(status: WorkCard["status"]) {
    if (status === "FECHADA") return "Obra Fechada"
    if (status === "PARA_INICIAR") return "Para Iniciar"
    return "Em Andamento"
}

function formatBusinessDaysLabel(totalDays: number) {
    return `${totalDays} ${totalDays === 1 ? "dia útil" : "dias úteis"}`
}

function formatDateLabel(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
}

export function WorkCardItem({
    item,
    onClick,
}: {
    item: WorkCard
    onClick?: () => void
}) {
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        const timerId = window.setInterval(() => setNow(new Date()), 60_000)
        return () => window.clearInterval(timerId)
    }, [])

    const progress = item.progress ?? {
        projeto_total: 0,
        projeto_done: 0,
        execucao_total: 0,
        execucao_done: 0,
    }

    const projectPercent = progress.projeto_total > 0
        ? Math.round((progress.projeto_done / progress.projeto_total) * 100)
        : 0

    const executionPercent = progress.execucao_total > 0
        ? Math.round((progress.execucao_done / progress.execucao_total) * 100)
        : 0

    const deadlineInfo = useMemo(() => {
        if (!item.execution_deadline_at || !item.execution_deadline_business_days) return null

        const deadlineDate = new Date(item.execution_deadline_at)
        if (Number.isNaN(deadlineDate.getTime())) return null

        const remainingBusinessDays = differenceInBusinessDays(now, deadlineDate)
        const plannedDaysLabel = formatBusinessDaysLabel(item.execution_deadline_business_days)
        const deadlineDateLabel = formatDateLabel(item.execution_deadline_at)

        if (remainingBusinessDays > 0) {
            return {
                variant: "secondary" as const,
                backgroundClass: "bg-amber-50 border-b border-amber-100",
                label: `Entrega em ${formatBusinessDaysLabel(remainingBusinessDays)}`,
                meta: `Prazo: ${plannedDaysLabel} · Previsto: ${deadlineDateLabel}`,
            }
        }

        if (remainingBusinessDays === 0) {
            return {
                variant: "outline" as const,
                backgroundClass: "bg-blue-50 border-b border-blue-100",
                label: "Entrega hoje",
                meta: `Prazo: ${plannedDaysLabel} · Previsto: ${deadlineDateLabel}`,
            }
        }

        const delayedBusinessDays = Math.abs(remainingBusinessDays)
        return {
            variant: "destructive" as const,
            backgroundClass: "bg-red-50 border-b border-red-100",
            label: `Atrasada ${formatBusinessDaysLabel(delayedBusinessDays)}`,
            meta: `Prazo: ${plannedDaysLabel} · Previsto: ${deadlineDateLabel}`,
        }
    }, [item.execution_deadline_at, item.execution_deadline_business_days, now])

    return (
        <Card
            className="cursor-pointer overflow-hidden border border-slate-200 bg-white transition-shadow hover:shadow-md"
            onClick={onClick}
        >
            {deadlineInfo ? (
                <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${deadlineInfo.backgroundClass}`}>
                    <Badge variant={deadlineInfo.variant}>{deadlineInfo.label}</Badge>
                    <span className="text-[11px] text-muted-foreground">{deadlineInfo.meta}</span>
                </div>
            ) : null}

            <div className="h-32 w-full bg-slate-100">
                {item.cover_image_url ? (
                    <img
                        src={item.cover_image_url}
                        alt={`Capa da obra ${item.title ?? item.id}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Sem capa
                    </div>
                )}
            </div>

            <CardHeader className="space-y-2 p-3 pb-0">
                <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{getStatusLabel(item.status)}</Badge>
                    <Badge variant="secondary" className="uppercase">{item.brand}</Badge>
                </div>

                <div>
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                        {item.title || "Obra sem título"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Instalação: {item.codigo_instalacao || item.installation_key}
                    </p>
                </div>
            </CardHeader>

            <CardContent className="space-y-3 p-3 pt-3">
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Projeto</span>
                        <span>{progress.projeto_done}/{progress.projeto_total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                        <div
                            className="h-1.5 rounded-full bg-blue-600"
                            style={{ width: `${projectPercent}%` }}
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Execução</span>
                        <span>{progress.execucao_done}/{progress.execucao_total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                        <div
                            className="h-1.5 rounded-full bg-emerald-600"
                            style={{ width: `${executionPercent}%` }}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
