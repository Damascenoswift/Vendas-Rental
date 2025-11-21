import type { User, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type UserRole =
  | 'vendedor_externo'
  | 'vendedor_interno'
  | 'supervisor'
  | 'adm_mestre'
  | 'adm_dorata'

export type Brand = 'rental' | 'dorata'

export type UserProfile = {
  id: string
  role: UserRole
  companyName: string | null
  allowedBrands: Brand[]
}

const roleBrandsMap: Record<UserRole, Brand[]> = {
  vendedor_externo: ['rental', 'dorata'],
  vendedor_interno: ['rental'],
  supervisor: ['rental'],
  adm_dorata: ['dorata', 'rental'],
  adm_mestre: ['dorata', 'rental'],
}

export function getAllowedBrands(role: UserRole): Brand[] {
  return roleBrandsMap[role] ?? ['rental']
}

// @deprecated Use getProfile instead
export function buildUserProfile(user: User | null): UserProfile | null {
  if (!user) return null

  const role =
    (user.user_metadata?.role as UserRole | undefined) ?? 'vendedor_externo'
  const companyName =
    (user.user_metadata?.company_name as string | undefined) ?? null
  const allowedBrands = getAllowedBrands(role)

  return {
    id: user.id,
    role,
    companyName,
    allowedBrands,
  }
}

export async function getProfile(supabase: SupabaseClient<Database>, userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role, allowed_brands')
    .eq('id', userId)
    .single()

  if (error || !data) {
    console.error('Erro ao buscar perfil:', error)
    return null
  }

  // Converter tipos do banco para tipos da aplicação
  const role = data.role as UserRole
  const allowedBrands = (data.allowed_brands as Brand[]) ?? ['rental']

  return {
    id: userId,
    role,
    companyName: null, // A tabela users ainda não tem company_name, mantendo null por enquanto
    allowedBrands,
  }
}
