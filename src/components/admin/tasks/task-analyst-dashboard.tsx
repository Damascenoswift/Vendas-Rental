import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatHoursToDaysHours } from "@/services/task-analyst-utils"
import type { TaskAnalystDashboardSummary } from "@/services/task-analyst-service"
import Link from "next/link"

type TaskAnalystDashboardProps = {
    summary: TaskAnalystDashboardSummary | null
    selectedPeriodDays?: number
    periodOptions?: Array<{ days: number; href: string }>
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

function formatNumber(value: number | null) {
    return formatHoursToDaysHours(value)
}

function formatPercent(value: number) {
    return `${Math.round(value * 100)}%`
}

function formatRate(value: number | null) {
    if (value === null || Number.isNaN(value)) return "-"
    return formatPercent(value)
}

export function TaskAnalystDashboard({
    summary,
    selectedPeriodDays = 90,
    periodOptions = [],
}: TaskAnalystDashboardProps) {
    if (!summary) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Analista IA</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Dados do analista indisponíveis. Verifique se as migrations do módulo foram aplicadas.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Abertas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.openTasks}</div>
                        <p className="text-xs text-muted-foreground">Total de tarefas não concluídas.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Atrasadas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-700">{summary.overdueOpenTasks}</div>
                        <p className="text-xs text-muted-foreground">Com prazo vencido.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Sem Responsável</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700">{summary.withoutAssignee}</div>
                        <p className="text-xs text-muted-foreground">Precisam de definição de owner.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Bloqueios Ativos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-700">{summary.blockedTasks.length}</div>
                        <p className="text-xs text-muted-foreground">Bloqueios formais em aberto.</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tempo Médio para 1º Avanço</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(summary.avgHoursToFirstProgress)}</div>
                        <p className="text-xs text-muted-foreground">Baseado em eventos de progresso registrados.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Tempo Médio até Conclusão</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(summary.avgHoursToCompletion)}</div>
                        <p className="text-xs text-muted-foreground">Média de tarefas concluídas recentes.</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">Performance Operacional ({summary.executionKpis.periodDays} dias)</CardTitle>
                        {periodOptions.length > 0 ? (
                            <div className="flex items-center gap-2">
                                {periodOptions.map((option) => (
                                    <Button
                                        key={option.days}
                                        variant={option.days === selectedPeriodDays ? "default" : "outline"}
                                        size="sm"
                                        asChild
                                    >
                                        <Link href={option.href}>{option.days} dias</Link>
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">TODO → Em andamento</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(summary.executionKpis.avgTodoToInProgressHours)}</div>
                                <p className="text-xs text-muted-foreground">Média para iniciar execução.</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Conclusão (Bruto)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(summary.executionKpis.avgInProgressToDoneGrossHours)}</div>
                                <p className="text-xs text-muted-foreground">Do início à conclusão sem descontos.</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Conclusão (Líquido)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(summary.executionKpis.avgInProgressToDoneNetHours)}</div>
                                <p className="text-xs text-muted-foreground">Descontando janela em bloqueio formal.</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Até Bloquear</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatNumber(summary.executionKpis.avgAssigneeToBlockerHours)}</div>
                                <p className="text-xs text-muted-foreground">Tempo com responsável até abrir bloqueio.</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">No prazo</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-emerald-700">{summary.deadlineHealth.onTime}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Em risco</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-amber-700">{summary.deadlineHealth.inRisk}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Atrasada</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-700">{summary.deadlineHealth.late}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Sem prazo</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-muted-foreground">{summary.deadlineHealth.withoutDueDate}</div>
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Performance por Pessoa</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.performanceByUser.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sem dados suficientes no período.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Pessoa</TableHead>
                                        <TableHead>Setor</TableHead>
                                        <TableHead className="text-center">TODO→AND</TableHead>
                                        <TableHead className="text-center">Bruto</TableHead>
                                        <TableHead className="text-center">Líquido</TableHead>
                                        <TableHead className="text-center">Até bloqueio</TableHead>
                                        <TableHead className="text-center">No prazo</TableHead>
                                        <TableHead className="text-center">Em risco</TableHead>
                                        <TableHead className="text-center">Atras. abertas</TableHead>
                                        <TableHead className="text-center">Concl. atrasadas</TableHead>
                                        <TableHead className="text-center">Amostras</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.performanceByUser.map((row) => (
                                        <TableRow key={row.userId}>
                                            <TableCell className="font-medium">{row.userName}</TableCell>
                                            <TableCell>{formatDepartmentLabel(row.department)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgTodoToInProgressHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgInProgressToDoneGrossHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgInProgressToDoneNetHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgAssigneeToBlockerHours)}</TableCell>
                                            <TableCell className="text-center">{formatRate(row.onTimeRate)}</TableCell>
                                            <TableCell className="text-center">{row.inRiskOpen}</TableCell>
                                            <TableCell className="text-center">{row.overdueOpen}</TableCell>
                                            <TableCell className="text-center">{row.completedLate}</TableCell>
                                            <TableCell className="text-center">
                                                {row.samples.start}/{row.samples.completion}/{row.samples.blocker}/{row.samples.deadline}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Performance por Setor</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.performanceByDepartment.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sem dados suficientes no período.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setor</TableHead>
                                        <TableHead className="text-center">TODO→AND</TableHead>
                                        <TableHead className="text-center">Bruto</TableHead>
                                        <TableHead className="text-center">Líquido</TableHead>
                                        <TableHead className="text-center">Até bloqueio</TableHead>
                                        <TableHead className="text-center">No prazo</TableHead>
                                        <TableHead className="text-center">Em risco</TableHead>
                                        <TableHead className="text-center">Atras. abertas</TableHead>
                                        <TableHead className="text-center">Concl. atrasadas</TableHead>
                                        <TableHead className="text-center">Amostras</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.performanceByDepartment.map((row) => (
                                        <TableRow key={row.department}>
                                            <TableCell className="font-medium">{formatDepartmentLabel(row.department)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgTodoToInProgressHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgInProgressToDoneGrossHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgInProgressToDoneNetHours)}</TableCell>
                                            <TableCell className="text-center">{formatNumber(row.avgAssigneeToBlockerHours)}</TableCell>
                                            <TableCell className="text-center">{formatRate(row.onTimeRate)}</TableCell>
                                            <TableCell className="text-center">{row.inRiskOpen}</TableCell>
                                            <TableCell className="text-center">{row.overdueOpen}</TableCell>
                                            <TableCell className="text-center">{row.completedLate}</TableCell>
                                            <TableCell className="text-center">
                                                {row.samples.start}/{row.samples.completion}/{row.samples.blocker}/{row.samples.deadline}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Atrasadas (Drill-down)</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {summary.overdueTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa atrasada no momento.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tarefa</TableHead>
                                    <TableHead>Setor</TableHead>
                                    <TableHead>Responsável</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Prazo</TableHead>
                                    <TableHead className="text-center">Atraso</TableHead>
                                    <TableHead className="text-center">Sem avanço</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.overdueTasks.map((task) => (
                                    <TableRow key={task.taskId}>
                                        <TableCell className="font-medium">{task.title}</TableCell>
                                        <TableCell>{formatDepartmentLabel(task.department)}</TableCell>
                                        <TableCell>{task.assigneeName}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline">{task.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">{formatDateTime(task.dueDate)}</TableCell>
                                        <TableCell className="text-center">{task.overdueHours}h</TableCell>
                                        <TableCell className="text-center">{task.hoursWithoutProgress}h</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Bloqueios por Pessoa</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.blockerLoadByUser.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma pessoa com tarefas bloqueadas no momento.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Pessoa</TableHead>
                                        <TableHead className="text-center">Tarefas</TableHead>
                                        <TableHead className="text-center">Bloqueios</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.blockerLoadByUser.map((item) => (
                                        <TableRow key={item.ownerUserId}>
                                            <TableCell className="font-medium">{item.ownerName}</TableCell>
                                            <TableCell className="text-center">{item.blockedTasks}</TableCell>
                                            <TableCell className="text-center">{item.activeBlockers}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Bloqueios por Setor</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {summary.blockerLoadByDepartment.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum setor com bloqueios ativos no momento.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Setor</TableHead>
                                        <TableHead className="text-center">Tarefas</TableHead>
                                        <TableHead className="text-center">Bloqueios</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summary.blockerLoadByDepartment.map((item) => (
                                        <TableRow key={item.department}>
                                            <TableCell className="font-medium">{formatDepartmentLabel(item.department)}</TableCell>
                                            <TableCell className="text-center">{item.blockedTasks}</TableCell>
                                            <TableCell className="text-center">{item.activeBlockers}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tarefas Bloqueadas</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {summary.blockedTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa bloqueada no momento.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tarefa</TableHead>
                                    <TableHead>Setor</TableHead>
                                    <TableHead>Dependência</TableHead>
                                    <TableHead className="text-center">Idade</TableHead>
                                    <TableHead className="text-center">Previsão</TableHead>
                                    <TableHead>Motivo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.blockedTasks.map((item) => (
                                    <TableRow key={item.blockerId}>
                                        <TableCell className="font-medium">{item.taskTitle}</TableCell>
                                        <TableCell>{formatDepartmentLabel(item.department)}</TableCell>
                                        <TableCell>{item.ownerLabel}</TableCell>
                                        <TableCell className="text-center">{item.blockerAgeHours}h</TableCell>
                                        <TableCell className="text-center">{formatDateTime(item.expectedUnblockAt)}</TableCell>
                                        <TableCell className="max-w-[360px] whitespace-normal">{item.reason}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Taxa de Lentidão por Setor</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {summary.slowSectors.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum setor com tarefas abertas no momento.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Setor</TableHead>
                                    <TableHead className="text-center">Abertas</TableHead>
                                    <TableHead className="text-center">Sem avanço</TableHead>
                                    <TableHead className="text-center">Taxa</TableHead>
                                    <TableHead className="text-center">Janela (h)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.slowSectors.map((row) => (
                                    <TableRow key={row.department}>
                                        <TableCell className="font-medium">{formatDepartmentLabel(row.department)}</TableCell>
                                        <TableCell className="text-center">{row.totalOpen}</TableCell>
                                        <TableCell className="text-center">{row.stagnant}</TableCell>
                                        <TableCell className="text-center">{formatPercent(row.stagnationRate)}</TableCell>
                                        <TableCell className="text-center">{row.thresholdHours}h</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tarefas Mais Paradas</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Atualizado em {formatDateTime(summary.generatedAt)}
                    </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {summary.mostStagnantTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa aberta.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tarefa</TableHead>
                                    <TableHead>Setor</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Responsável</TableHead>
                                    <TableHead className="text-center">Sem avanço</TableHead>
                                    <TableHead className="text-center">Último avanço</TableHead>
                                    <TableHead className="text-center">Prazo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.mostStagnantTasks.map((task) => (
                                    <TableRow key={task.taskId}>
                                        <TableCell className="font-medium">{task.title}</TableCell>
                                        <TableCell>{formatDepartmentLabel(task.department)}</TableCell>
                                        <TableCell>{task.status}</TableCell>
                                        <TableCell>{task.assigneeName}</TableCell>
                                        <TableCell className="text-center">{task.hoursWithoutProgress}h</TableCell>
                                        <TableCell className="text-center">{formatDateTime(task.lastProgressAt)}</TableCell>
                                        <TableCell className="text-center">{formatDateTime(task.dueDate)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
