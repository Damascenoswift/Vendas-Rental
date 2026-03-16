export type WorkStatusFilter = "FECHADA" | "PARA_INICIAR" | "EM_ANDAMENTO"

export const WORK_STATUS_FILTER_OPTIONS: Array<{ value: WorkStatusFilter; label: string }> = [
    { value: "FECHADA", label: "Obras Concluídas" },
    { value: "PARA_INICIAR", label: "Obras Para Iniciar" },
    { value: "EM_ANDAMENTO", label: "Obras em Andamento" },
]

export function normalizeWorkStatusFilter(value?: string | null): WorkStatusFilter {
    if (value === "PARA_INICIAR" || value === "EM_ANDAMENTO" || value === "FECHADA") return value
    if (value === "CONCLUIDA") return "FECHADA"
    return "FECHADA"
}
