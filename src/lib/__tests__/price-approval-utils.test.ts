// src/lib/__tests__/price-approval-utils.test.ts
import { describe, expect, it } from "vitest"
import { calcNewValue, getInstallationType } from "../price-approval-utils"

describe("calcNewValue", () => {
  it("uses itemised costs when all present", () => {
    // equipment=60000, labor=10000, additional=5000 → cost=75000
    // margin=15% → new_value = 75000 / (1 - 0.15) = 88235.29...
    const result = calcNewValue(60000, 10000, 5000, null, null, 15)
    expect(result).toBeCloseTo(88235.29, 0)
  })

  it("uses COALESCE for null cost columns (treats null as 0)", () => {
    // equipment=80000, labor=null, additional=null → cost=80000
    // margin=20% → new_value = 80000 / (1 - 0.20) = 100000
    const result = calcNewValue(80000, null, null, null, null, 20)
    expect(result).toBeCloseTo(100000, 0)
  })

  it("falls back to original_value + original_margin when all costs are null", () => {
    // original_value=100000, original_margin=20% → implied_cost = 80000
    // new margin=10% → new_value = 80000 / (1 - 0.10) = 88888.88...
    const result = calcNewValue(null, null, null, 100000, 20, 10)
    expect(result).toBeCloseTo(88888.89, 0)
  })

  it("returns 0 when all costs null and no original value/margin", () => {
    const result = calcNewValue(null, null, null, null, null, 15)
    expect(result).toBe(0)
  })

  it("handles zero costs correctly (falls back to original value path)", () => {
    // All zero is treated same as all null → fallback
    const result = calcNewValue(0, 0, 0, 100000, 20, 10)
    expect(result).toBeCloseTo(88888.89, 0)
  })
})

describe("getInstallationType", () => {
  it("returns 'solo' when only solo plates", () => {
    const calc = { input: { structure: { qtd_placas_solo: 10, qtd_placas_telhado: 0 } } }
    expect(getInstallationType(calc)).toBe("solo")
  })

  it("returns 'telhado' when only telhado plates", () => {
    const calc = { input: { structure: { qtd_placas_solo: 0, qtd_placas_telhado: 8 } } }
    expect(getInstallationType(calc)).toBe("telhado")
  })

  it("returns 'misto' when both", () => {
    const calc = { input: { structure: { qtd_placas_solo: 4, qtd_placas_telhado: 6 } } }
    expect(getInstallationType(calc)).toBe("misto")
  })

  it("returns null when neither field is present", () => {
    expect(getInstallationType({})).toBeNull()
    expect(getInstallationType(null)).toBeNull()
    expect(getInstallationType({ input: { structure: {} } })).toBeNull()
  })

  it("returns null when calculation is null/undefined", () => {
    expect(getInstallationType(null)).toBeNull()
    expect(getInstallationType(undefined)).toBeNull()
  })
})
