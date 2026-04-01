import { describe, expect, it } from "vitest"

import {
  applyProposalFinancialAdjustment,
  computeProposalMaterialBreakdown,
  getProposalFinancialPreview,
} from "@/lib/proposal-financial-adjustment-utils"

describe("proposal-financial-adjustment-utils", () => {
  it("calcula margem efetiva atual, estimada e variação em p.p.", () => {
    const preview = getProposalFinancialPreview({
      currentTotalValue: 100000,
      currentProfitValue: 15000,
      deltaTotalValue: -5000,
      deltaProfitValue: 2000,
    })

    expect(preview.currentMarginPercent).toBeCloseTo(15, 4)
    expect(preview.estimatedMarginPercent).toBeCloseTo(17.8947368421, 6)
    expect(preview.marginDeltaPercentagePoints).toBeCloseTo(2.8947368421, 6)
  })

  it("aplica delta positivo e negativo nos totais", () => {
    const result = applyProposalFinancialAdjustment({
      currentTotalValue: 87700,
      currentProfitValue: 11700,
      deltaTotalValue: -1200,
      deltaProfitValue: -300,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nextTotalValue).toBe(86500)
    expect(result.nextProfitValue).toBe(11400)
  })

  it("bloqueia quando o total final fica negativo", () => {
    const result = applyProposalFinancialAdjustment({
      currentTotalValue: 1000,
      currentProfitValue: 100,
      deltaTotalValue: -1500,
      deltaProfitValue: -50,
    })

    expect(result).toEqual({
      ok: false,
      error: "O valor total final não pode ser negativo.",
    })
  })

  it("agrega kit + estrutura + adicionais", () => {
    const breakdown = computeProposalMaterialBreakdown({
      kitCost: 38000,
      structureCost: 4200,
      additionalCost: 1500,
    })

    expect(breakdown.materialTotal).toBe(42200)
    expect(breakdown.materialWithAdditionalTotal).toBe(43700)
  })

  it("usa fallback de material quando kit/estrutura não existem", () => {
    const breakdown = computeProposalMaterialBreakdown({
      kitCost: null,
      structureCost: null,
      additionalCost: 1000,
      materialValueFallback: 25000,
    })

    expect(breakdown.materialTotal).toBe(25000)
    expect(breakdown.materialWithAdditionalTotal).toBe(26000)
  })
})
