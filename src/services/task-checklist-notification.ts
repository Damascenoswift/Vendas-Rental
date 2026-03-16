export type TaskChecklistNotificationAction = "TOGGLED" | "CREATED"
export type TaskChecklistNotificationDecisionStatus = "APPROVED" | "IN_REVIEW" | "REJECTED"

type DecisionStatusInput = {
    decisionStatus?: string | null
    isDone: boolean
}

type NotificationTextInput = {
    action: TaskChecklistNotificationAction
    actorDisplay: string
    checklistTitle: string
    taskTitle: string
    decisionStatus: TaskChecklistNotificationDecisionStatus
}

type NotificationDedupeInput = {
    action: TaskChecklistNotificationAction
    checklistItemId: string
    decisionStatus: TaskChecklistNotificationDecisionStatus
}

export function normalizeChecklistNotificationDecisionStatus(input: DecisionStatusInput): TaskChecklistNotificationDecisionStatus {
    if (input.decisionStatus === "APPROVED" || input.decisionStatus === "IN_REVIEW" || input.decisionStatus === "REJECTED") {
        return input.decisionStatus
    }
    return input.isDone ? "APPROVED" : "IN_REVIEW"
}

export function checklistDecisionStatusLabel(status: TaskChecklistNotificationDecisionStatus): string {
    if (status === "APPROVED") return "Aceito"
    if (status === "REJECTED") return "Negado"
    return "Em análise"
}

export function buildChecklistNotificationMessage(input: NotificationTextInput): string {
    if (input.action === "CREATED") {
        return `${input.actorDisplay} adicionou "${input.checklistTitle}" em "${input.taskTitle}".`
    }
    const statusLabel = checklistDecisionStatusLabel(input.decisionStatus)
    return `${input.actorDisplay} marcou "${input.checklistTitle}" como ${statusLabel} em "${input.taskTitle}".`
}

export function buildChecklistNotificationTitle(input: {
    action: TaskChecklistNotificationAction
    actorDisplay: string
    decisionStatus: TaskChecklistNotificationDecisionStatus
}): string {
    if (input.action === "CREATED") {
        return `${input.actorDisplay} adicionou um checklist da tarefa`
    }
    const statusLabel = checklistDecisionStatusLabel(input.decisionStatus)
    return `${input.actorDisplay} marcou checklist como ${statusLabel}`
}

export function buildChecklistNotificationDedupeKey(input: NotificationDedupeInput): string {
    if (input.action === "CREATED") {
        return `TASK_CHECKLIST_UPDATED:${input.checklistItemId}:CREATED`
    }
    return `TASK_CHECKLIST_UPDATED:${input.checklistItemId}:${input.decisionStatus}`
}
