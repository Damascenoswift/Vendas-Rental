import { describe, expect, it } from "vitest"

import {
    resolveWorkCardStatusLabel,
    resolveWorkCardCompletedAt,
    shouldUpdateWorkCardStatus,
    type WorkCardStatus,
} from "../work-card-status"

describe("work card status helpers", () => {
    it("returns FECHADA label based on completion state", () => {
        expect(resolveWorkCardStatusLabel({ status: "FECHADA", completedAt: null })).toBe("Obra Fechada")
        expect(resolveWorkCardStatusLabel({ status: "FECHADA", completedAt: "2026-03-19T12:00:00.000Z" })).toBe("Obra Concluída")
    })

    it("keeps existing labels for in-progress statuses", () => {
        expect(resolveWorkCardStatusLabel({ status: "PARA_INICIAR", completedAt: null })).toBe("Obra Para Iniciar")
        expect(resolveWorkCardStatusLabel({ status: "EM_ANDAMENTO", completedAt: null })).toBe("Obra em Andamento")
    })

    it("defaults FECHADA transition to open (not completed)", () => {
        const now = "2026-03-19T12:00:00.000Z"
        expect(resolveWorkCardCompletedAt({
            currentStatus: "PARA_INICIAR",
            currentCompletedAt: null,
            nextStatus: "FECHADA",
            nowIso: now,
        })).toBeNull()
    })

    it("can explicitly mark FECHADA as completed", () => {
        const now = "2026-03-19T12:00:00.000Z"
        expect(resolveWorkCardCompletedAt({
            currentStatus: "PARA_INICIAR",
            currentCompletedAt: null,
            nextStatus: "FECHADA",
            completionMode: "completed",
            nowIso: now,
        })).toBe(now)
    })

    it("can explicitly reopen FECHADA by clearing completed_at", () => {
        expect(resolveWorkCardCompletedAt({
            currentStatus: "FECHADA",
            currentCompletedAt: "2026-03-19T12:00:00.000Z",
            nextStatus: "FECHADA",
            completionMode: "open",
            nowIso: "2026-03-19T13:00:00.000Z",
        })).toBeNull()
    })

    it("detects updates when only completion state changes", () => {
        const current = {
            status: "FECHADA" as WorkCardStatus,
            completedAt: "2026-03-19T12:00:00.000Z",
        }

        expect(shouldUpdateWorkCardStatus({
            current,
            nextStatus: "FECHADA",
            nextCompletedAt: null,
        })).toBe(true)
    })
})
