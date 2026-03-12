type BuildDorataCloseableDescriptionParams = {
    clientName: string | null
    saleId: string
    isSplitRecipient: boolean
    commissionPercentDisplay: number | null | undefined
}

export function formatCommissionPercentDisplay(value: number | null | undefined) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return "—"
    return `${parsed.toFixed(2).replace(".", ",")}%`
}

export function buildDorataCloseableDescription(params: BuildDorataCloseableDescriptionParams) {
    const clientName = params.clientName?.trim() || params.saleId.slice(0, 8)
    if (!params.isSplitRecipient) {
        return `Fechamento Dorata - ${clientName}`
    }

    const splitPercentLabel = formatCommissionPercentDisplay(params.commissionPercentDisplay)
    if (splitPercentLabel === "—") {
        return `Fechamento Dorata (divisão) - ${clientName}`
    }

    return `Fechamento Dorata (divisão ${splitPercentLabel}) - ${clientName}`
}
