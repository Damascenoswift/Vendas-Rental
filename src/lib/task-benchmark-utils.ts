import { differenceInBusinessDays } from "@/lib/business-days"

/** Calcula dias úteis entre duas datas. Mínimo 1. */
export function computeActualBusinessDays(start: Date, end: Date): number {
    const diff = differenceInBusinessDays(start, end)
    return Math.max(1, diff + 1)
}

/** Retorna true se `newDays` é melhor (menor) que o recorde atual. */
export function shouldUpdatePersonalRecord(
    currentBest: number | null,
    newDays: number
): boolean {
    if (currentBest === null) return true
    return newDays < currentBest
}
