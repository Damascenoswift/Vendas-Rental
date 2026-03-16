import { describe, expect, it } from "vitest"

import { resolveChecklistDecisionStatus, toChecklistTogglePayload } from "../checklist-decision"

describe("checklist decision helpers", () => {
    it("falls back to APPROVED when legacy item is done", () => {
        expect(resolveChecklistDecisionStatus({ decision_status: null, is_done: true })).toBe("APPROVED")
    })

    it("falls back to IN_REVIEW when legacy item is not done", () => {
        expect(resolveChecklistDecisionStatus({ decision_status: null, is_done: false })).toBe("IN_REVIEW")
    })

    it("keeps explicit decision status", () => {
        expect(resolveChecklistDecisionStatus({ decision_status: "REJECTED", is_done: true })).toBe("REJECTED")
    })

    it("maps decision to payload used by toggle action", () => {
        expect(toChecklistTogglePayload("APPROVED")).toEqual({
            isDone: true,
            decisionStatus: "APPROVED",
        })
        expect(toChecklistTogglePayload("IN_REVIEW")).toEqual({
            isDone: false,
            decisionStatus: "IN_REVIEW",
        })
        expect(toChecklistTogglePayload("REJECTED")).toEqual({
            isDone: false,
            decisionStatus: "REJECTED",
        })
    })
})
