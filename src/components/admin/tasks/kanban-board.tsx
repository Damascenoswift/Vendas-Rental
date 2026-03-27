"use client"

import { useCallback, useEffect, useState } from "react"
import { Task, TaskStatus, updateTaskStatus } from "@/services/task-service"
import { TaskColumn } from "./task-column"
import { TaskDetailsDialog } from "./task-details-dialog"
import { useToast } from "@/hooks/use-toast"

interface KanbanBoardProps {
    initialTasks: Task[]
    initialOpenTaskId?: string
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
    { id: 'TODO', title: 'A Fazer' },
    { id: 'IN_PROGRESS', title: 'Em Andamento' },
    { id: 'BLOCKED', title: 'Bloqueadas' },
    { id: 'REVIEW', title: 'Revisão' },
    { id: 'DONE', title: 'Concluído' },
]

export function KanbanBoard({ initialTasks, initialOpenTaskId }: KanbanBoardProps) {
    const [tasks, setTasks] = useState<Task[]>(initialTasks)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [autoOpenConsumed, setAutoOpenConsumed] = useState(false)
    const { showToast } = useToast()

    useEffect(() => {
        setTasks(initialTasks)
    }, [initialTasks])

    useEffect(() => {
        setAutoOpenConsumed(false)
    }, [initialOpenTaskId])

    useEffect(() => {
        if (!initialOpenTaskId || autoOpenConsumed) return
        if (!tasks.some((task) => task.id === initialOpenTaskId)) return
        setSelectedTaskId(initialOpenTaskId)
        setAutoOpenConsumed(true)
    }, [autoOpenConsumed, initialOpenTaskId, tasks])

    const persistTaskStatusChange = useCallback(
        async (taskId: string, previousStatus: TaskStatus, newStatus: TaskStatus) => {
            if (previousStatus === newStatus) return

            setTasks((prev) =>
                prev.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task))
            )

            const result = await updateTaskStatus(taskId, newStatus)
            if (result.error) {
                setTasks((prev) =>
                    prev.map((task) => (task.id === taskId ? { ...task, status: previousStatus } : task))
                )
                showToast({
                    title: "Erro ao mover tarefa",
                    description: result.error,
                    variant: "error",
                })
            }
        },
        [showToast]
    )

    const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

    const handleChecklistSummaryChange = useCallback((taskId: string, total: number, done: number) => {
        setTasks((prev) => {
            let changed = false
            const next = prev.map((task) => {
                if (task.id !== taskId) return task
                const currentTotal = task.checklist_total ?? 0
                const currentDone = task.checklist_done ?? 0
                if (currentTotal === total && currentDone === done) {
                    return task
                }
                changed = true
                return { ...task, checklist_total: total, checklist_done: done }
            })
            return changed ? next : prev
        })
    }, [])

    const handleDeleteTask = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId))
    }, [])

    return (
        <>
            <div className="flex h-full min-h-0 gap-4 overflow-x-auto overflow-y-hidden pb-4">
                {COLUMNS.map(col => (
                    <TaskColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        tasks={tasks.filter(t => t.status === col.id)}
                        onTaskClick={(taskId) => setSelectedTaskId(taskId)}
                        onTaskStatusChange={async (taskId, status) => {
                            const task = tasks.find((item) => item.id === taskId)
                            if (!task) return
                            await persistTaskStatusChange(taskId, task.status, status)
                        }}
                    />
                ))}
            </div>

            <TaskDetailsDialog
                task={selectedTask}
                open={Boolean(selectedTaskId)}
                onOpenChange={(open) => {
                    if (!open) setSelectedTaskId(null)
                }}
                onTaskDeleted={handleDeleteTask}
                onChecklistSummaryChange={handleChecklistSummaryChange}
                onTaskUpdated={(taskId, updates) => {
                    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, ...updates } : task))
                }}
            />
        </>
    )
}
