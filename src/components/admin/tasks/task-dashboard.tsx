"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Department, Task } from "@/services/task-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Clock, CheckCircle2, CircleDashed, Building2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

interface TaskDashboardProps {
    tasks: Task[]
}

const PRODUCTIVITY_TIMEZONE = "America/Cuiaba"
const CADASTRO_ALERT_STORAGE_KEY = "tasks:cadastro-alert:last-seen-at"

const DEPARTMENT_ORDER: Department[] = [
    "vendas",
    "cadastro",
    "energia",
    "juridico",
    "financeiro",
    "ti",
    "diretoria",
    "outro",
]

const DEPARTMENT_LABELS: Record<Department, string> = {
    vendas: "Vendas",
    cadastro: "Cadastro",
    energia: "Energia",
    juridico: "Jurídico",
    financeiro: "Financeiro",
    ti: "TI",
    diretoria: "Diretoria",
    outro: "Outro",
}

type EmployeeProductivity = {
    key: string
    name: string
    todo: number
    inProgress: number
    delayed: number
    doneToday: number
}

type DepartmentSummaryItem = {
    key: Department | "__unassigned__"
    label: string
    count: number
    isUnassigned?: boolean
}

function getDateKeyInTimeZone(value: Date, timeZone: string) {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(value)
    } catch {
        return new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(value)
    }
}

function normalizeDepartment(value: string | null | undefined): Department | null {
    const normalized = (value ?? "").trim().toLowerCase()
    if (
        normalized === "vendas" ||
        normalized === "cadastro" ||
        normalized === "energia" ||
        normalized === "juridico" ||
        normalized === "financeiro" ||
        normalized === "ti" ||
        normalized === "diretoria" ||
        normalized === "outro"
    ) {
        return normalized
    }
    return null
}

