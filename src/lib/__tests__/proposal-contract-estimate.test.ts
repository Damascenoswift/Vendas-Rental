import { describe, expect, it } from "vitest"

import {
  formatManualContractProductionEstimateInput,
  getManualContractProductionEstimate,
  withManualContractProductionEstimate,
} from "../proposal-contract-estimate"

describe("proposal-contract-estimate helpers", () => {
  it("stores and reads manual contract estimate in calculation.contract", () => {
    const calculation = withManualContractProductionEstimate(
      {
        input: { dimensioning: { qtd_modulos: 10 } },
        output: { dimensioning: { kWh_estimado: 1200 } },
      },
      " 14.500 kWh ",
    )

    expect(getManualContractProductionEstimate(calculation)).toBe("14.500 kWh")
  })

  it("removes estimate key when value is empty and keeps unrelated fields", () => {
    const calculation = withManualContractProductionEstimate(
      {
        output: { dimensioning: { kWh_estimado: 9800 } },
        contract: {
          manual_production_estimate: "1000",
          clause_version: "v2",
        },
      },
      "   ",
    ) as Record<string, unknown>

    const contract = calculation.contract as Record<string, unknown>
    expect(contract.manual_production_estimate).toBeUndefined()
    expect(contract.clause_version).toBe("v2")
  })

  it("returns null when estimate is absent", () => {
    expect(
      getManualContractProductionEstimate({
        output: { dimensioning: { kWh_estimado: 800 } },
      }),
    ).toBeNull()
  })

  it("formats manual input as pt-BR number with KWH suffix", () => {
    expect(formatManualContractProductionEstimateInput("13500")).toBe("13.500 KWH")
    expect(formatManualContractProductionEstimateInput("13.500 kwh")).toBe("13.500 KWH")
    expect(formatManualContractProductionEstimateInput("abc")).toBe("")
  })
})
