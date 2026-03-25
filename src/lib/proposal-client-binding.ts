export type ProposalClientCreationValidationError = {
    title: string
    description: string
}

function normalizeId(value?: string | null) {
    const trimmed = (value ?? "").trim()
    return trimmed ? trimmed : null
}

export function validateProposalClientCreation(params: {
    selectedIndicacaoId?: string | null
    selectedContactId?: string | null
    manualFirstName?: string | null
}): ProposalClientCreationValidationError | null {
    const selectedIndicacaoId = normalizeId(params.selectedIndicacaoId)
    const selectedContactId = normalizeId(params.selectedContactId)
    const manualFirstName = (params.manualFirstName ?? "").trim()

    if (selectedIndicacaoId || selectedContactId || manualFirstName) {
        return null
    }

    return {
        title: "Cliente obrigatório",
        description: "Selecione um contato/indicação ou informe pelo menos o nome para criar o cliente.",
    }
}

export function buildEditProposalClientLinkPatch(params: {
    initialClientId?: string | null
    initialContactId?: string | null
    selectedIndicacaoId?: string | null
    selectedContactId?: string | null
}) {
    const initialClientId = normalizeId(params.initialClientId)
    const initialContactId = normalizeId(params.initialContactId)
    const selectedIndicacaoId = normalizeId(params.selectedIndicacaoId)
    const selectedContactId = normalizeId(params.selectedContactId)

    const nextClientId = selectedIndicacaoId ?? (selectedContactId ? initialClientId : null)
    const nextContactId = selectedContactId

    if (nextClientId === initialClientId && nextContactId === initialContactId) {
        return {}
    }

    return {
        client_id: nextClientId,
        contact_id: nextContactId,
    }
}
