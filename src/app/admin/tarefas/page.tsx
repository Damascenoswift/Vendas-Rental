import { getTasks, Brand, Department } from "@/services/task-service"
import { KanbanBoard } from "@/components/admin/tasks/kanban-board"
import { TaskDialog } from "@/components/admin/tasks/task-dialog"
import { TaskBackfillButton } from "@/components/admin/tasks/task-backfill-button"
import { TaskAttachmentsCleanupButton } from "@/components/admin/tasks/task-attachments-cleanup-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskDashboard } from "@/components/admin/tasks/task-dashboard"
import { TaskAnalystDashboard } from "@/components/admin/tasks/task-analyst-dashboard"
import { TaskMyWeekDashboard } from "@/components/admin/tasks/task-my-week-dashboard"
import { TaskFilters } from "@/components/admin/tasks/task-filters"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { getTaskAnalystDashboardSummary } from "@/services/task-analyst-service"
import { getActiveWorksForUser, getTaskPersonalWeeklySummary } from "@/services/task-personal-weekly-service"
import { getDefaultBenchmarkForDepartment, getWeeklyPerformanceSummary } from "@/services/task-benchmark-service"
import type { WeeklyPerformanceSummary } from "@/services/task-benchmark-service"
import { differenceInBusinessDays } from "@/lib/business-days"
import { hasTaskAnalystAccess } from "@/lib/task-analyst-access"
import Link from "next/link"

type TaskScope = "all" | "mine" | "department"
type TaskView = "board" | "dashboard" | "my-week" | "analyst"
const ANALYST_PERIOD_OPTIONS = [30, 60, 90] as const

function normalizeScope(value?: string | null): TaskScope {
    if (value === "mine" || value === "department") return value
    return "all"
}

function normalizeView(value?: string | null, canViewTaskAnalyst?: boolean): TaskView {
    if (value === "board" || value === "dashboard" || value === "my-week") return value
    if (value === "analyst" && canViewTaskAnalyst) return value
    return "dashboard"
}

function normalizeAnalystPeriod(value?: string | null) {
    const parsed = Number.parseInt((value ?? "").trim(), 10)
    if (!Number.isFinite(parsed)) return 90
    if (ANALYST_PERIOD_OPTIONS.includes(parsed as typeof ANALYST_PERIOD_OPTIONS[number])) return parsed
    return 90
}

