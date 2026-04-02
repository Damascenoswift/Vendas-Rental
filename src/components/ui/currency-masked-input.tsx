"use client"

import { useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"
import {
    formatCurrencyEditingValue,
    formatCurrencyInputValue,
    parseCurrencyInputValue,
} from "@/lib/currency-input"

type CurrencyMaskedInputProps = Omit<
    ComponentProps<typeof Input>,
    "type" | "inputMode" | "value" | "onChange"
> & {
    value: number
    onValueChange: (value: number) => void
    fractionDigits?: number
    showCurrencySymbol?: boolean
}

export function CurrencyMaskedInput({
    value,
    onValueChange,
    fractionDigits = 2,
    showCurrencySymbol = true,
    onFocus,
    onBlur,
    ...props
}: CurrencyMaskedInputProps) {
    const [draftValue, setDraftValue] = useState<string | null>(null)

    const displayedValue =
        draftValue ??
        formatCurrencyInputValue(value, {
            fractionDigits,
            withSymbol: showCurrencySymbol,
        })

    return (
        <Input
            {...props}
            type="text"
            inputMode="decimal"
            value={displayedValue}
            onFocus={(event) => {
                if (draftValue === null) {
                    setDraftValue(
                        formatCurrencyEditingValue(value, {
                            fractionDigits,
                            withSymbol: showCurrencySymbol,
                        })
                    )
                }
                onFocus?.(event)
            }}
            onChange={(event) => {
                const parsed = parseCurrencyInputValue(event.target.value, {
                    fractionDigits,
                    withSymbol: showCurrencySymbol,
                })
                setDraftValue(parsed.displayValue)
                onValueChange(parsed.numericValue)
            }}
            onBlur={(event) => {
                setDraftValue(null)
                onBlur?.(event)
            }}
        />
    )
}
