const DAY_IN_MS = 24 * 60 * 60 * 1000

function toUtcDate(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addCalendarDays(date: Date, amount: number) {
    return new Date(date.getTime() + amount * DAY_IN_MS)
}

export function isBusinessDay(date: Date) {
    const dayOfWeek = date.getUTCDay()
    return dayOfWeek >= 1 && dayOfWeek <= 5
}

export function addBusinessDays(startDate: Date, businessDays: number) {
    if (!Number.isFinite(businessDays) || businessDays < 0) {
        throw new Error("businessDays must be a non-negative number.")
    }

    let remaining = Math.trunc(businessDays)
    let cursor = toUtcDate(startDate)

    while (remaining > 0) {
        cursor = addCalendarDays(cursor, 1)
        if (isBusinessDay(cursor)) remaining -= 1
    }

    return cursor
}

export function differenceInBusinessDays(fromDate: Date, toDate: Date) {
    const from = toUtcDate(fromDate)
    const to = toUtcDate(toDate)

    if (from.getTime() === to.getTime()) return 0

    const step = from.getTime() < to.getTime() ? 1 : -1
    let cursor = from
    let difference = 0

    while ((step > 0 && cursor < to) || (step < 0 && cursor > to)) {
        cursor = addCalendarDays(cursor, step)
        if (isBusinessDay(cursor)) difference += step
    }

    return difference
}
