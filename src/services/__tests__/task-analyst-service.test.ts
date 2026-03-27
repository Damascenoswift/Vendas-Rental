import { describe, expect, it } from "vitest"

import {
  applyLearningSmoothing,
  buildBlockerDependencyKey,
  buildCooldownHashKey,
  clampHours,
  computeHoursWithoutProgress,
  pickTaskThreshold,
  percentile75,
  shouldSendByCooldown,
  type DepartmentThreshold,
} from "../task-analyst-utils"

describe("task analyst helpers", () => {
  it("computes hours without progress from ISO timestamps", () => {
    const now = new Date("2026-03-27T12:00:00.000Z")
    const hours = computeHoursWithoutProgress("2026-03-26T12:00:00.000Z", now)
    expect(hours).toBe(24)
  })

  it("clamps hour values to configured min/max", () => {
    expect(clampHours(5, 12, 72)).toBe(12)
    expect(clampHours(30, 12, 72)).toBe(30)
    expect(clampHours(120, 12, 72)).toBe(72)
  })

  it("returns p75 for odd and even samples", () => {
    expect(percentile75([1, 2, 3, 4, 5])).toBe(4)
    expect(percentile75([10, 20, 30, 40])).toBe(30)
  })

  it("applies 70/30 smoothing preserving integer hours", () => {
    expect(applyLearningSmoothing(24, 36)).toBe(28)
    expect(applyLearningSmoothing(72, 48)).toBe(65)
  })

  it("builds stable cooldown hash key by UTC day", () => {
    const key = buildCooldownHashKey({
      kind: "REMINDER",
      recipientUserId: "u1",
      taskId: "t1",
      referenceAt: new Date("2026-03-27T12:00:00.000Z"),
    })

    expect(key).toBe("REMINDER:u1:t1:2026-03-27")
  })

  it("builds dependency key for blocker recipients", () => {
    expect(buildBlockerDependencyKey({
      ownerType: "USER",
      ownerUserId: "user-1",
    })).toBe("USER:user-1")

    expect(buildBlockerDependencyKey({
      ownerType: "DEPARTMENT",
      ownerDepartment: "cadastro",
    })).toBe("DEPARTMENT:cadastro")
  })

  it("returns null dependency key when blocker target is incomplete", () => {
    expect(buildBlockerDependencyKey({
      ownerType: "USER",
      ownerUserId: "",
    })).toBeNull()

    expect(buildBlockerDependencyKey({
      ownerType: "DEPARTMENT",
      ownerDepartment: "",
    })).toBeNull()
  })

  it("checks cooldown window before sending", () => {
    const now = new Date("2026-03-27T12:00:00.000Z")

    expect(shouldSendByCooldown({
      lastSentAt: null,
      now,
      cooldownHours: 24,
    })).toBe(true)

    expect(shouldSendByCooldown({
      lastSentAt: "2026-03-27T01:00:00.000Z",
      now,
      cooldownHours: 24,
    })).toBe(false)

    expect(shouldSendByCooldown({
      lastSentAt: "2026-03-26T11:00:00.000Z",
      now,
      cooldownHours: 24,
    })).toBe(true)
  })

  it("picks sector override when available", () => {
    const thresholds = new Map<string, DepartmentThreshold>()
    thresholds.set("cadastro", {
      department: "cadastro",
      reminderHours: 30,
      escalationHours: 90,
      slowHours: 60,
      source: "learned",
    })

    const selected = pickTaskThreshold({
      department: "cadastro",
      thresholds,
      fallback: {
        department: "_default",
        reminderHours: 24,
        escalationHours: 72,
        slowHours: 48,
        source: "manual",
      },
    })

    expect(selected.reminderHours).toBe(30)
    expect(selected.escalationHours).toBe(90)
    expect(selected.slowHours).toBe(60)
  })
})
