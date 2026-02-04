"use client"

import { useCallback, useState } from "react"
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragOverEvent,
    DragCancelEvent,
    DragEndEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Task, TaskStatus, updateTaskStatus } from "@/services/task-service"
import { TaskColumn } from "./task-column"
import { TaskCard } from "./task-card"
import { TaskDetailsDialog } from "./task-details-dialog"
import { useToast } from "@/hooks/use-toast"

interface KanbanBoardProps {
    initialTasks: Task[]
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
    { id: 'TODO', title: 'A Fazer' },
    { id: 'IN_PROGRESS', title: 'Em Andamento' },
    { id: 'REVIEW', title: 'Revisão' },
    { id: 'DONE', title: 'Concluído' },
]

export function KanbanBoard({ initialTasks }: KanbanBoardProps) {
    const [tasks, setTasks] = useState<Task[]>(initialTasks)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeOriginalStatus, setActiveOriginalStatus] = useState<TaskStatus | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const { showToast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 3 } }), // Easier drag start on cards
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

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

    const handleDragStart = (event: DragStartEvent) => {
        const draggedId = event.active.id as string
        const activeTask = tasks.find((task) => task.id === draggedId)
        setActiveId(draggedId)
        setActiveOriginalStatus(activeTask?.status ?? null)
    }

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return

        const activeTask = tasks.find((task) => task.id === active.id)
        if (!activeTask) return

        const overId = over.id as string
        if (COLUMNS.some((col) => col.id === overId) && activeTask.status !== overId) {
            setTasks((prev) =>
                prev.map((task) => (task.id === activeTask.id ? { ...task, status: overId as TaskStatus } : task))
            )
        }
    }

    const handleDragCancel = (_event: DragCancelEvent) => {
        if (!activeId || !activeOriginalStatus) {
            setActiveId(null)
            setActiveOriginalStatus(null)
            return
        }

        setTasks((prev) =>
            prev.map((task) => (task.id === activeId ? { ...task, status: activeOriginalStatus } : task))
        )
        setActiveId(null)
        setActiveOriginalStatus(null)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event

        const activeTaskId = active.id as string
        const originalStatus = activeOriginalStatus
        setActiveId(null)
        setActiveOriginalStatus(null)

        if (!originalStatus) return

        if (!over) {
            setTasks((prev) =>
                prev.map((task) => (task.id === activeTaskId ? { ...task, status: originalStatus } : task))
            )
            return
        }

        const activeTask = tasks.find(t => t.id === activeTaskId)
        if (!activeTask) return

        let newStatus = activeTask.status

        // Drop on a Column
        if (COLUMNS.some(col => col.id === over.id)) {
            newStatus = over.id as TaskStatus
        } else {
            // Drop on another card
            const overTask = tasks.find(t => t.id === over.id)
            if (overTask) {
                newStatus = overTask.status
            }
        }

        await persistTaskStatusChange(activeTaskId, originalStatus, newStatus)
    }

    // Just to find the Active Task for the Overlay
    const activeTask = tasks.find(t => t.id === activeId)
    const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

    const handleChecklistSummaryChange = useCallback((taskId: string, total: number, done: number) => {
        setTasks(prev => prev.map(task => task.id === taskId
            ? { ...task, checklist_total: total, checklist_done: done }
            : task
        ))
    }, [])

    const handleDeleteTask = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId))
    }, [])

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
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

            <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} /> : null}
            </DragOverlay>

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
        </DndContext>
    )
}
