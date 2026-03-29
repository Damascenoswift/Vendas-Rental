import { describe, expect, it } from "vitest"
import { computeActualBusinessDays, shouldUpdatePersonalRecord } from "@/services/task-benchmark-service"

describe("computeActualBusinessDays", () => {
    it("retorna 1 para tarefas concluídas no mesmo dia útil", () => {
        const start = new Date("2026-03-23T09:00:00Z") // segunda
        const end = new Date("2026-03-23T17:00:00Z")   // mesmo dia
        expect(computeActualBusinessDays(start, end)).toBe(1)
    })

    it("retorna 2 para tarefas de segunda a terça", () => {
        const start = new Date("2026-03-23T09:00:00Z") // segunda
        const end = new Date("2026-03-24T17:00:00Z")   // terça
        expect(computeActualBusinessDays(start, end)).toBe(2)
    })

    it("não conta fim de semana", () => {
        const start = new Date("2026-03-27T09:00:00Z") // sexta
        const end = new Date("2026-03-30T09:00:00Z")   // segunda
        expect(computeActualBusinessDays(start, end)).toBe(2)
    })
})

describe("shouldUpdatePersonalRecord", () => {
    it("retorna true quando não há recorde anterior", () => {
        expect(shouldUpdatePersonalRecord(null, 3)).toBe(true)
    })

    it("retorna true quando novo tempo é melhor", () => {
        expect(shouldUpdatePersonalRecord(5, 3)).toBe(true)
    })

    it("retorna false quando novo tempo é igual ou pior", () => {
        expect(shouldUpdatePersonalRecord(3, 3)).toBe(false)
        expect(shouldUpdatePersonalRecord(3, 5)).toBe(false)
    })
})
