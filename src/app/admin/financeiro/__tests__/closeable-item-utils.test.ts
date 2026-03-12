import { describe, expect, it } from 'vitest'
import {
    buildDorataCloseableDescription,
    formatCommissionPercentDisplay,
} from '../closeable-item-utils'

describe('closeable-item-utils', () => {
    it('formats percent for display using pt-BR style', () => {
        expect(formatCommissionPercentDisplay(1.5)).toBe('1,50%')
    })

    it('includes split commission percent in dorata closing description for split recipients', () => {
        const description = buildDorataCloseableDescription({
            clientName: 'Cliente Split',
            saleId: '12345678-1234-1234-1234-123456789abc',
            isSplitRecipient: true,
            commissionPercentDisplay: 1.5,
        })

        expect(description).toBe('Fechamento Dorata (divisão 1,50%) - Cliente Split')
    })
})
