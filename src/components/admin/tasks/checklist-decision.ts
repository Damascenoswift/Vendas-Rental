import type { TaskChecklistDecision } from "@/services/task-service"

type ChecklistDecisionSource = {
    decision_status?: TaskChecklistDecision | null
    is_done: boolean
}

export const CHECKLIST_DECISION_OPTIONS: Array<{
    value: TaskChecklistDecision
    label: string
    activeClassName: string
    inactiveClassName: string
    dotClassName: string
}> = [
    {
        value: "APPROVED",
        label: "Aceito",
        activeClassName: "border-emerald-600 bg-emerald-500 text-white shadow-sm",
        inactiveClassName: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
        dotClassName: "border-emerald-600 bg-emerald-500",
    },
    {
        value: "IN_REVIEW",
        label: "Em análise",
        activeClassName: "border-amber-500 bg-amber-400 text-amber-950 shadow-sm",
        inactiveClassName: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
        dotClassName: "border-amber-500 bg-amber-400",
    },
    {
        value: "REJECTED",
        label: "Negado",
        activeClassName: "border-rose-600 bg-rose-500 text-white shadow-sm",
        inactiveClassName: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
        dotClassName: "border-rose-600 bg-rose-500",
    },
]

export function resolveChecklistDecisionStatus(item: ChecklistDecisionSource): TaskChecklistDecision {
    if (item.decision_status === "APPROVED" || item.decision_status === "IN_REVIEW" || item.decision_status === "REJECTED") {
        return item.decision_status
    }
    return item.is_done ? "APPROVED" : "IN_REVIEW"
}

export function toChecklistTogglePayload(nextDecision: TaskChecklistDecision) {
    return {
        isDone: nextDecision === "APPROVED",
        decisionStatus: nextDecision,
    }
}
