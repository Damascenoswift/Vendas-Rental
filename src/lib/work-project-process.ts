export type WorkProjectProcessScope = "PRIMARY" | "LINKED"

export const WORK_PROJECT_PROCESS_PRIMARY_LABEL = "Orçamento principal"
export const WORK_PROJECT_PROCESS_LINKED_LABEL = "Orçamento vinculado"

function normalizeProjectScopeToken(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
}

function toScope(token: string): WorkProjectProcessScope | null {
    const normalized = normalizeProjectScopeToken(token)
    if (normalized === "principal") return "PRIMARY"
    if (normalized === "vinculado" || normalized === "secundario" || normalized === "secundaria") return "LINKED"
    return null
}

export function formatWorkProjectProcessTitle(baseTitle: string, scope: WorkProjectProcessScope) {
    const normalizedBaseTitle = baseTitle.trim()
    const scopeLabel = scope === "PRIMARY"
        ? WORK_PROJECT_PROCESS_PRIMARY_LABEL
        : WORK_PROJECT_PROCESS_LINKED_LABEL

    return `${normalizedBaseTitle} (${scopeLabel})`
}

export function buildWorkProjectProcessTitles(baseTitle: string) {
    return [
        formatWorkProjectProcessTitle(baseTitle, "PRIMARY"),
        formatWorkProjectProcessTitle(baseTitle, "LINKED"),
    ] as const
}

export function parseWorkProjectProcessTitle(title: string): {
    baseTitle: string
    scope: WorkProjectProcessScope | null
} {
    const normalizedTitle = title.trim()

    const parenthesisMatch = normalizedTitle.match(/^(.*?)\s*\(\s*Or[cç]?amento\s+([^\)]+)\s*\)$/i)
    if (parenthesisMatch) {
        const scope = toScope(parenthesisMatch[2])
        if (scope) {
            return {
                baseTitle: parenthesisMatch[1].trim(),
                scope,
            }
        }
    }

    const dashMatch = normalizedTitle.match(/^(.*?)\s*[\-\u2013\u2014]\s*Or[cç]?amento\s+(.+)$/i)
    if (dashMatch) {
        const scope = toScope(dashMatch[2])
        if (scope) {
            return {
                baseTitle: dashMatch[1].trim(),
                scope,
            }
        }
    }

    return {
        baseTitle: normalizedTitle,
        scope: null,
    }
}
