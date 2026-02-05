import { Suspense } from "react"
import { getTasks, Brand, Department } from "@/services/task-service"
import { KanbanBoard } from "@/components/admin/tasks/kanban-board"
import { TaskDialog } from "@/components/admin/tasks/task-dialog"
import { TaskBackfillButton } from "@/components/admin/tasks/task-backfill-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskDashboard } from "@/components/admin/tasks/task-dashboard"
import { TaskFilters } from "@/components/admin/tasks/task-filters"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"

type TaskScope = "all" | "mine" | "department"

function normalizeScope(value?: string | null): TaskScope {
    if (value === "mine" || value === "department") return value
    return "all"
}

export default async function TasksPage({ searchParams }: { searchParams: { brand?: string; scope?: string } }) {
    const brand = (searchParams?.brand === 'rental' || searchParams?.brand === 'dorata')
        ? searchParams.brand as Brand
        : undefined

    const scope = normalizeScope(searchParams?.scope)
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

    const tasks = await getTasks({ showAll: true, brand, assigneeId, department })

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
                    <TaskBackfillButton />
                    <TaskDialog />
                </div>
            </div>

            <Tabs defaultValue="board" className="flex flex-1 min-h-0 flex-col">
                <div className="px-6 py-2 bg-gray-50/50 border-b flex items-center justify-between">
                    <TabsList>
                        <TabsTrigger value="board">Quadro Kanban</TabsTrigger>
                        <TabsTrigger value="dashboard">Visão Geral</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                        <TaskFilters hasDepartment={Boolean(profile?.department)} />
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden bg-gray-50/30">
                    <TabsContent value="board" className="h-full min-h-0 overflow-hidden p-6 m-0 data-[state=inactive]:hidden">
                        <KanbanBoard initialTasks={tasks} />
                    </TabsContent>

                    <TabsContent value="dashboard" className="h-full min-h-0 overflow-y-auto p-6 m-0 data-[state=inactive]:hidden">
                        <TaskDashboard tasks={tasks} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
