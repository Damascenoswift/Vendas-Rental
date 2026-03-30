import { describe, expect, it } from "vitest"

import {
    buildWorkProcessCompletionAutomationDedupeKey,
    buildWorkProcessCompletionAutomationMessage,
    isWorkProcessCompletionTransition,
    normalizeAutomationWhatsappPhone,
    pickAutomationRecipient,
} from "@/services/work-process-completion-automation-utils"

describe("work process completion automation utils", () => {
    it("detects completion transition only when status changes to DONE", () => {
        expect(isWorkProcessCompletionTransition("TODO", "DONE")).toBe(true)
        expect(isWorkProcessCompletionTransition("IN_PROGRESS", "DONE")).toBe(true)
        expect(isWorkProcessCompletionTransition("BLOCKED", "DONE")).toBe(true)
        expect(isWorkProcessCompletionTransition("DONE", "DONE")).toBe(false)
        expect(isWorkProcessCompletionTransition("DONE", "IN_PROGRESS")).toBe(false)
        expect(isWorkProcessCompletionTransition("TODO", "IN_PROGRESS")).toBe(false)
    })

    it("normalizes valid whatsapp phones and rejects invalid values", () => {
        expect(normalizeAutomationWhatsappPhone("(65) 99999-1111")).toBe("65999991111")
        expect(normalizeAutomationWhatsappPhone("+55 (65) 99999-1111")).toBe("5565999991111")
        expect(normalizeAutomationWhatsappPhone("1234")).toBeNull()
        expect(normalizeAutomationWhatsappPhone("01234567890")).toBeNull()
    })

    it("chooses responsible first and falls back to creator", () => {
        expect(
            pickAutomationRecipient({
                responsible: { userId: "responsible", phone: "65999991111" },
                creator: { userId: "creator", phone: "65999992222" },
            })
        ).toEqual({
            userId: "responsible",
            phone: "65999991111",
            source: "RESPONSIBLE",
        })

        expect(
            pickAutomationRecipient({
                responsible: { userId: "responsible", phone: null },
                creator: { userId: "creator", phone: "65999992222" },
            })
        ).toEqual({
            userId: "creator",
            phone: "65999992222",
            source: "CREATOR_FALLBACK",
        })

        expect(
            pickAutomationRecipient({
                responsible: { userId: "responsible", phone: null },
                creator: { userId: "creator", phone: null },
            })
        ).toBeNull()
    })

    it("builds a fixed whatsapp message with expected fields", () => {
        const message = buildWorkProcessCompletionAutomationMessage({
            workTitle: "Obra Alpha",
            processTitle: "Instalação",
            actorDisplay: "João",
            completedAt: new Date("2026-03-30T14:00:00.000Z"),
        })

        expect(message).toContain("Check de obra concluído")
        expect(message).toContain("Obra: Obra Alpha")
        expect(message).toContain("Etapa: Instalação")
        expect(message).toContain("Concluído por: João")
        expect(message).toContain("Horário:")
    })

    it("creates stable dedupe key per channel", () => {
        expect(
            buildWorkProcessCompletionAutomationDedupeKey({
                channel: "INTERNAL",
                processItemId: "item-1",
                dedupeToken: "2026-03-30T10:00:00.000Z",
            })
        ).toBe("WORK_PROCESS_COMPLETION_AUTOMATION:INTERNAL:item-1:2026-03-30T10:00:00.000Z")

        expect(
            buildWorkProcessCompletionAutomationDedupeKey({
                channel: "WHATSAPP",
                processItemId: "item-1",
                dedupeToken: "2026-03-30T10:00:00.000Z",
            })
        ).toBe("WORK_PROCESS_COMPLETION_AUTOMATION:WHATSAPP:item-1:2026-03-30T10:00:00.000Z")
    })
})
