export type ProposalInverterAggregationInput = {
  quantity?: number | null
  productType?: string | null
  productName?: string | null
}

export type ProposalInverterItem = {
  name: string
  quantity: number
}

export type ProposalInverterAggregationResult = {
  inverterTotalQuantity: number | null
  inverterItems: ProposalInverterItem[]
  inverterNames: string[]
}

export function aggregateProposalInverterItems(
  items: ProposalInverterAggregationInput[]
): ProposalInverterAggregationResult {
  const byName = new Map<string, number>()
  let totalQuantity = 0

  for (const item of items) {
    const type = (item.productType ?? "").trim().toLowerCase()
    if (type !== "inverter") continue

    const quantity = Number(item.quantity ?? 0)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const name = (item.productName ?? "").trim() || "Inversor sem nome"
    byName.set(name, (byName.get(name) ?? 0) + quantity)
    totalQuantity += quantity
  }

  const inverterItems = Array.from(byName.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity
      return a.name.localeCompare(b.name, "pt-BR")
    })

  return {
    inverterTotalQuantity: totalQuantity > 0 ? totalQuantity : null,
    inverterItems,
    inverterNames: inverterItems.map((item) => item.name),
  }
}
