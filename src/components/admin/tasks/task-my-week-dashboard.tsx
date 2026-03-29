"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, CalendarClock, CirclePlay, HardHat, RefreshCw, UserCheck, Users } from "lucide-react"

import type { ActiveWorkSummary, TaskPersonalSummaryTask, TaskPersonalWeeklySummary } from "@/services/task-personal-weekly-service"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { TaskTimeBar } from "./task-time-bar"
import { TaskPerformanceWidget, type WeeklyPerformanceSummary } from "./task-performance-widget"

type TaskMyWeekDashboardProps = {
    summary: TaskPersonalWeeklySummary | null
    activeWorks?: ActiveWorkSummary[]
    performanceSummary?: WeeklyPerformanceSummary | null
    taskBenchmarkDays?: Record<string, { expected: number; elapsed: number }>
}

function formatDepartmentLabel(department: string) {
    if (department === "vendas") return "Vendas"
    if (department === "cadastro") return "Cadastro"
    if (department === "energia") return "Energia"
    if (department === "juridico") return "Jurídico"
    if (department === "financeiro") return "Financeiro"
    if (department === "ti") return "TI"
    if (department === "diretoria") return "Diretoria"
    if (department === "obras") return "Obras"
    return "Outro"
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Cuiaba",
    }).format(parsed)
}

function formatDate(value: string | null | undefined) {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Cuiaba",
    }).format(parsed)
}

function formatStatusLabel(status: string) {
    if (status === "TODO") return "A Fazer"
    if (status === "IN_PROGRESS") return "Em Andamento"
    if (status === "REVIEW") return "Revisão"
    if (status === "BLOCKED") return "Bloqueada"
    if (status === "DONE") return "Concluída"
    return status
}

