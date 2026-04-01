import { describe, expect, it } from "vitest"

import {
  computeNextAutoReminderAt,
  getDueProposalReminderKind,
  isManualReminderDue,
} from "@/lib/proposal-reminder-utils"

describe("proposal-reminder-utils", () => {
  it("calcula vencimento automático inicial e subsequente", () => {
    const firstDue = computeNextAutoReminderAt({
      proposalCreatedAt: "2026-03-01T10:00:00.000Z",
      autoReminderEnabled: true,
      autoReminderIntervalDays: 2,
      lastAutoReminderAt: null,
      negotiationStatus: "sem_contato",
    })

    expect(firstDue?.toISOString()).toBe("2026-03-03T10:00:00.000Z")

    const nextDue = computeNextAutoReminderAt({
      proposalCreatedAt: "2026-03-01T10:00:00.000Z",
      autoReminderEnabled: true,
      autoReminderIntervalDays: 2,
      lastAutoReminderAt: "2026-03-05T12:30:00.000Z",
      negotiationStatus: "em_negociacao",
    })

    expect(nextDue?.toISOString()).toBe("2026-03-07T12:30:00.000Z")
  })

  it("considera lembrete manual vencido e permite novo disparo após edição do followup_at", () => {
    const previousFollowupAt = "2026-03-10T14:00:00.000Z"
    const previousNotifiedAt = "2026-03-10T14:15:00.000Z"

    expect(
      isManualReminderDue({
        now: new Date("2026-03-10T16:00:00.000Z"),
        followupAt: previousFollowupAt,
        followupNotifiedAt: previousNotifiedAt,
      })
    ).toBe(false)

    const editedFollowupAt = "2026-03-12T09:00:00.000Z"

    expect(
      isManualReminderDue({
        now: new Date("2026-03-12T10:00:00.000Z"),
        followupAt: editedFollowupAt,
        followupNotifiedAt: previousNotifiedAt,
      })
    ).toBe(true)
  })

  it("bloqueia lembrete automático quando status está convertido ou perdido", () => {
    const now = new Date("2026-03-10T10:00:00.000Z")
    const baseParams = {
      now,
      proposalCreatedAt: "2026-03-01T10:00:00.000Z",
      lastAutoReminderAt: null,
      autoReminderEnabled: true,
      autoReminderIntervalDays: 2,
      followupAt: null,
      followupNotifiedAt: null,
    }

    expect(
      getDueProposalReminderKind({
        ...baseParams,
        negotiationStatus: "convertido",
      })
    ).toBe("NONE")

    expect(
      getDueProposalReminderKind({
        ...baseParams,
        negotiationStatus: "perdido",
      })
    ).toBe("NONE")
  })
})
