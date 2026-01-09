import { Suspense } from "react"
import { getTasks } from "@/services/task-service"
import { KanbanBoard } from "@/components/admin/tasks/kanban-board"
import { TaskDialog } from "@/components/admin/tasks/task-dialog"
import { Button } from "@/components/ui/button"
import { Filter } from "lucide-react"

export default async function TasksPage() {
    const tasks = await getTasks({ showAll: true })

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-2 border-b bg-white">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Gestão de Tarefas</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Acompanhe o fluxo de trabalho e prazos da equipe.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Filter className="h-4 w-4" />
                        Filtros
                    </Button>
                    <TaskDialog />
                </div>
            </div>

            {/* Content - Horizontal Scroll for Kanban */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-gray-50/30">
                <KanbanBoard initialTasks={tasks} />
            </div>
        </div>
    )
}
