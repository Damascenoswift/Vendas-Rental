import type { User, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type UserRole =
  | 'vendedor_externo'
  | 'vendedor_interno'
  | 'supervisor'
  | 'adm_mestre'
  | 'adm_dorata'
  | 'suporte_tecnico'
  | 'suporte_limitado'
  | 'investidor'
  | 'funcionario_n1'
  | 'funcionario_n2'

export type Brand = 'rental' | 'dorata'

export type UserProfile = {
  id: string
  role: UserRole
  companyName: string | null
  supervisedCompanyName: string | null
  department?: 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'outro' | null
  allowedBrands: Brand[]
  name?: string
  phone?: string
  email?: string
}

const roleBrandsMap: Record<UserRole, Brand[]> = {
  vendedor_externo: ['rental', 'dorata'],
  vendedor_interno: ['rental'],
  supervisor: ['rental'],
  adm_dorata: ['dorata', 'rental'],
  adm_mestre: ['dorata', 'rental'],
  suporte_tecnico: ['rental', 'dorata'],
  suporte_limitado: ['rental', 'dorata'],
  investidor: ['rental'],
  funcionario_n1: ['rental', 'dorata'],
  funcionario_n2: ['rental', 'dorata'],
}

export function getAllowedBrands(role: UserRole): Brand[] {
  return roleBrandsMap[role] ?? ['rental']
}

export function normalizeRole(role: UserRole, department?: UserProfile['department'] | null): UserRole {
  if (department === 'diretoria') {
    return 'adm_dorata'
  }
  return role
}

export function hasFullAccess(role?: UserRole | null, department?: UserProfile['department'] | null) {
  const effectiveRole = role ? normalizeRole(role, department) : null
  return effectiveRole === 'adm_mestre' || effectiveRole === 'adm_dorata'
}

// @deprecated Use getProfile instead
export function buildUserProfile(user: User | null): UserProfile | null {
  if (!user) return null

  const role =
    (user.user_metadata?.role as UserRole | undefined) ?? 'vendedor_externo'
  const department =
    (user.user_metadata?.department as UserProfile['department'] | undefined) ?? null
  const normalizedRole = normalizeRole(role, department)
  const companyName =
    (user.user_metadata?.company_name as string | undefined) ?? null
  const supervisedCompanyName =
    (user.user_metadata?.supervised_company_name as string | undefined) ?? null
  const allowedBrands = getAllowedBrands(normalizedRole)

  return {
    id: user.id,
    role: normalizedRole,
    companyName,
    supervisedCompanyName,
    department,
    allowedBrands,
    name: user.user_metadata?.nome,
    phone: user.user_metadata?.telefone,
    email: user.email,
  }
}

export async function getProfile(supabase: SupabaseClient<Database>, userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role, department, allowed_brands, name, phone, email, company_name, supervised_company_name')
    .eq('id', userId)
    .single()

  if (error || !data) {
    console.error('Erro ao buscar perfil:', error)
    return null
  }

  // Converter tipos do banco para tipos da aplicação
  const role = data.role as UserRole
  const department = (data as { department?: UserProfile['department'] | null }).department ?? null
  const normalizedRole = normalizeRole(role, department)
  const allowedBrands = (data.allowed_brands as Brand[]) ?? ['rental']

  return {
    id: userId,
    role: normalizedRole,
    companyName: (data as { company_name?: string | null }).company_name ?? null,
    supervisedCompanyName: (data as { supervised_company_name?: string | null }).supervised_company_name ?? null,
    department,
    allowedBrands,
    name: data.name || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
  }
}

export type ContractType = 'RENTAL_PF' | 'RENTAL_PJ' | 'DORATA_PF' | 'DORATA_PJ'
export type ContractStatus = 'DRAFT' | 'APPROVED' | 'EXPIRED'
