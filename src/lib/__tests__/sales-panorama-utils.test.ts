import { describe, expect, it } from "vitest"

import {
  buildSellerOptions,
  computeAverageMargin,
  computeKpisFromProposals,
  summarizeClosedSales,
  type PanoramaSellerProjection,
} from "@/lib/sales-panorama-utils"

const baseProposals: PanoramaSellerProjection[] = [
  {
    id: "p1",
    negotiationStatus: "convertido",
    totalValue: 100000,
    sellerId: "s1",
    sellerName: "Vendedor A",
  },
  {
    id: "p2",
    negotiationStatus: "convertido",
    totalValue: 50000,
    sellerId: "s1",
    sellerName: "Vendedor A",
  },
  {
    id: "p3",
    negotiationStatus: "convertido",
    totalValue: 70000,
    sellerId: "s2",
    sellerName: "Vendedor B",
  },
  {
    id: "p4",
    negotiationStatus: "em_negociacao",
    totalValue: 80000,
    sellerId: "s2",
    sellerName: "Vendedor B",
    profitMargin: 20,
  },
  {
    id: "p5",
    negotiationStatus: "parado",
    totalValue: 20000,
    sellerId: "s2",
    sellerName: "Vendedor B",
    profitMargin: 10,
  },
]

describe("sales-panorama-utils", () => {
  it("calcula vendas fechadas considerando apenas status convertido", () => {
    const summary = summarizeClosedSales(baseProposals)

    expect(summary.count).toBe(3)
    expect(summary.totalValue).toBe(220000)
  })

  it("gera opções únicas de vendedor ordenadas por nome", () => {
    const options = buildSellerOptions(baseProposals)

    expect(options).toEqual([
      { id: "s1", label: "Vendedor A" },
      { id: "s2", label: "Vendedor B" },
    ])
  })

  it("calcula KPIs financeiros com base no status de negociação", () => {
    const kpis = computeKpisFromProposals(baseProposals)

    expect(kpis.totalAberto).toBe(100000)
    expect(kpis.totalFechamento).toBe(80000)
    expect(kpis.totalConcluido).toBe(220000)
    expect(kpis.qtdParados).toBe(1)
  })

  it("calcula margem média somente com valores válidos", () => {
    const avg = computeAverageMargin(baseProposals)
    expect(avg).toBe(15)
  })
})
