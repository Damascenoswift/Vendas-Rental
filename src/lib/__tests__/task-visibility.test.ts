import { describe, expect, it } from "vitest"

import { canUserSeeTaskInMineScope } from "../task-visibility"

describe("task visibility helpers", () => {
    it("allows mine scope when user is creator of restricted task", () => {
        const result = canUserSeeTaskInMineScope(
            {
                id: "task-1",
                visibility_scope: "RESTRICTED",
                assignee_id: "user-assignee",
                creator_id: "user-creator",
            },
            "user-creator",
            new Set<string>()
        )

        expect(result).toBe(true)
    })

    it("allows mine scope for assignee and observer", () => {
        const asAssignee = canUserSeeTaskInMineScope(
            {
                id: "task-2",
                visibility_scope: "RESTRICTED",
                assignee_id: "user-a",
                creator_id: "user-c",
            },
            "user-a",
            new Set<string>()
        )

        const asObserver = canUserSeeTaskInMineScope(
            {
                id: "task-3",
                visibility_scope: "RESTRICTED",
                assignee_id: "user-a",
                creator_id: "user-c",
            },
            "user-o",
            new Set<string>(["task-3"])
        )

        expect(asAssignee).toBe(true)
        expect(asObserver).toBe(true)
    })

    it("keeps hidden tasks that user does not own and does not observe", () => {
        const result = canUserSeeTaskInMineScope(
            {
                id: "task-4",
                visibility_scope: "RESTRICTED",
                assignee_id: "user-a",
                creator_id: "user-c",
            },
            "user-x",
            new Set<string>()
        )

        expect(result).toBe(false)
    })
})
