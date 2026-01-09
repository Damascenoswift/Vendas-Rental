"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Task } from "@/services/task-service"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Calendar, Clock, User, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface TaskCardProps {
    task: Task
    onClick?: () => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id, data: { task } })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const priorityColor = {
        LOW: "bg-green-100 text-green-800",
        MEDIUM: "bg-blue-100 text-blue-800",
        HIGH: "bg-orange-100 text-orange-800",
        URGENT: "bg-red-100 text-red-800"
    }

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'DONE'

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
            <Card
                className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative ${isOverdue ? "border-red-300 bg-red-50/30" : ""}`}
                onClick={(e) => {
                    // Prevent click when dragging
                    if (!isDragging) onClick?.()
                }}
            >
                <CardHeader className="p-3 pb-0 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                        <Badge variant="outline" className={`${priorityColor[task.priority]} border-none text-[10px] px-2 py-0.5 h-auto`}>
                            {task.priority}
                        </Badge>
                        {task.department && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded uppercase font-medium">
                                {task.department.slice(0, 3)}
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-3 pt-2 space-y-3">
                    <div>
                        <h4 className="font-semibold text-sm leading-tight text-gray-900 line-clamp-2">
                            {task.title}
                        </h4>
                        {task.client_name && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {task.client_name}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                            {task.due_date && (
                                <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                                    <Clock className="h-3 w-3" />
                                    <span>{format(new Date(task.due_date), "dd/MM", { locale: ptBR })}</span>
                                </div>
                            )}
                        </div>

                        {task.assignee ? (
                            <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                                    {task.assignee.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        ) : (
                            <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                                <User className="h-3 w-3 text-gray-400" />
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
