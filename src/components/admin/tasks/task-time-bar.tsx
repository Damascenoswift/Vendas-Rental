// src/components/admin/tasks/task-time-bar.tsx
import { cn } from "@/lib/utils"

type TaskTimeBarProps = {
    elapsedDays: number
    expectedDays: number
    className?: string
}

export function TaskTimeBar({ elapsedDays, expectedDays, className }: TaskTimeBarProps) {
    const pct = Math.min(100, Math.round((elapsedDays / expectedDays) * 100))
    const isOver = elapsedDays > expectedDays
    const isNearing = !isOver && pct >= 80

    const fillClass = isOver
        ? "bg-destructive"
        : isNearing
          ? "bg-amber-500"
          : "bg-green-500"

    const label = `${elapsedDays}d / meta ${expectedDays}d`

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn("h-full rounded-full transition-all", fillClass)}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
        </div>
    )
}