export function TaskDashboard({ tasks }: TaskDashboardProps) {
    const [cadastroAlertSeenAt, setCadastroAlertSeenAt] = useState<string | null>(null)
    const [isCadastroAlertReady, setIsCadastroAlertReady] = useState(false)
    const [hasUnseenCadastroAlert, setHasUnseenCadastroAlert] = useState(false)

    const syncCadastroAlert = useCallback(async (seenAtOverride?: string | null) => {
        const seenAt = seenAtOverride ?? cadastroAlertSeenAt
        if (!seenAt) return

        const { count, error } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .in("department", ["cadastro", "CADASTRO"])
            .gt("created_at", seenAt)

        if (error) {
            console.error("Erro ao sincronizar alerta de cadastro:", error)
            return
        }

        setHasUnseenCadastroAlert((previousValue) => previousValue || (count ?? 0) > 0)
    }, [cadastroAlertSeenAt])

    const markCadastroAlertAsSeen = useCallback(() => {
        const nowIso = new Date().toISOString()
        setCadastroAlertSeenAt(nowIso)
        setHasUnseenCadastroAlert(false)
        if (typeof window !== "undefined") {
            window.localStorage.setItem(CADASTRO_ALERT_STORAGE_KEY, nowIso)
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return

        const storedValue = window.localStorage.getItem(CADASTRO_ALERT_STORAGE_KEY)
        if (storedValue) {
            setCadastroAlertSeenAt(storedValue)
            setIsCadastroAlertReady(true)
            return
        }

        const nowIso = new Date().toISOString()
        window.localStorage.setItem(CADASTRO_ALERT_STORAGE_KEY, nowIso)
        setCadastroAlertSeenAt(nowIso)
        setIsCadastroAlertReady(true)
    }, [])

    useEffect(() => {
        if (!isCadastroAlertReady || !cadastroAlertSeenAt) return
        void syncCadastroAlert(cadastroAlertSeenAt)
    }, [isCadastroAlertReady, cadastroAlertSeenAt, syncCadastroAlert])

    useEffect(() => {
        if (!isCadastroAlertReady || !cadastroAlertSeenAt) return

        const channel = supabase
            .channel("task-dashboard-cadastro-alert")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "tasks",
                },
                (payload) => {
                    const next = (payload as { new?: { department?: string | null; created_at?: string | null } }).new
                    const nextDepartment = normalizeDepartment(next?.department)
                    if (nextDepartment !== "cadastro") return

                    const createdAtMs = new Date(next?.created_at ?? "").getTime()
                    const seenAtMs = new Date(cadastroAlertSeenAt).getTime()
                    if (Number.isNaN(createdAtMs) || Number.isNaN(seenAtMs)) {
                        setHasUnseenCadastroAlert(true)
                        return
                    }

                    if (createdAtMs > seenAtMs) {
                        setHasUnseenCadastroAlert(true)
                    }
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [isCadastroAlertReady, cadastroAlertSeenAt, syncCadastroAlert])

    const hasUnseenCadastroFromInitialTasks = useMemo(() => {
        if (!cadastroAlertSeenAt) return false
        const seenAtMs = new Date(cadastroAlertSeenAt).getTime()
        if (Number.isNaN(seenAtMs)) return false

        return tasks.some((task) => {
            const taskCreatedAtMs = new Date(task.created_at).getTime()
            if (Number.isNaN(taskCreatedAtMs)) return false
            return (
                normalizeDepartment(task.department) === "cadastro" &&
                taskCreatedAtMs > seenAtMs
            )
        })
    }, [tasks, cadastroAlertSeenAt])

    const shouldBlinkCadastro = hasUnseenCadastroAlert || hasUnseenCadastroFromInitialTasks

    const metrics = useMemo(() => {
        const now = new Date()
        const todayKey = getDateKeyInTimeZone(now, PRODUCTIVITY_TIMEZONE)

        const urgent = tasks.filter(t => t.priority === 'URGENT' && t.status !== 'DONE').length
        const todo = tasks.filter(t => t.status === 'TODO').length
        const inProgress = tasks.filter(t => ['IN_PROGRESS', 'REVIEW', 'BLOCKED'].includes(t.status)).length

        const delayed = tasks.filter(t => {
            if (!t.due_date || t.status === 'DONE') return false
            const dueDate = new Date(t.due_date)
            if (Number.isNaN(dueDate.getTime())) return false
            return dueDate.getTime() < now.getTime()
        }).length

        const perEmployeeMap = new Map<string, EmployeeProductivity>()
        const departmentCounts = DEPARTMENT_ORDER.reduce((acc, department) => {
            acc[department] = 0
            return acc
        }, {} as Record<Department, number>)
        let unassignedDepartmentCount = 0

        for (const task of tasks) {
            if (task.status !== "DONE") {
                const department = normalizeDepartment(task.department)
                if (department && departmentCounts[department] !== undefined) {
                    departmentCounts[department] += 1
                } else {
                    unassignedDepartmentCount += 1
                }
            }

            const key = task.assignee_id ?? "__unassigned__"
            const name = task.assignee?.name ?? "Sem responsável"

            const current = perEmployeeMap.get(key) ?? {
                key,
                name,
                todo: 0,
                inProgress: 0,
                delayed: 0,
                doneToday: 0,
            }

            if (task.status === "TODO") current.todo += 1
            if (["IN_PROGRESS", "REVIEW", "BLOCKED"].includes(task.status)) current.inProgress += 1
            if (task.due_date && task.status !== "DONE" && new Date(task.due_date).getTime() < now.getTime()) {
                current.delayed += 1
            }

            if (task.completed_at) {
                const completedAt = new Date(task.completed_at)
                if (!Number.isNaN(completedAt.getTime())) {
                    const doneDayKey = getDateKeyInTimeZone(completedAt, PRODUCTIVITY_TIMEZONE)
                    if (doneDayKey === todayKey) {
                        current.doneToday += 1
                    }
                }
            }

            perEmployeeMap.set(key, current)
        }

        const productivity = Array.from(perEmployeeMap.values())
            .sort((a, b) => {
                if (b.delayed !== a.delayed) return b.delayed - a.delayed
                if (b.inProgress !== a.inProgress) return b.inProgress - a.inProgress
                if (b.todo !== a.todo) return b.todo - a.todo
                return b.doneToday - a.doneToday
            })

        const departments: DepartmentSummaryItem[] = DEPARTMENT_ORDER.map((department) => ({
            key: department,
            label: DEPARTMENT_LABELS[department],
            count: departmentCounts[department] ?? 0,
        }))

        if (unassignedDepartmentCount > 0) {
            departments.push({
                key: "__unassigned__",
                label: "Sem setor",
                count: unassignedDepartmentCount,
                isUnassigned: true,
            })
        }

        return { urgent, todo, inProgress, delayed, productivity, departments }
    }, [tasks])

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{metrics.urgent}</div>
                        <p className="text-xs text-muted-foreground">
                            Tarefas prioritárias pendentes
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Atrasadas</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{metrics.delayed}</div>
                        <p className="text-xs text-muted-foreground">
                            Prazo vencido
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">A Fazer</CardTitle>
                        <CircleDashed className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.todo}</div>
                        <p className="text-xs text-muted-foreground">
                            Aguardando início
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{metrics.inProgress}</div>
                        <p className="text-xs text-muted-foreground">
                            Inclui andamento, revisão e bloqueadas
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Tarefas por setor</h2>
                    <span className="text-xs text-muted-foreground">Pendentes (exceto concluídas)</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {metrics.departments.map((department) => (
                        <Card
                            key={department.key}
                            className={
                                department.key === "cadastro" && shouldBlinkCadastro
                                    ? "cadastro-attention-card border-amber-300 ring-2 ring-amber-200"
                                    : undefined
                            }
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{department.label}</CardTitle>
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{department.count}</div>
                                <p className="text-xs text-muted-foreground">
                                    {department.isUnassigned ? "Tarefas sem setor definido" : "Tarefas pendentes do setor"}
                                </p>
                                {department.key === "cadastro" && shouldBlinkCadastro && (
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium text-amber-700">
                                            Nova indicação pendente
                                        </span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={markCadastroAlertAsSeen}
                                        >
                                            Marcar como visto
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Produtividade por funcionário</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {metrics.productivity.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Funcionário</TableHead>
                                    <TableHead className="text-center">Não iniciadas</TableHead>
                                    <TableHead className="text-center">Em andamento</TableHead>
                                    <TableHead className="text-center">Atrasadas</TableHead>
                                    <TableHead className="text-center">Feitas hoje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {metrics.productivity.map((item) => (
                                    <TableRow key={item.key}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-center">{item.todo}</TableCell>
                                        <TableCell className="text-center text-blue-700">{item.inProgress}</TableCell>
                                        <TableCell className="text-center text-amber-700">{item.delayed}</TableCell>
                                        <TableCell className="text-center text-emerald-700">{item.doneToday}</TableCell>
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
