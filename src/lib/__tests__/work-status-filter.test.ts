import { describe, expect, it } from "vitest"

import {
    resolveWorkStatusQuery,
    WORK_STATUS_FILTER_OPTIONS,
    normalizeWorkStatusFilter,
} from "../work-status-filter"

describe("work status filter helpers", () => {
    it("keeps supported explicit statuses", () => {
        expect(normalizeWorkStatusFilter("FECHADA")).toBe("FECHADA")
        expect(normalizeWorkStatusFilter("PARA_INICIAR")).toBe("PARA_INICIAR")
        expect(normalizeWorkStatusFilter("EM_ANDAMENTO")).toBe("EM_ANDAMENTO")
        expect(normalizeWorkStatusFilter("CONCLUIDA")).toBe("CONCLUIDA")
    })

    it("defaults to FECHADA when param is empty/unknown", () => {
        expect(normalizeWorkStatusFilter(undefined)).toBe("FECHADA")
        expect(normalizeWorkStatusFilter("abc")).toBe("FECHADA")
    })

    it("exposes 4 filter options in expected order", () => {
        expect(WORK_STATUS_FILTER_OPTIONS.map((option) => option.value)).toEqual([
            "FECHADA",
            "PARA_INICIAR",
            "EM_ANDAMENTO",
            "CONCLUIDA",
        ])
    })

    it("uses explicit labels for closed and concluded filters", () => {
        const labels = Object.fromEntries(
            WORK_STATUS_FILTER_OPTIONS.map((option) => [option.value, option.label])
        )

        expect(labels.FECHADA).toBe("Obras Fechadas")
        expect(labels.CONCLUIDA).toBe("Obras Concluídas")
    })

    it("resolves closed and concluded filters to status/completion query", () => {
        expect(resolveWorkStatusQuery("FECHADA")).toEqual({
            status: "FECHADA",
            completion: "only_not_completed",
        })

        expect(resolveWorkStatusQuery("CONCLUIDA")).toEqual({
            status: "FECHADA",
            completion: "only_completed",
        })

        expect(resolveWorkStatusQuery("PARA_INICIAR")).toEqual({
            status: "PARA_INICIAR",
            completion: "all",
        })

        expect(resolveWorkStatusQuery("EM_ANDAMENTO")).toEqual({
            status: "EM_ANDAMENTO",
            completion: "all",
        })
    })
})
