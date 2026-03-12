type SupabaseError = {
    message?: string | null
}

type QuickLeadUser = {
    name: string | null
    email: string | null
}

type QuickLeadRow = {
    id: string
    user_id: string | null
    nome: string
    whatsapp: string
    observacao: string | null
    marca: string
    created_at: string
    users?: QuickLeadUser | QuickLeadUser[] | null
}

type QueryResult<T> = PromiseLike<{
    data: T[] | null
    error: SupabaseError | null
}>

type SupabaseQueryBuilder = {
    order: (column: string, options: { ascending: boolean }) => QueryResult<QuickLeadRow>
}

type SupabaseUsersQueryBuilder = {
    in: (column: string, values: string[]) => QueryResult<{ id: string; name: string | null; email: string | null }>
}

export interface QuickLeadsClient {
    from(table: 'quick_leads'): {
        select: (columns: string) => SupabaseQueryBuilder
    }
    from(table: 'users'): {
        select: (columns: string) => SupabaseUsersQueryBuilder
    }
}

const QUICK_LEAD_BASE_COLUMNS = 'id, user_id, nome, whatsapp, observacao, marca, created_at'
const QUICK_LEAD_COLUMNS_WITH_USERS = `${QUICK_LEAD_BASE_COLUMNS}, users(name, email)`
const RELATIONSHIP_ERROR_REGEX = /relationship between 'quick_leads' and 'users'/i

function normalizeJoinedUser(user: QuickLeadRow['users']): QuickLeadUser | null {
    if (!user) return null
    if (Array.isArray(user)) return user[0] ?? null
    return user
}

export type FetchAdminQuickLeadsResult = {
    leads: (QuickLeadRow & { users: QuickLeadUser | null })[]
    error: string | null
}

export async function fetchAdminQuickLeads(
    client: QuickLeadsClient
): Promise<FetchAdminQuickLeadsResult> {
    let { data, error } = await client
        .from('quick_leads')
        .select(QUICK_LEAD_COLUMNS_WITH_USERS)
        .order('created_at', { ascending: false })

    if (error && RELATIONSHIP_ERROR_REGEX.test(error.message ?? '')) {
        const fallback = await client
            .from('quick_leads')
            .select(QUICK_LEAD_BASE_COLUMNS)
            .order('created_at', { ascending: false })

        data = fallback.data
        error = fallback.error
    }

    if (error) {
        return {
            leads: [],
            error: error.message ?? 'Erro desconhecido ao carregar leads',
        }
    }

    const rows = (data ?? []) as QuickLeadRow[]
    const userIds = Array.from(
        new Set(
            rows
                .filter((row) => !normalizeJoinedUser(row.users) && row.user_id)
                .map((row) => row.user_id)
                .filter((userId): userId is string => Boolean(userId))
        )
    )

    const usersById = new Map<string, QuickLeadUser>()
    if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await client
            .from('users')
            .select('id, name, email')
            .in('id', userIds)

        if (usersError) {
            console.error('Erro ao buscar usuários para quick leads:', usersError)
        } else {
            ;(usersData ?? []).forEach((user) => {
                usersById.set(user.id, {
                    name: user.name ?? null,
                    email: user.email ?? null,
                })
            })
        }
    }

    return {
        leads: rows.map((row) => ({
            ...row,
            users: normalizeJoinedUser(row.users) ?? (row.user_id ? usersById.get(row.user_id) ?? null : null),
        })),
        error: null,
    }
}
