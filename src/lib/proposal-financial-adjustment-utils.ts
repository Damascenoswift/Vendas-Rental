export type ProposalFinancialPreviewInput = {
  currentTotalValue: number | null | undefined
  currentProfitValue: number | null | undefined
  deltaTotalValue: number | null | undefined
  deltaProfitValue: number | null | undefined
}

export type ProposalFinancialPreview = {
  currentTotalValue: number
  currentProfitValue: number
  estimatedTotalValue: number
  estimatedProfitValue: number
  currentMarginPercent: number | null
  estimatedMarginPercent: number | null
  marginDeltaPercentagePoints: number | null
  totalWouldBeNegative: boolean
}

export type ProposalFinancialAdjustmentResult =
  | {
      ok: true
      nextTotalValue: number
      nextProfitValue: number
      nextMarginPercent: number | null
    }
  | {
      ok: false
      error: string
    }

export type ProposalMaterialBreakdownInput = {
  kitCost?: number | null
  structureCost?: number | null
  additionalCost?: number | null
  materialValueFallback?: number | null
}

export type ProposalMaterialBreakdown = {
  kitCost: number | null
  structureCost: number | null
  additionalCost: number | null
  materialTotal: number | null
  materialWithAdditionalTotal: number | null
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === "string" && value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function toNumberOrZero(value: unknown): number {
  return toFiniteNumber(value) ?? 0
}

export function computeEffectiveMarginPercent(
  totalValue: number | null | undefined,
  profitValue: number | null | undefined
): number | null {
  const total = toFiniteNumber(totalValue)
  const profit = toFiniteNumber(profitValue)
  if (total == null || total <= 0 || profit == null) return null
  return (profit / total) * 100
}

export function getProposalFinancialPreview(
  input: ProposalFinancialPreviewInput
): ProposalFinancialPreview {
  const currentTotalValue = toNumberOrZero(input.currentTotalValue)
  const currentProfitValue = toNumberOrZero(input.currentProfitValue)
  const deltaTotalValue = toNumberOrZero(input.deltaTotalValue)
  const deltaProfitValue = toNumberOrZero(input.deltaProfitValue)

  const estimatedTotalValue = currentTotalValue + deltaTotalValue
  const estimatedProfitValue = currentProfitValue + deltaProfitValue
  const currentMarginPercent = computeEffectiveMarginPercent(currentTotalValue, currentProfitValue)
  const estimatedMarginPercent = computeEffectiveMarginPercent(estimatedTotalValue, estimatedProfitValue)

  return {
    currentTotalValue,
    currentProfitValue,
    estimatedTotalValue,
    estimatedProfitValue,
    currentMarginPercent,
    estimatedMarginPercent,
    marginDeltaPercentagePoints:
      currentMarginPercent != null && estimatedMarginPercent != null
        ? estimatedMarginPercent - currentMarginPercent
        : null,
    totalWouldBeNegative: estimatedTotalValue < 0,
  }
}

export function applyProposalFinancialAdjustment(
  input: ProposalFinancialPreviewInput
): ProposalFinancialAdjustmentResult {
  const preview = getProposalFinancialPreview(input)
  if (preview.totalWouldBeNegative) {
    return {
      ok: false,
      error: "O valor total final não pode ser negativo.",
    }
  }

  return {
    ok: true,
    nextTotalValue: preview.estimatedTotalValue,
    nextProfitValue: preview.estimatedProfitValue,
    nextMarginPercent: preview.estimatedMarginPercent,
  }
}

export function computeProposalMaterialBreakdown(
  input: ProposalMaterialBreakdownInput
): ProposalMaterialBreakdown {
  const kitCost = toFiniteNumber(input.kitCost)
  const structureCost = toFiniteNumber(input.structureCost)
  const additionalCost = toFiniteNumber(input.additionalCost)
  const materialValueFallback = toFiniteNumber(input.materialValueFallback)

  const hasKitOrStructure = kitCost != null || structureCost != null
  const materialTotal = hasKitOrStructure
    ? (kitCost ?? 0) + (structureCost ?? 0)
    : materialValueFallback
  const materialWithAdditionalTotal =
    materialTotal != null || additionalCost != null
      ? (materialTotal ?? 0) + (additionalCost ?? 0)
      : null

  return {
    kitCost,
    structureCost,
    additionalCost,
    materialTotal,
    materialWithAdditionalTotal,
  }
}
