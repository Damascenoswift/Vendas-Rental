import { Suspense } from "react"
import { getTasks, Brand } from "@/services/task-service"
import { KanbanBoard } from "@/components/admin/tasks/kanban-board"
import { TaskDialog } from "@/components/admin/tasks/task-dialog"
import { TaskBrandFilter } from "@/components/admin/tasks/task-brand-filter"
import { TaskBackfillButton } from "@/components/admin/tasks/task-backfill-button"
import { Button } from "@/components/ui/button"
import { Filter } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskDashboard } from "@/components/admin/tasks/task-dashboard"

export default async function TasksPage({ searchParams }: { searchParams: { brand?: string } }) {
    const brand = (searchParams?.brand === 'rental' || searchParams?.brand === 'dorata')
        ? searchParams.brand as Brand
        : undefined

    const tasks = await getTasks({ showAll: true, brand })

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
                    <TaskBrandFilter />
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

                    {/* Optional legacy filter button could go here or be removed if filters are moved to dashboard */}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2">
                            <Filter className="h-4 w-4" />
                            Filtros
                        </Button>
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