export default async function TasksPage({
    searchParams,
}: {
    searchParams?: Promise<{ brand?: string; scope?: string; q?: string; openTask?: string; view?: string; period?: string }>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const brand = (resolvedSearchParams?.brand === 'rental' || resolvedSearchParams?.brand === 'dorata')
        ? resolvedSearchParams.brand as Brand
        : undefined
    const search = resolvedSearchParams?.q?.trim() || undefined
    const openTaskId = resolvedSearchParams?.openTask?.trim() || undefined
    const selectedAnalystPeriod = normalizeAnalystPeriod(resolvedSearchParams?.period)

    const scope = normalizeScope(resolvedSearchParams?.scope)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const profile = user ? await getProfile(supabase, user.id) : null

    let assigneeId: string | undefined
    let department: Department | undefined

    if (scope === "mine" && user) {
        assigneeId = user.id
    }

    if (scope === "department" && profile?.department) {
        department = profile.department
    }

    const tasks = await getTasks({ showAll: true, brand, assigneeId, department, search })
    const canViewTaskAnalyst = hasTaskAnalystAccess({
        role: profile?.role ?? null,
        task_analyst_access: profile?.taskAnalystAccess ?? null,
    })
    const activeView = normalizeView(resolvedSearchParams?.view, canViewTaskAnalyst)
    const taskAnalystSummary = canViewTaskAnalyst && activeView === "analyst"
        ? await getTaskAnalystDashboardSummary({ periodDays: selectedAnalystPeriod })
        : null
    const taskPersonalWeeklySummary = activeView === "my-week"
        ? await getTaskPersonalWeeklySummary({ brand, search })
        : null

    let activeWorks: Awaited<ReturnType<typeof getActiveWorksForUser>> = []
    const taskBenchmarkDays: Record<string, { expected: number; elapsed: number }> = {}
    let performanceSummary: WeeklyPerformanceSummary | null = null

    if (activeView === "my-week" && user) {
        activeWorks = await getActiveWorksForUser(user.id)

        if (taskPersonalWeeklySummary) {
            const now = new Date()
            const departmentBenchmarkCache: Record<string, number | null> = {}

            for (const task of taskPersonalWeeklySummary.inProgressTasks) {
                if (!(task.department in departmentBenchmarkCache)) {
                    const bm = await getDefaultBenchmarkForDepartment(task.department)
                    departmentBenchmarkCache[task.department] = bm?.expected_business_days ?? null
                }
                const expected = departmentBenchmarkCache[task.department]
                if (expected !== null) {
                    // Use IN_PROGRESS event timestamp as start; fall back to created_at
                    const startAt = task.inProgressAt ? new Date(task.inProgressAt) : new Date(task.createdAt)
                    const elapsed = Math.max(0, differenceInBusinessDays(startAt, now))
                    taskBenchmarkDays[task.taskId] = { expected, elapsed }
                }
            }

            // Compute weekly performance summary (tasks completed this week)
            const weekStart = new Date(taskPersonalWeeklySummary.weekStartDate + "T00:00:00-04:00")
            const weekEnd = new Date(taskPersonalWeeklySummary.weekEndDate + "T23:59:59-04:00")
            performanceSummary = await getWeeklyPerformanceSummary(user.id, weekStart, weekEnd)
        }
    }

    const buildViewHref = (nextView: TaskView) => {
        const params = new URLSearchParams()
        if (brand) params.set("brand", brand)
        if (scope !== "all") params.set("scope", scope)
        if (search) params.set("q", search)
        if (canViewTaskAnalyst) params.set("period", String(selectedAnalystPeriod))
        params.set("view", nextView)
        if (nextView === "board" && openTaskId) params.set("openTask", openTaskId)
        const query = params.toString()
        return query ? `/admin/tarefas?${query}` : "/admin/tarefas"
    }

    const analystPeriodLinks = ANALYST_PERIOD_OPTIONS.map((days) => {
        const params = new URLSearchParams()
        if (brand) params.set("brand", brand)
        if (scope !== "all") params.set("scope", scope)
        if (search) params.set("q", search)
        params.set("view", "analyst")
        params.set("period", String(days))
        const query = params.toString()
        return {
            days,
            href: query ? `/admin/tarefas?${query}` : "/admin/tarefas?view=analyst",
        }
    })

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-2 border-b bg-white">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Gestão de Tarefas</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Acompanhe o fluxo de trabalho e prazos da equipe.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {profile?.role === "adm_mestre" ? <TaskAttachmentsCleanupButton /> : null}
                    <TaskBackfillButton />
                    <TaskDialog />
                </div>
            </div>

            <Tabs value={activeView} className="flex flex-1 min-h-0 flex-col">
                <div className="px-6 py-2 bg-gray-50/50 border-b flex items-center justify-between">
                    <TabsList>
                        <TabsTrigger value="board" asChild>
                            <Link href={buildViewHref("board")}>Quadro Kanban</Link>
                        </TabsTrigger>
                        <TabsTrigger value="dashboard" asChild>
                            <Link href={buildViewHref("dashboard")}>Visão Geral</Link>
                        </TabsTrigger>
                        <TabsTrigger value="my-week" asChild>
                            <Link href={buildViewHref("my-week")}>Minha Semana</Link>
                        </TabsTrigger>
                        {canViewTaskAnalyst ? (
                            <TabsTrigger value="analyst" asChild>
                                <Link href={buildViewHref("analyst")}>Analista IA</Link>
                            </TabsTrigger>
                        ) : null}
                    </TabsList>

                    <div className="flex items-center gap-2">
                        <TaskFilters hasDepartment={Boolean(profile?.department)} />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden bg-gray-50/30">
                    <TabsContent value="board" className="h-full min-h-0 overflow-hidden p-6 m-0 data-[state=inactive]:hidden">
                        <KanbanBoard initialTasks={tasks} initialOpenTaskId={openTaskId} />
                    </TabsContent>

                    <TabsContent value="dashboard" className="h-full min-h-0 overflow-y-auto p-6 m-0 data-[state=inactive]:hidden">
                        <TaskDashboard tasks={tasks} />
                    </TabsContent>

                    <TabsContent value="my-week" className="h-full min-h-0 overflow-y-auto p-6 m-0 data-[state=inactive]:hidden">
                        <TaskMyWeekDashboard
                            summary={taskPersonalWeeklySummary}
                            activeWorks={activeWorks}
                            taskBenchmarkDays={taskBenchmarkDays}
                            performanceSummary={performanceSummary}
                        />
                    </TabsContent>

                    {canViewTaskAnalyst ? (
                        <TabsContent value="analyst" className="h-full min-h-0 overflow-y-auto p-6 m-0 data-[state=inactive]:hidden">
                            <TaskAnalystDashboard
                                summary={taskAnalystSummary}
                                selectedPeriodDays={selectedAnalystPeriod}
                                periodOptions={analystPeriodLinks}
                            />
                        </TabsContent>
                    ) : null}
                </div>
            </Tabs>
        </div>
    )
}
