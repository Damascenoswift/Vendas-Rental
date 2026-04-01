import { describe, expect, it } from "vitest"

import { aggregateProposalInverterItems } from "@/lib/proposal-inverter-utils"

describe("proposal-inverter-utils", () => {
  it("agrega quantidade total de inversores", () => {
    const summary = aggregateProposalInverterItems([
      { productType: "inverter", productName: "Inversor A", quantity: 2 },
      { productType: "inverter", productName: "Inversor B", quantity: 1 },
      { productType: "module", productName: "Módulo X", quantity: 40 },
    ])

    expect(summary.inverterTotalQuantity).toBe(3)
  })

  it("agrega quantidade por nome/modelo de inversor", () => {
    const summary = aggregateProposalInverterItems([
      { productType: "inverter", productName: "Inversor 75kW", quantity: 1 },
      { productType: "inverter", productName: "Inversor 75kW", quantity: 2 },
      { productType: "inverter", productName: "Inversor 50kW", quantity: 3 },
    ])

    expect(summary.inverterItems).toEqual([
      { name: "Inversor 50kW", quantity: 3 },
      { name: "Inversor 75kW", quantity: 3 },
    ])
  })
})
