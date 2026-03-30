import type { User, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hasInternalChatAccess } from '@/lib/internal-chat-access'
import { hasWhatsAppInboxAccess } from '@/lib/whatsapp-inbox-access'
import { hasTaskAnalystAccess } from '@/lib/task-analyst-access'

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
  salesAccess?: boolean | null
  internalChatAccess?: boolean | null
  whatsappInboxAccess?: boolean | null
  taskAnalystAccess?: boolean | null
  department?: 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'obras' | 'outro' | null
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

export function hasRestrictedFinancialAccess(params: {
  role?: UserRole | null
  department?: UserProfile['department'] | null
  email?: string | null
}) {
  const normalizedEmail = (params.email ?? "").trim().toLowerCase()
  const isOwnerByRole = params.role === "adm_mestre"
  const isOwnerByEmail = normalizedEmail === "suporte@dorataenergia.com"
  const isFinanceDepartment = params.department === "financeiro"
  return isOwnerByRole || isOwnerByEmail || isFinanceDepartment
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
  const salesAccess = (user.user_metadata?.sales_access as boolean | undefined) ?? null
  const internalChatAccessMeta = user.user_metadata?.internal_chat_access as boolean | undefined
  const taskAnalystAccessMeta = user.user_metadata?.task_analyst_access as boolean | undefined
  const internalChatAccess = hasInternalChatAccess({
    role: normalizedRole,
    department,
    internal_chat_access: typeof internalChatAccessMeta === "boolean" ? internalChatAccessMeta : null,
  })
  const taskAnalystAccess = hasTaskAnalystAccess({
    role: normalizedRole,
    task_analyst_access: typeof taskAnalystAccessMeta === "boolean" ? taskAnalystAccessMeta : null,
  })

  return {
    id: user.id,
    role: normalizedRole,
    companyName,
    supervisedCompanyName,
    salesAccess,
    internalChatAccess,
    taskAnalystAccess,
    department,
    allowedBrands,
    name: user.user_metadata?.nome,
    phone: user.user_metadata?.telefone,
    email: user.email,
  }
}

export async function getProfile(supabase: SupabaseClient<Database>, userId: string): Promise<UserProfile | null> {
  let selectColumns = 'role, department, allowed_brands, sales_access, internal_chat_access, whatsapp_inbox_access, task_analyst_access, name, phone, email, company_name, supervised_company_name'

  let { data, error } = await supabase
    .from('users')
    .select(selectColumns)
    .eq('id', userId)
    .single()

  const missingSalesAccessColumn = error && /could not find the 'sales_access' column/i.test(error.message ?? '')
  const missingInternalChatAccessColumn =
    error && /could not find the 'internal_chat_access' column/i.test(error.message ?? '')
  const missingWhatsAppInboxAccessColumn =
    error && /could not find the 'whatsapp_inbox_access' column/i.test(error.message ?? '')
  const missingTaskAnalystAccessColumn =
    error && /could not find the 'task_analyst_access' column/i.test(error.message ?? '')

  if (
    missingSalesAccessColumn ||
    missingInternalChatAccessColumn ||
    missingWhatsAppInboxAccessColumn ||
    missingTaskAnalystAccessColumn
  ) {
    const fallbackColumns = [
      'role',
      'department',
      'allowed_brands',
      'name',
      'phone',
      'email',
      'company_name',
      'supervised_company_name',
    ]

    if (!missingSalesAccessColumn) {
      fallbackColumns.splice(3, 0, 'sales_access')
    }

    if (!missingInternalChatAccessColumn) {
      fallbackColumns.splice(missingSalesAccessColumn ? 3 : 4, 0, 'internal_chat_access')
    }

    if (!missingWhatsAppInboxAccessColumn) {
      const insertIndex = fallbackColumns.includes('internal_chat_access')
        ? fallbackColumns.indexOf('internal_chat_access') + 1
        : fallbackColumns.includes('sales_access')
          ? fallbackColumns.indexOf('sales_access') + 1
          : 3
      fallbackColumns.splice(insertIndex, 0, 'whatsapp_inbox_access')
    }

    if (!missingTaskAnalystAccessColumn) {
      const insertIndex = fallbackColumns.includes('whatsapp_inbox_access')
        ? fallbackColumns.indexOf('whatsapp_inbox_access') + 1
        : fallbackColumns.includes('internal_chat_access')
          ? fallbackColumns.indexOf('internal_chat_access') + 1
          : fallbackColumns.includes('sales_access')
            ? fallbackColumns.indexOf('sales_access') + 1
            : 3
      fallbackColumns.splice(insertIndex, 0, 'task_analyst_access')
    }

    selectColumns = fallbackColumns.join(', ')
    const fallback = await supabase
      .from('users')
      .select(selectColumns)
      .eq('id', userId)
      .single()

    data = fallback.data as typeof data
    error = fallback.error as typeof error
  }

  if (error || !data) {
    console.error('Erro ao buscar perfil:', error)
    return null
  }

  const row = data as unknown as {
    role: string
    department?: UserProfile['department'] | null
    allowed_brands?: Brand[] | null
    name?: string | null
    phone?: string | null
    email?: string | null
    company_name?: string | null
    supervised_company_name?: string | null
    sales_access?: boolean | null
    internal_chat_access?: boolean | null
    whatsapp_inbox_access?: boolean | null
    task_analyst_access?: boolean | null
  }

  // Converter tipos do banco para tipos da aplicação
  const role = row.role as UserRole
  const department = row.department ?? null
  const normalizedRole = normalizeRole(role, department)
  const allowedBrands = row.allowed_brands ?? ['rental']

  return {
    id: userId,
    role: normalizedRole,
    companyName: row.company_name ?? null,
    supervisedCompanyName: row.supervised_company_name ?? null,
    salesAccess: row.sales_access ?? null,
    internalChatAccess: hasInternalChatAccess({
      role: normalizedRole,
      department,
      internal_chat_access: typeof row.internal_chat_access === "boolean" ? row.internal_chat_access : null,
    }),
    whatsappInboxAccess: hasWhatsAppInboxAccess({
      role: normalizedRole,
      whatsapp_inbox_access:
        typeof row.whatsapp_inbox_access === "boolean" ? row.whatsapp_inbox_access : null,
    }),
    taskAnalystAccess: hasTaskAnalystAccess({
      role: normalizedRole,
      task_analyst_access:
        typeof row.task_analyst_access === "boolean" ? row.task_analyst_access : null,
    }),
    department,
    allowedBrands,
    name: row.name || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
  }
}

export type ContractType = 'RENTAL_PF' | 'RENTAL_PJ' | 'DORATA_PF' | 'DORATA_PJ'
export type ContractStatus = 'DRAFT' | 'APPROVED' | 'EXPIRED'
