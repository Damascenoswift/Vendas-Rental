const CURRENCY_PREFIX_REGEX = /R\$\s?/gi

export type CurrencyInputOptions = {
    fractionDigits?: number
    withSymbol?: boolean
}

export type ParsedCurrencyInputValue = {
    displayValue: string
    numericValue: number
}

function normalizeFractionDigits(value?: number) {
    if (!Number.isFinite(value)) return 2
    const rounded = Math.trunc(value as number)
    if (rounded < 0) return 0
    if (rounded > 6) return 6
    return rounded
}

function formatIntegerPart(value: number) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value)
}

export function formatCurrencyInputValue(value: number, options: CurrencyInputOptions = {}) {
    const fractionDigits = normalizeFractionDigits(options.fractionDigits)
    const withSymbol = options.withSymbol ?? true
    const safeValue = Number.isFinite(value) ? value : 0
    const formatted = new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(safeValue)
    return withSymbol ? `R$ ${formatted}` : formatted
}

export function formatCurrencyEditingValue(value: number, options: CurrencyInputOptions = {}) {
    const fractionDigits = normalizeFractionDigits(options.fractionDigits)
    const withSymbol = options.withSymbol ?? true
    const safeValue = Number.isFinite(value) ? value : 0

    if (Math.abs(safeValue) < Number.EPSILON) {
        return ""
    }

    const formatted = new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
    }).format(safeValue)

    return withSymbol ? `R$ ${formatted}` : formatted
}

export function parseCurrencyInputValue(rawValue: string, options: CurrencyInputOptions = {}): ParsedCurrencyInputValue {
    const fractionDigits = normalizeFractionDigits(options.fractionDigits)
    const withSymbol = options.withSymbol ?? true

    const cleaned = (rawValue ?? "")
        .replace(CURRENCY_PREFIX_REGEX, "")
        .trim()

    if (!cleaned) {
        return {
            displayValue: "",
            numericValue: 0,
        }
    }

    const commaIndex = cleaned.indexOf(",")
    const hasDecimalPart = commaIndex >= 0 && fractionDigits > 0
    const integerDigits = (hasDecimalPart ? cleaned.slice(0, commaIndex) : cleaned).replace(/\D/g, "")
    const decimalDigits = hasDecimalPart
        ? cleaned.slice(commaIndex + 1).replace(/\D/g, "").slice(0, fractionDigits)
        : ""

    const normalizedInteger = integerDigits.replace(/^0+(?=\d)/, "") || "0"
    const integerValue = Number(normalizedInteger)
    const safeIntegerValue = Number.isFinite(integerValue) ? integerValue : 0

    let numericValue = safeIntegerValue
    if (hasDecimalPart && decimalDigits.length > 0) {
        numericValue += Number(decimalDigits) / Math.pow(10, decimalDigits.length)
    }

    const groupedInteger = formatIntegerPart(safeIntegerValue)
    const displayNumber = hasDecimalPart ? `${groupedInteger},${decimalDigits}` : groupedInteger

    return {
        displayValue: withSymbol ? `R$ ${displayNumber}` : displayNumber,
        numericValue,
    }
}
