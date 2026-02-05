"use client"

import { useMemo } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Task, TaskStatus } from "@/services/task-service"
import { TaskCard } from "./task-card"

interface TaskColumnProps {
    id: TaskStatus
    title: string
    tasks: Task[]
    onTaskClick?: (taskId: string) => void
    onTaskStatusChange?: (taskId: string, status: TaskStatus) => void | Promise<void>
}

const PRIORITY_ORDER: Record<Task["priority"], number> = {
    URGENT: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
}

export function TaskColumn({ id, title, tasks, onTaskClick, onTaskStatusChange }: TaskColumnProps) {
    const { setNodeRef } = useDroppable({ id })
    const sortedTasks = useMemo(() => {
        return tasks
            .map((task, index) => ({ task, index }))
            .sort((a, b) => {
                const priorityDiff =
                    (PRIORITY_ORDER[a.task.priority] ?? 99) - (PRIORITY_ORDER[b.task.priority] ?? 99)
                if (priorityDiff !== 0) return priorityDiff
                return a.index - b.index
            })
            .map(({ task }) => task)
    }, [tasks])

    return (
        <div className="flex flex-col w-80 shrink-0 min-h-0">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                    {title}
                    <span className="bg-gray-100 text-gray-500 text-xs py-0.5 px-2 rounded-full">
                        {sortedTasks.length}
                    </span>
                </h3>
            </div>

            <div
                ref={setNodeRef}
                className="flex-1 min-h-[160px] overflow-y-auto bg-gray-50/50 rounded-lg p-2 space-y-2 border border-transparent hover:border-gray-200 transition-colors"
                data-column-id={id}
            >
                <SortableContext items={sortedTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    {sortedTasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick?.(task.id)}
                            onStatusChange={(status) => onTaskStatusChange?.(task.id, status)}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}
