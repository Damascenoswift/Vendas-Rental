import { describe, expect, it, vi } from 'vitest'
import { fetchAdminQuickLeads } from '../quick-leads-service'

type QuickLeadRow = {
    id: string
    user_id: string | null
    nome: string
    whatsapp: string
    observacao: string | null
    marca: string
    created_at: string
    users?: { name: string | null; email: string | null } | null
}

describe('fetchAdminQuickLeads', () => {
    it('falls back to manual users lookup when relationship is missing', async () => {
        const relationshipError = {
            message: "Could not find a relationship between 'quick_leads' and 'users' in the schema cache",
        }

        const fallbackRows: QuickLeadRow[] = [
            {
                id: 'lead-1',
                user_id: 'user-1',
                nome: 'Cliente Teste',
                whatsapp: '65999999999',
                observacao: null,
                marca: 'rental',
                created_at: '2026-03-11T09:00:00.000Z',
            },
        ]

        const from = vi.fn((table: string) => {
            if (table === 'quick_leads') {
                return {
                    select: (selection: string) => {
                        if (selection.includes('users(')) {
                            return {
                                order: vi.fn().mockResolvedValue({
                                    data: null,
                                    error: relationshipError,
                                }),
                            }
                        }

                        return {
                            order: vi.fn().mockResolvedValue({
                                data: fallbackRows,
                                error: null,
                            }),
                        }
                    },
                }
            }

            if (table === 'users') {
                return {
                    select: () => ({
                        in: vi.fn().mockResolvedValue({
                            data: [
                                {
                                    id: 'user-1',
                                    name: 'Vendedor Teste',
                                    email: 'vendedor@teste.com',
                                },
                            ],
                            error: null,
                        }),
                    }),
                }
            }

            throw new Error(`Unexpected table query: ${table}`)
        })

        type AdminQuickLeadsClient = Parameters<typeof fetchAdminQuickLeads>[0]
        const client: AdminQuickLeadsClient = {
            from: from as AdminQuickLeadsClient['from'],
        }

        const result = await fetchAdminQuickLeads(client)

        expect(result.error).toBeNull()
        expect(result.leads).toHaveLength(1)
        expect(result.leads[0].users).toEqual({
            name: 'Vendedor Teste',
            email: 'vendedor@teste.com',
        })
    })
})
