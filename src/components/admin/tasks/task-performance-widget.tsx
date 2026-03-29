// src/components/admin/tasks/task-performance-widget.tsx
import Link from "next/link"
import { Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WeeklyPerformanceSummary } from "@/services/task-benchmark-service"

export type { WeeklyPerformanceSummary }

export function TaskPerformanceWidget({
    summary,
}: {
    summary: WeeklyPerformanceSummary
}) {
    return (
        <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-green-900">
                    <Activity className="h-4 w-4 text-green-700" />
                    Seu desempenho esta semana
                </CardTitle>
                <Link
                    href="/dashboard/arena"
                    className="text-xs text-green-700 hover:underline"
                >
                    Ver histórico completo →
                </Link>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="mb-3 grid grid-cols-3 divide-x divide-green-100">
                    <div className="pr-4 text-center">
                        <p className="text-xl font-bold text-green-700">{summary.withinDeadline}</p>
                        <p className="text-xs text-muted-foreground">Dentro do prazo</p>
                    </div>
                    <div className="px-4 text-center">
                        <p className="text-xl font-bold text-destructive">{summary.outsideDeadline}</p>
                        <p className="text-xs text-muted-foreground">Fora do prazo</p>
                    </div>
                    <div className="pl-4 text-center">
                        <p className="text-xl font-bold text-amber-600">{summary.rate}%</p>
                        <p className="text-xs text-muted-foreground">Taxa no prazo</p>
                    </div>
                </div>
                {summary.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {summary.badges.map((badge) => (
                            <Badge key={badge} variant="secondary" className="text-xs">
                                {badge}
                            </Badge>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
