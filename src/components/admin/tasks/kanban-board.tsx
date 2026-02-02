"use client"

import { useState } from "react"
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
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // Fix click vs drag
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)

        if (!over) return

        const activeTask = tasks.find(t => t.id === active.id)
        if (!activeTask) return

        // Drop on a Column
        if (COLUMNS.some(col => col.id === over.id)) {
            const newStatus = over.id as TaskStatus

            if (activeTask.status !== newStatus) {
                // Optimistic UI update
                const previousStatus = activeTask.status
                setTasks(tasks.map(t =>
                    t.id === activeTask.id ? { ...t, status: newStatus } : t
                ))

                // Server action
                const result = await updateTaskStatus(activeTask.id, newStatus)
                if (result.error) {
                    // Revert on error
                    setTasks(tasks.map(t =>
                        t.id === activeTask.id ? { ...t, status: previousStatus } : t
                    ))
                    showToast({ title: "Erro ao mover tarefa", variant: "error" })
                }
            }
        }
    }

    // Just to find the Active Task for the Overlay
    const activeTask = tasks.find(t => t.id === activeId)
    const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null

    const handleChecklistSummaryChange = (taskId: string, total: number, done: number) => {
        setTasks(prev => prev.map(task => task.id === taskId
            ? { ...task, checklist_total: total, checklist_done: done }
            : task
        ))
    }

    const handleDeleteTask = (taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId))
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-4 overflow-x-auto pb-4">
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
