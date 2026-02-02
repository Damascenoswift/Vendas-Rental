"use client"

import { useDroppable } from "@dnd-kit/core"
import { Task, TaskStatus } from "@/services/task-service"
import { TaskCard } from "./task-card"

interface TaskColumnProps {
    id: TaskStatus
    title: string
    tasks: Task[]
    onTaskClick?: (taskId: string) => void
}

export function TaskColumn({ id, title, tasks, onTaskClick }: TaskColumnProps) {
    const { setNodeRef } = useDroppable({ id })

    return (
        <div className="flex flex-col w-80 shrink-0 min-h-0">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                    {title}
                    <span className="bg-gray-100 text-gray-500 text-xs py-0.5 px-2 rounded-full">
                        {tasks.length}
                    </span>
                </h3>
            </div>

            <div
                ref={setNodeRef}
                className="flex-1 min-h-0 overflow-y-auto bg-gray-50/50 rounded-lg p-2 space-y-2 border border-transparent hover:border-gray-200 transition-colors"
            >
                {tasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => onTaskClick?.(task.id)} />
                ))}
            </div>
        </div>
    )
}
