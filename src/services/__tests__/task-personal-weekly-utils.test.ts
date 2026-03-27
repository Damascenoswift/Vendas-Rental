import { describe, expect, it } from "vitest"

import {
    classifyTaskRoles,
    compareTasksByImportance,
    filterOpenBlockers,
    getCurrentWeekDateKeys,
    isPendingChecklistForUser,
} from "@/services/task-personal-weekly-utils"

describe("task personal weekly utils", () => {
    it("calculates week range Monday to Sunday in America/Cuiaba", () => {
        const result = getCurrentWeekDateKeys(new Date("2026-03-25T12:00:00.000Z"), "America/Cuiaba")
        expect(result.startDateKey).toBe("2026-03-23")
        expect(result.endDateKey).toBe("2026-03-29")
    })

    it("sorts important tasks by overdue, priority and due date", () => {
        const week = { startDateKey: "2026-03-23", endDateKey: "2026-03-29" }
        const now = new Date("2026-03-27T12:00:00.000Z")

        const overdueUrgent = {
            priority: "URGENT" as const,
            due_date: "2026-03-26T10:00:00.000Z",
            created_at: "2026-03-20T09:00:00.000Z",
        }
        const inWeekHigh = {
            priority: "HIGH" as const,
            due_date: "2026-03-28T10:00:00.000Z",
            created_at: "2026-03-20T09:00:00.000Z",
        }
        const noDueUrgent = {
            priority: "URGENT" as const,
            due_date: null,
            created_at: "2026-03-20T09:00:00.000Z",
        }

        expect(compareTasksByImportance(overdueUrgent, inWeekHigh, { now, week })).toBeLessThan(0)
        expect(compareTasksByImportance(inWeekHigh, noDueUrgent, { now, week })).toBeLessThan(0)
    })

    it("classifies tasks by assignee, observer and creator", () => {
        const roles = classifyTaskRoles(
            {
                id: "task-1",
                assignee_id: "u1",
                creator_id: "u1",
            },
            "u1",
            new Set(["task-1"])
        )

        expect(roles.assignee).toBe(true)
        expect(roles.creator).toBe(true)
        expect(roles.observer).toBe(true)
    })

    it("filters only OPEN blockers", () => {
        const filtered = filterOpenBlockers([
            { status: "OPEN" },
            { status: "RESOLVED" },
            { status: "CANCELED" },
            { status: "OPEN" },
        ])

        expect(filtered).toHaveLength(2)
        expect(filtered.every((item) => item.status === "OPEN")).toBe(true)
    })

    it("considers pending checklist only when not done and responsible matches", () => {
        expect(
            isPendingChecklistForUser(
                { is_done: false, responsible_user_id: "u1" },
                "u1"
            )
        ).toBe(true)

        expect(
            isPendingChecklistForUser(
                { is_done: true, responsible_user_id: "u1" },
                "u1"
            )
        ).toBe(false)

        expect(
            isPendingChecklistForUser(
                { is_done: false, responsible_user_id: "u2" },
                "u1"
            )
        ).toBe(false)
    })
})