function TaskQuickList({
    title,
    tasks,
    emptyLabel,
    buildTaskHref,
    taskBenchmarkDays,
}: {
    title: string
    tasks: TaskPersonalSummaryTask[]
    emptyLabel: string
    buildTaskHref: (taskId: string) => string
    taskBenchmarkDays?: Record<string, { expected: number; elapsed: number }>
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{emptyLabel}</p>
                ) : (
                    tasks.slice(0, 8).map((task) => (
                        <div key={task.taskId} className="rounded-md border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium leading-tight">{task.title}</p>
                                <Badge variant="outline">{formatStatusLabel(task.status)}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatDepartmentLabel(task.department)}</span>
                                <span>•</span>
                                <span>Prioridade {task.priority}</span>
                                <span>•</span>
                                <span>Prazo: {formatDate(task.dueDate)}</span>
                            </div>
                            {taskBenchmarkDays?.[task.taskId] && (
                                <TaskTimeBar
                                    elapsedDays={taskBenchmarkDays[task.taskId].elapsed}
                                    expectedDays={taskBenchmarkDays[task.taskId].expected}
                                    className="mt-1"
                                />
                            )}
                            <div className="mt-2">
                                <Button asChild size="sm" variant="outline">
                                    <Link href={buildTaskHref(task.taskId)}>Abrir tarefa</Link>
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    )
}

export function TaskMyWeekDashboard({ summary, activeWorks, performanceSummary, taskBenchmarkDays }: TaskMyWeekDashboardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const buildTaskHref = useCallback(
        (taskId: string) => {
            const params = new URLSearchParams(searchParams.toString())
            params.set("view", "board")
            params.set("scope", "mine")
            params.set("openTask", taskId)
            const query = params.toString()
            return query ? `${pathname}?${query}` : pathname
        },
        [pathname, searchParams]
    )

    useEffect(() => {
        const timer = window.setInterval(() => {
            router.refresh()
        }, 75000)

        return () => {
            window.clearInterval(timer)
        }
    }, [router])

    const oldestBlockedTasks = useMemo(
        () => summary?.blockedByDependency.oldestBlockedTasks.slice(0, 8) ?? [],
        [summary]
    )

    if (!summary) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Minha Semana</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Não foi possível carregar seu resumo pessoal neste momento.
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Atualizar
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <Card className="border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <p className="text-sm font-semibold text-blue-900">Minha Semana</p>
                        <p className="text-xs text-blue-800/90">
                            Janela: {summary.weekStartDate} até {summary.weekEndDate} ({summary.timeZone})
                        </p>
                        <p className="text-xs text-blue-800/75">Atualizado em {formatDateTime(summary.generatedAt)}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Atualizar
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Mais importantes</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.cards.maisImportantes}</div>
                        <p className="text-xs text-muted-foreground">Priorizadas por urgência, prazo e atraso</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Em andamento</CardTitle>
                        <CirclePlay className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-700">{summary.cards.emAndamento}</div>
                        <p className="text-xs text-muted-foreground">Status Em Andamento ou Revisão</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Travadas</CardTitle>
                        <Users className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-700">{summary.cards.travadas}</div>
                        <p className="text-xs text-muted-foreground">Com bloqueio formal aberto</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Vencendo/atrasadas</CardTitle>
                        <CalendarClock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-700">{summary.cards.vencendoOuAtrasadas}</div>
                        <p className="text-xs text-muted-foreground">Dentro da semana atual ou já vencidas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Obras ativas</CardTitle>
                        <HardHat className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-700">{activeWorks?.length ?? 0}</div>
                        <p className="text-xs text-muted-foreground">Obras em andamento atribuídas a você</p>
                    </CardContent>
                </Card>
            </div>

            {/* Obras em andamento */}
            {activeWorks && activeWorks.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <HardHat className="h-4 w-4 text-muted-foreground" />
                            Obras em andamento
                        </CardTitle>
                        <Badge variant="secondary">{activeWorks.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {activeWorks.map((obra) => (
                            <div
                                key={obra.id}
                                className={cn(
                                    "rounded-md border p-3",
                                    obra.is_overdue ? "border-l-4 border-l-destructive" : "border-l-4 border-l-green-500"
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium">{obra.title ?? obra.work_address ?? obra.id}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            Prazo: {obra.execution_deadline_at ? formatDate(obra.execution_deadline_at) : "—"}
                                        </p>
                                    </div>
                                    {obra.is_overdue ? (
                                        <Badge variant="destructive" className="text-xs">Atrasada</Badge>
                                    ) : (
                                        <Badge variant="secondary" className="text-xs text-green-700">No prazo</Badge>
                                    )}
                                </div>
                                {obra.execution_deadline_business_days != null && obra.elapsed_business_days != null && (
                                    <div className="mt-2">
                                        <TaskTimeBar
                                            elapsedDays={Math.max(0, obra.elapsed_business_days)}
                                            expectedDays={obra.execution_deadline_business_days}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                <TaskQuickList
                    title="Mais importantes da semana"
                    tasks={summary.importantTasks}
                    emptyLabel="Nenhuma tarefa prioritária para esta semana."
                    buildTaskHref={buildTaskHref}
                />
                <TaskQuickList
                    title="Em andamento"
                    tasks={summary.inProgressTasks}
                    emptyLabel="Nenhuma tarefa em andamento neste momento."
                    buildTaskHref={buildTaskHref}
                    taskBenchmarkDays={taskBenchmarkDays}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Travadas por pessoa</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.blockedByDependency.byUser.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum gargalo por pessoa.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Pessoa</TableHead>
                                        <TableHead className="text-center">Tarefas</TableHead>
                                        <TableHead className="text-center">Bloqueios</TableHead>
                                        <TableHead className="text-center">Mais antigo</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.blockedByDependency.byUser.map((group) => (
                                        <TableRow key={`user-${group.ownerKey}`}>
                                            <TableCell className="font-medium">{group.ownerLabel}</TableCell>
                                            <TableCell className="text-center">{group.blockedTasks}</TableCell>
                                            <TableCell className="text-center">{group.blockers}</TableCell>
                                            <TableCell className="text-center">{formatDateTime(group.oldestBlockerOpenedAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Travadas por setor</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.blockedByDependency.byDepartment.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum gargalo por setor.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setor</TableHead>
                                        <TableHead className="text-center">Tarefas</TableHead>
                                        <TableHead className="text-center">Bloqueios</TableHead>
                                        <TableHead className="text-center">Mais antigo</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.blockedByDependency.byDepartment.map((group) => (
                                        <TableRow key={`department-${group.ownerKey}`}>
                                            <TableCell className="font-medium">{group.ownerLabel}</TableCell>
                                            <TableCell className="text-center">{group.blockedTasks}</TableCell>
                                            <TableCell className="text-center">{group.blockers}</TableCell>
                                            <TableCell className="text-center">{formatDateTime(group.oldestBlockerOpenedAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <TaskQuickList
                title="Tarefas bloqueadas mais antigas"
                tasks={oldestBlockedTasks}
                emptyLabel="Não há tarefas bloqueadas sob sua responsabilidade."
                buildTaskHref={buildTaskHref}
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <TaskQuickList
                    title="Meu papel: Responsável"
                    tasks={summary.tasksByRole.assignee}
                    emptyLabel="Você não está responsável por tarefas abertas."
                    buildTaskHref={buildTaskHref}
                />
                <TaskQuickList
                    title="Meu papel: Observador"
                    tasks={summary.tasksByRole.observer}
                    emptyLabel="Você não observa tarefas abertas no momento."
                    buildTaskHref={buildTaskHref}
                />
                <TaskQuickList
                    title="Meu papel: Criador"
                    tasks={summary.tasksByRole.creator}
                    emptyLabel="Você não criou tarefas abertas no momento."
                    buildTaskHref={buildTaskHref}
                />
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Checklist adicional pendente</CardTitle>
                    <Badge variant="secondary">{summary.pendingChecklistItems.length}</Badge>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {summary.pendingChecklistItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nenhum checklist adicional pendente sob sua responsabilidade.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tarefa</TableHead>
                                    <TableHead>Checklist</TableHead>
                                    <TableHead>Fase</TableHead>
                                    <TableHead className="text-center">Status tarefa</TableHead>
                                    <TableHead className="text-center">Prazo checklist</TableHead>
                                    <TableHead className="text-center">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.pendingChecklistItems.map((item) => (
                                    <TableRow key={item.checklistItemId}>
                                        <TableCell className="font-medium">
                                            <div>
                                                <p>{item.task.title}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDepartmentLabel(item.task.department)} • Prioridade {item.task.priority}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>{item.checklistTitle}</TableCell>
                                        <TableCell>{item.phase || "-"}</TableCell>
                                        <TableCell className="text-center">{formatStatusLabel(item.task.status)}</TableCell>
                                        <TableCell className="text-center">{formatDate(item.dueDate)}</TableCell>
                                        <TableCell className="text-center">
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={buildTaskHref(item.task.taskId)}>
                                                    <UserCheck className="mr-2 h-4 w-4" />
                                                    Abrir tarefa
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {performanceSummary && (
                <TaskPerformanceWidget summary={performanceSummary} />
            )}
        </div>
    )
}
