export type WorkStatusFilter = "FECHADA" | "PARA_INICIAR" | "EM_ANDAMENTO" | "CONCLUIDA"
export type WorkCardStatusQuery = "FECHADA" | "PARA_INICIAR" | "EM_ANDAMENTO"
export type WorkCompletionFilter = "all" | "only_completed" | "only_not_completed"

export const WORK_STATUS_FILTER_OPTIONS: Array<{ value: WorkStatusFilter; label: string }> = [
    { value: "FECHADA", label: "Obras Fechadas" },
    { value: "PARA_INICIAR", label: "Obras Para Iniciar" },
    { value: "EM_ANDAMENTO", label: "Obras em Andamento" },
    { value: "CONCLUIDA", label: "Obras Concluídas" },
]

export function normalizeWorkStatusFilter(value?: string | null): WorkStatusFilter {
    if (value === "PARA_INICIAR" || value === "EM_ANDAMENTO" || value === "FECHADA" || value === "CONCLUIDA") {
        return value
    }
    return "FECHADA"
}

export function resolveWorkStatusQuery(filter: WorkStatusFilter): {
    status: WorkCardStatusQuery
    completion: WorkCompletionFilter
} {
    if (filter === "CONCLUIDA") {
        return {
            status: "FECHADA",
            completion: "only_completed",
        }
    }

    if (filter === "FECHADA") {
        return {
            status: "FECHADA",
            completion: "only_not_completed",
        }
    }

    return {
        status: filter,
        completion: "all",
    }
}
