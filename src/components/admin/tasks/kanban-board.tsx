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
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const { showToast } = useToast()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 3 } }), // Easier drag start on cards
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
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

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeTask = tasks.find(t => t.id === active.id)
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

        if (activeTask.status !== newStatus) {
            const previousStatus = activeTask.status

            // Optimistic UI update
            setTasks(prev =>
                prev.map(t => (t.id === activeTask.id ? { ...t, status: newStatus } : t))
            )

            const result = await updateTaskStatus(activeTask.id, newStatus)
            if (result.error) {
                // Revert on error
                setTasks(prev =>
                    prev.map(t => (t.id === activeTask.id ? { ...t, status: previousStatus } : t))
                )
                showToast({
                    title: "Erro ao mover tarefa",
                    description: result.error,
                    variant: "error",
                })
            }
        }
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
