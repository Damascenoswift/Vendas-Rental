// src/lib/price-approval-utils.ts

/**
 * Recalculates the proposal total value for a given minimum margin.
 *
 * Priority:
 * 1. Use itemised costs if their sum is > 0 (null columns treated as 0 via COALESCE)
 * 2. Fall back to deriving cost from (original_value * (1 - original_margin/100))
 * 3. Return 0 if insufficient data
 */
export function calcNewValue(
  equipmentCost: number | null,
  laborCost: number | null,
  additionalCost: number | null,
  originalValue: number | null,
  originalMargin: number | null,
  admMinMargin: number
): number {
  const totalCost =
    (equipmentCost ?? 0) + (laborCost ?? 0) + (additionalCost ?? 0)

  if (totalCost > 0) {
    return totalCost / (1 - admMinMargin / 100)
  }

  // Fallback: reverse-engineer cost from original_value and original_margin
  if (originalValue != null && originalMargin != null) {
    const impliedCost = originalValue * (1 - originalMargin / 100)
    return impliedCost / (1 - admMinMargin / 100)
  }

  return 0
}

type InstallationType = "solo" | "telhado" | "misto"

/**
 * Derives installation type from the proposal's `calculation` JSON column.
 * The path is: calculation.input.structure.qtd_placas_solo / qtd_placas_telhado
 */
export function getInstallationType(calculation: unknown): InstallationType | null {
  if (!calculation || typeof calculation !== "object") return null
  const calc = calculation as Record<string, unknown>
  const input = calc.input
  if (!input || typeof input !== "object") return null
  const structure = (input as Record<string, unknown>).structure
  if (!structure || typeof structure !== "object") return null
  const s = structure as Record<string, unknown>
  const solo = Number(s.qtd_placas_solo ?? 0)
  const telhado = Number(s.qtd_placas_telhado ?? 0)
  if (solo > 0 && telhado === 0) return "solo"
  if (telhado > 0 && solo === 0) return "telhado"
  if (solo > 0 && telhado > 0) return "misto"
  return null
}
