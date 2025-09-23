import type { User } from '@supabase/supabase-js'

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
