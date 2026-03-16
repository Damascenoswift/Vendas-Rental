import { describe, expect, it } from "vitest"

import {
    buildChecklistNotificationDedupeKey,
    buildChecklistNotificationMessage,
    normalizeChecklistNotificationDecisionStatus,
} from "../task-checklist-notification"

describe("task checklist notification helpers", () => {
    it("normalizes decision status from payload or fallback bool", () => {
        expect(normalizeChecklistNotificationDecisionStatus({ decisionStatus: "APPROVED", isDone: false })).toBe("APPROVED")
        expect(normalizeChecklistNotificationDecisionStatus({ decisionStatus: "REJECTED", isDone: true })).toBe("REJECTED")
        expect(normalizeChecklistNotificationDecisionStatus({ decisionStatus: "IN_REVIEW", isDone: true })).toBe("IN_REVIEW")
        expect(normalizeChecklistNotificationDecisionStatus({ decisionStatus: null, isDone: true })).toBe("APPROVED")
        expect(normalizeChecklistNotificationDecisionStatus({ decisionStatus: null, isDone: false })).toBe("IN_REVIEW")
    })

    it("builds message with the exact checklist status label", () => {
        expect(
            buildChecklistNotificationMessage({
                action: "TOGGLED",
                actorDisplay: "João",
                checklistTitle: "Análise contrato",
                taskTitle: "Tarefa XPTO",
                decisionStatus: "APPROVED",
            })
        ).toContain("Aceito")

        expect(
            buildChecklistNotificationMessage({
                action: "TOGGLED",
                actorDisplay: "João",
                checklistTitle: "Análise contrato",
                taskTitle: "Tarefa XPTO",
                decisionStatus: "IN_REVIEW",
            })
        ).toContain("Em análise")

        expect(
            buildChecklistNotificationMessage({
                action: "TOGGLED",
                actorDisplay: "João",
                checklistTitle: "Análise contrato",
                taskTitle: "Tarefa XPTO",
                decisionStatus: "REJECTED",
            })
        ).toContain("Negado")
    })

    it("uses decision status in dedupe key for toggles", () => {
        expect(buildChecklistNotificationDedupeKey({
            action: "TOGGLED",
            checklistItemId: "abc",
            decisionStatus: "APPROVED",
        })).toBe("TASK_CHECKLIST_UPDATED:abc:APPROVED")

        expect(buildChecklistNotificationDedupeKey({
            action: "TOGGLED",
            checklistItemId: "abc",
            decisionStatus: "IN_REVIEW",
        })).toBe("TASK_CHECKLIST_UPDATED:abc:IN_REVIEW")

        expect(buildChecklistNotificationDedupeKey({
            action: "TOGGLED",
            checklistItemId: "abc",
            decisionStatus: "REJECTED",
        })).toBe("TASK_CHECKLIST_UPDATED:abc:REJECTED")
    })
})
