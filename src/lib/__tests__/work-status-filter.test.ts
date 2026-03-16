import { describe, expect, it } from "vitest"

import { WORK_STATUS_FILTER_OPTIONS, normalizeWorkStatusFilter } from "../work-status-filter"

describe("work status filter helpers", () => {
    it("maps CONCLUIDA filter to FECHADA status", () => {
        expect(normalizeWorkStatusFilter("CONCLUIDA")).toBe("FECHADA")
    })

    it("keeps supported explicit statuses", () => {
        expect(normalizeWorkStatusFilter("FECHADA")).toBe("FECHADA")
        expect(normalizeWorkStatusFilter("PARA_INICIAR")).toBe("PARA_INICIAR")
        expect(normalizeWorkStatusFilter("EM_ANDAMENTO")).toBe("EM_ANDAMENTO")
    })

    it("defaults to FECHADA when param is empty/unknown", () => {
        expect(normalizeWorkStatusFilter(undefined)).toBe("FECHADA")
        expect(normalizeWorkStatusFilter("abc")).toBe("FECHADA")
    })

    it("exposes concluded label in filter options", () => {
        const concludedOption = WORK_STATUS_FILTER_OPTIONS.find((option) => option.value === "FECHADA")
        expect(concludedOption?.label).toBe("Obras Concluídas")
    })
})
