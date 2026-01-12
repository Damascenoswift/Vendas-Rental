"use client"

import { useMemo } from "react"
import { Task } from "@/services/task-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Clock, CheckCircle2, CircleDashed } from "lucide-react"

interface TaskDashboardProps {
    tasks: Task[]
}

export function TaskDashboard({ tasks }: TaskDashboardProps) {
    const metrics = useMemo(() => {
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const urgent = tasks.filter(t => t.priority === 'URGENT' && t.status !== 'DONE').length
        const todo = tasks.filter(t => t.status === 'TODO').length
        const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length

        const delayed = tasks.filter(t => {
            if (!t.due_date || t.status === 'DONE') return false
            const dueDate = new Date(t.due_date)
            // Adjust due date comparison logic as needed, assuming string YYYY-MM-DD
            // Using flexible date comparison
            return new Date(t.due_date) < now
        }).length

        return { urgent, todo, inProgress, delayed }
    }, [tasks])

    return (
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
                        Sendo executadas agora
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
