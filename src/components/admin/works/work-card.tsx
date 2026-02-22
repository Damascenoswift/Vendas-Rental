"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { WorkCard } from "@/services/work-cards-service"

function getStatusLabel(status: WorkCard["status"]) {
    if (status === "FECHADA") return "Obra Fechada"
    if (status === "PARA_INICIAR") return "Para Iniciar"
    return "Em Andamento"
}

export function WorkCardItem({
    item,
    onClick,
}: {
    item: WorkCard
    onClick?: () => void
}) {
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

    return (
        <Card
            className="cursor-pointer overflow-hidden border border-slate-200 bg-white transition-shadow hover:shadow-md"
            onClick={onClick}
        >
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
