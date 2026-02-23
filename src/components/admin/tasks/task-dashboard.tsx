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
const CADASTRO_ALERT_STORAGE_KEY = "tasks:cadastro-alert:seen-ids"

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
    energia: "Engenharia/Proj.",
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

function isCadastroTodoTask(task: Pick<Task, "department" | "status">) {
    return normalizeDepartment(task.department) === "cadastro" && task.status === "TODO"
}

function normalizeStoredTaskIds(value: unknown) {
    if (!Array.isArray(value)) return []

    const uniqueIds = new Set<string>()
    value.forEach((item) => {
        const id = typeof item === "string" ? item.trim() : ""
        if (id) uniqueIds.add(id)
    })

    return Array.from(uniqueIds)
}

function mergeIds(base: string[], incoming: string[]) {
    const merged = new Set(base)
    incoming.forEach((id) => {
        const normalized = id.trim()
        if (normalized) merged.add(normalized)
    })
    return Array.from(merged)
}

export function TaskDashboard({ tasks }: TaskDashboardProps) {
    const [seenCadastroTaskIds, setSeenCadastroTaskIds] = useState<string[]>([])
    const [pendingCadastroTaskIds, setPendingCadastroTaskIds] = useState<string[]>([])
    const [isCadastroAlertReady, setIsCadastroAlertReady] = useState(false)

    const seenCadastroTaskIdsSet = useMemo(() => new Set(seenCadastroTaskIds), [seenCadastroTaskIds])

    const addPendingCadastroTaskIds = useCallback((ids: string[]) => {
        if (ids.length === 0) return

        setPendingCadastroTaskIds((previous) => {
            const next = new Set(previous)
            ids.forEach((id) => {
                const normalized = id.trim()
                if (!normalized) return
                if (seenCadastroTaskIdsSet.has(normalized)) return
                next.add(normalized)
            })
            return Array.from(next)
        })
    }, [seenCadastroTaskIdsSet])

    const syncCadastroAlert = useCallback(async () => {
        const { data, error } = await supabase
            .from("tasks")
            .select("id, department, status")
            .in("department", ["cadastro", "CADASTRO"])
            .eq("status", "TODO")

        if (error) {
            console.error("Erro ao sincronizar alerta de cadastro:", error)
            return
        }

        const ids = ((data ?? []) as { id?: string | null }[])
            .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
            .filter((id) => id.length > 0)

        addPendingCadastroTaskIds(ids)
    }, [addPendingCadastroTaskIds])

    const markCadastroAlertAsSeen = useCallback(() => {
        if (pendingCadastroTaskIds.length === 0) return

        const nextSeenIds = mergeIds(seenCadastroTaskIds, pendingCadastroTaskIds)
        setSeenCadastroTaskIds(nextSeenIds)
        setPendingCadastroTaskIds([])

        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                CADASTRO_ALERT_STORAGE_KEY,
                JSON.stringify(nextSeenIds.slice(-1000))
            )
        }
    }, [pendingCadastroTaskIds, seenCadastroTaskIds])

    useEffect(() => {
        if (typeof window === "undefined") return

        const storedValue = window.localStorage.getItem(CADASTRO_ALERT_STORAGE_KEY)
        if (!storedValue) {
            setSeenCadastroTaskIds([])
            setIsCadastroAlertReady(true)
            return
        }

        try {
            const parsed = JSON.parse(storedValue)
            setSeenCadastroTaskIds(normalizeStoredTaskIds(parsed))
        } catch {
            setSeenCadastroTaskIds([])
        }

        setIsCadastroAlertReady(true)
    }, [])

    useEffect(() => {
        if (!isCadastroAlertReady) return

        const initialCadastroTodoIds = tasks
            .filter(isCadastroTodoTask)
            .map((task) => task.id)
            .filter((id) => typeof id === "string" && id.trim().length > 0)

        addPendingCadastroTaskIds(initialCadastroTodoIds)
        void syncCadastroAlert()
    }, [isCadastroAlertReady, tasks, addPendingCadastroTaskIds, syncCadastroAlert])

    useEffect(() => {
        if (!isCadastroAlertReady) return

        const channel = supabase
            .channel("task-dashboard-cadastro-alert")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "tasks",
                },
                (payload) => {
                    const next = (payload as { new?: { id?: string | null; department?: string | null; status?: string | null } }).new
                    const previous = (payload as { old?: { id?: string | null; department?: string | null; status?: string | null } }).old
                    const nextDepartment = normalizeDepartment(next?.department)
                    const previousDepartment = normalizeDepartment(previous?.department)
                    const nextStatus = (next?.status ?? "").toUpperCase()
                    const previousStatus = (previous?.status ?? "").toUpperCase()

                    const touchesCadastro = nextDepartment === "cadastro" || previousDepartment === "cadastro"
                    const touchesTodo = nextStatus === "TODO" || previousStatus === "TODO"
                    if (!touchesCadastro && !touchesTodo) return

                    const nextId = typeof next?.id === "string" ? next.id.trim() : ""
                    if (
                        nextId &&
                        nextDepartment === "cadastro" &&
                        nextStatus === "TODO" &&
                        !seenCadastroTaskIdsSet.has(nextId)
                    ) {
                        addPendingCadastroTaskIds([nextId])
                    }

                    void syncCadastroAlert()
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [isCadastroAlertReady, seenCadastroTaskIdsSet, addPendingCadastroTaskIds, syncCadastroAlert])

    const shouldBlinkCadastro = pendingCadastroTaskIds.length > 0

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
