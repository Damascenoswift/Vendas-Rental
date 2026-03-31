export type PanoramaSellerProjection = {
  id: string
  negotiationStatus: string
  totalValue: number | null
  sellerId: string | null
  sellerName: string | null
  profitMargin?: number | null
}

export type SellerOption = {
  id: string
  label: string
}

export type PanoramaKpiProjection = {
  totalAberto: number
  totalFechamento: number
  totalConcluido: number
  qtdParados: number
}

export function summarizeClosedSales(proposals: PanoramaSellerProjection[]) {
  return proposals.reduce(
    (acc, proposal) => {
      if (proposal.negotiationStatus !== "convertido") return acc
      acc.count += 1
      acc.totalValue += proposal.totalValue ?? 0
      return acc
    },
    { count: 0, totalValue: 0 }
  )
}

export function buildSellerOptions(proposals: PanoramaSellerProjection[]): SellerOption[] {
  const bySeller = new Map<string, string>()

  for (const proposal of proposals) {
    const sellerId = proposal.sellerId?.trim()
    if (!sellerId) continue
    const sellerName = proposal.sellerName?.trim() || "Sem nome"
    if (!bySeller.has(sellerId)) {
      bySeller.set(sellerId, sellerName)
    }
  }

  return Array.from(bySeller.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

export function computeKpisFromProposals(
  proposals: PanoramaSellerProjection[]
): PanoramaKpiProjection {
  return proposals.reduce<PanoramaKpiProjection>(
    (acc, proposal) => {
      const total = proposal.totalValue ?? 0
      const status = proposal.negotiationStatus

      if (status === "convertido") {
        acc.totalConcluido += total
        return acc
      }

      acc.totalAberto += total

      if (status === "em_negociacao" || status === "followup") {
        acc.totalFechamento += total
      }

      if (status === "parado" || status === "perdido") {
        acc.qtdParados += 1
      }

      return acc
    },
    {
      totalAberto: 0,
      totalFechamento: 0,
      totalConcluido: 0,
      qtdParados: 0,
    }
  )
}

export function computeAverageMargin(proposals: PanoramaSellerProjection[]): number | null {
  let marginSum = 0
  let marginCount = 0

  for (const proposal of proposals) {
    const margin = proposal.profitMargin
    if (margin == null) continue
    marginSum += margin
    marginCount += 1
  }

  if (marginCount === 0) return null
  return Math.round((marginSum / marginCount) * 10) / 10
}
