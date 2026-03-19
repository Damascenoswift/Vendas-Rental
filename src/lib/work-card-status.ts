export type WorkCardStatus = "FECHADA" | "PARA_INICIAR" | "EM_ANDAMENTO"

export type WorkCardCompletionMode = "auto" | "open" | "completed"

export function resolveWorkCardStatusLabel(input: {
    status: WorkCardStatus
    completedAt?: string | null
}) {
    if (input.status === "FECHADA") {
        return input.completedAt ? "Obra Concluída" : "Obra Fechada"
    }

    if (input.status === "PARA_INICIAR") return "Obra Para Iniciar"
    return "Obra em Andamento"
}

export function resolveWorkCardCompletedAt(input: {
    currentStatus: WorkCardStatus
    currentCompletedAt: string | null
    nextStatus: WorkCardStatus
    nowIso?: string
    completionMode?: WorkCardCompletionMode
}) {
    if (input.nextStatus !== "FECHADA") return null

    const mode = input.completionMode ?? "auto"
    if (mode === "open") return null

    if (mode === "completed") {
        return input.currentCompletedAt ?? input.nowIso ?? new Date().toISOString()
    }

    if (input.currentStatus === "FECHADA") {
        return input.currentCompletedAt ?? null
    }

    return null
}

export function shouldUpdateWorkCardStatus(input: {
    current: {
        status: WorkCardStatus
        completedAt: string | null
    }
    nextStatus: WorkCardStatus
    nextCompletedAt: string | null
}) {
    return input.current.status !== input.nextStatus || (input.current.completedAt ?? null) !== (input.nextCompletedAt ?? null)
}
