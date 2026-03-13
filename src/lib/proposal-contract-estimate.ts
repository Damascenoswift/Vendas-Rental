type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as UnknownRecord
}

function normalizeEstimateValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

export function getManualContractProductionEstimate(calculation: unknown): string | null {
  const calculationRecord = asRecord(calculation)
  if (!calculationRecord) return null

  const contractRecord = asRecord(calculationRecord.contract)
  if (!contractRecord) return null

  return normalizeEstimateValue(contractRecord.manual_production_estimate)
}

export function withManualContractProductionEstimate(
  calculation: UnknownRecord,
  estimate: unknown,
): UnknownRecord {
  const normalizedEstimate = normalizeEstimateValue(estimate)
  const contractRecord = asRecord(calculation.contract)

  if (!normalizedEstimate) {
    if (!contractRecord || !("manual_production_estimate" in contractRecord)) {
      return calculation
    }

    const { manual_production_estimate: _manual, ...restContract } = contractRecord
    if (Object.keys(restContract).length === 0) {
      const { contract: _contract, ...restCalculation } = calculation
      return restCalculation
    }

    return {
      ...calculation,
      contract: restContract,
    }
  }

  return {
    ...calculation,
    contract: {
      ...(contractRecord ?? {}),
      manual_production_estimate: normalizedEstimate,
    },
  }
}
