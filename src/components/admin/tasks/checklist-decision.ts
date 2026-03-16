import type { TaskChecklistDecision } from "@/services/task-service"

type ChecklistDecisionSource = {
    decision_status?: TaskChecklistDecision | null
    is_done: boolean
}

export const CHECKLIST_DECISION_OPTIONS: Array<{
    value: TaskChecklistDecision
    label: string
    dotClassName: string
}> = [
    {
        value: "APPROVED",
        label: "Aceito",
        dotClassName: "border-emerald-600 bg-emerald-500",
    },
    {
        value: "IN_REVIEW",
        label: "Em análise",
        dotClassName: "border-amber-500 bg-amber-400",
    },
    {
        value: "REJECTED",
        label: "Negado",
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
