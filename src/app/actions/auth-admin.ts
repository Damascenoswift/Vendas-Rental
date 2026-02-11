'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { UserRole, Brand, UserProfile } from '@/lib/auth'
import { hasFullAccess } from '@/lib/auth'

// Schema de validação
const userRoleValues = [
    'vendedor_externo',
    'vendedor_interno',
    'supervisor',
    'adm_mestre',
    'adm_dorata',
    'suporte_tecnico',
    'suporte_limitado',
    'investidor',
    'funcionario_n1',
    'funcionario_n2',
] as const

const optionalString = (value: FormDataEntryValue | null) => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length ? trimmed : undefined
}

const isValidRole = (value: unknown): value is UserRole => {
    return userRoleValues.includes(value as UserRole)
}

const normalizeBrands = (value: unknown): Brand[] => {
    if (Array.isArray(value)) {
        const valid = value.filter((item): item is Brand => item === 'rental' || item === 'dorata')
        if (valid.length > 0) return valid
    }
    return ['rental']
}

const chunkArray = <T>(items: T[], size: number) => {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}

const createUserSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    name: z.string().min(1, 'Nome é obrigatório'),
    phone: z.string().optional(),
    role: z.enum(userRoleValues),
    department: z.enum(['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro']).optional(),
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
    supervisor_id: z.string().optional(),
    company_name: z.string().optional(),
    supervised_company_name: z.string().optional(),
})

export type CreateUserState = {
    success: boolean
    message: string
    errors?: Record<string, string[]>
}

type AdminPermissionMode = 'read-users' | 'manage-users'

async function checkAdminPermission(mode: AdminPermissionMode = 'read-users') {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { authorized: false, message: 'Você precisa estar logado.' }
    }

    let supabaseAdmin
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error('Erro ao inicializar cliente admin:', error)
        return { success: false, message: 'Configuração do servidor inválida para criar usuários.' }
    }
    const { data: currentUserProfile } = await supabaseAdmin
        .from('users')
        .select('role, email, department')
        .eq('id', user.id)
        .single()

    const role = (currentUserProfile?.role ?? user.user_metadata?.role) as UserRole | undefined
    const department = (currentUserProfile as { department?: UserProfile['department'] | null } | null)?.department ?? null
    const ownerId = process.env.USER_MANAGEMENT_OWNER_ID
    const ownerEmail = process.env.USER_MANAGEMENT_OWNER_EMAIL?.toLowerCase()
    const userEmail = (user.email ?? currentUserProfile?.email ?? '').toLowerCase()
    const isOwner =
        (ownerId && user.id === ownerId) ||
        (ownerEmail && userEmail === ownerEmail) ||
        (!ownerId && !ownerEmail && hasFullAccess(role ?? null, department))

    if (mode === 'manage-users') {
        if (!isOwner) {
            return { authorized: false, message: 'Acesso negado. Apenas o perfil proprietário pode alterar usuários.' }
        }
        return { authorized: true, role, isOwner }
    }

    const allowedReadRoles: UserRole[] = ['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2']
    if (!role || (!allowedReadRoles.includes(role) && !hasFullAccess(role, department))) {
        return { authorized: false, message: 'Acesso negado. Apenas administradores podem realizar esta ação.' }
    }

    return { authorized: true, role, isOwner }
}

export async function createUser(prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
    const permission = await checkAdminPermission('manage-users')
    if (!permission.authorized) {
        return { success: false, message: permission.message || 'Erro de permissão' }
    }

    const rawData = {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        phone: formData.get('phone'),
        role: formData.get('role'),
        department: optionalString(formData.get('department')),
        brands: formData.getAll('brands'),
        supervisor_id: optionalString(formData.get('supervisor_id')),
        company_name: optionalString(formData.get('company_name')),
        supervised_company_name: optionalString(formData.get('supervised_company_name')),
    }

    const validated = createUserSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos. Verifique o formulário.',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    const {
        email,
        password,
        name,
        phone,
        role,
        brands,
        department,
        supervisor_id,
        company_name,
        supervised_company_name,
    } = validated.data
    const normalizedCompanyName = role === 'vendedor_interno' ? company_name ?? null : null
    const normalizedSupervisedCompanyName = role === 'supervisor' ? supervised_company_name ?? null : null

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            nome: name,
            telefone: phone,
            role: role,
            department: department || 'outro',
            brands,
            company_name: normalizedCompanyName,
            supervised_company_name: normalizedSupervisedCompanyName,
        }
    })

    if (createError) {
        console.error('Erro ao criar usuário:', createError)
        if (createError.message?.includes('already been registered')) {
            return { success: false, message: 'Já existe um usuário cadastrado com este e-mail.' }
        }
        return { success: false, message: `Erro ao criar usuário: ${createError.message}` }
    }

    if (!newUser.user) {
        return { success: false, message: 'Erro inesperado: Usuário não retornado.' }
    }

    // Upsert user profile to ensure row exists even if trigger is missing
    const upsertPayload: any = {
        id: newUser.user.id,
        email,
        role: role,
        allowed_brands: brands,
        status: 'active',
        name: name,
        phone: phone,
        company_name: normalizedCompanyName,
        supervised_company_name: normalizedSupervisedCompanyName,
    }

    if (department) {
        upsertPayload.department = department
    }

    if (supervisor_id) {
        upsertPayload.supervisor_id = supervisor_id
    }

    let { error: upsertError } = await supabaseAdmin
        .from('users')
        .upsert(upsertPayload, { onConflict: 'id' })

    if (upsertError && String(upsertError.message || '').toLowerCase().includes('department')) {
        const { department: _omit, ...retryPayload } = upsertPayload
        const retry = await supabaseAdmin
            .from('users')
            .upsert(retryPayload, { onConflict: 'id' })
        upsertError = retry.error
    }

    if (upsertError) {
        console.error('Erro ao criar/atualizar perfil:', upsertError)
        return { success: false, message: `Usuário criado no Auth, mas falha ao salvar perfil: ${upsertError.message}` }
    }

    revalidatePath('/admin/usuarios')
    return { success: true, message: 'Usuário cadastrado com sucesso!' }
}

export async function getUsers(options?: { includeInactive?: boolean }) {
    const permission = await checkAdminPermission()
    if (!permission.authorized) return []

    let supabaseAdmin
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error('Erro ao inicializar cliente admin:', error)
        return []
    }

    // Fetch users with their supervisor name if available (self-join not explicitly easy without FK alias setup in client, but we added FK)
    // We will just fetch all columns for now, supervisor_id will be there.
    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao buscar usuários:', error)
        return []
    }

    if (options?.includeInactive) {
        return users
    }

    return users.filter(user => user.status !== 'inactive')
}

type SubordinateRole = 'vendedor_interno' | 'vendedor_externo'

export async function getSubordinates(
    supervisorId: string,
    options?: { roles?: SubordinateRole[]; includeInactive?: boolean }
) {
    const supabaseAdmin = createSupabaseServiceClient()
    const roles = options?.roles?.length ? options.roles : ['vendedor_interno']

    let query = supabaseAdmin
        .from('users')
        .select('id, name, email, role, status')
        .eq('supervisor_id', supervisorId)
        .in('role', roles)

    if (!options?.includeInactive) {
        query = query.in('status', ['active', 'ATIVO'])
    }

    const { data: subordinates, error } = await query.order('name', { ascending: true })

    if (error) {
        console.error('Erro ao buscar subordinados:', error)
        return []
    }

    return subordinates
}

export async function getSupervisors() {
    // Only admins/support/supervisors might need this list.
    // For now, allow fetch if authenticated (or add checkAdminPermission if strict).
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: supervisors, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('role', 'supervisor')
        .in('status', ['active', 'ATIVO'])
        .order('name', { ascending: true })

    if (error) {
        console.error('Erro ao buscar supervisores:', error)
        return []
    }

    return supervisors
}

export async function syncUsersFromAuth() {
    const permission = await checkAdminPermission('manage-users')
    if (!permission.authorized) {
        return { success: false, message: permission.message || 'Erro de permissão' }
    }

    let supabaseAdmin
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error('Erro ao inicializar cliente admin:', error)
        return { success: false, message: 'Configuração do servidor inválida para sincronizar usuários.' }
    }

    const perPage = 1000
    let page = 1
    let processed = 0

    while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
        if (error) {
            console.error('Erro ao listar usuários do Auth:', error)
            return { success: false, message: `Erro ao listar usuários do Auth: ${error.message}` }
        }

        const users = data?.users ?? []
        if (users.length === 0) break

        const rows = users.map((authUser) => {
            const metadata: any = authUser.user_metadata ?? {}
            const role = isValidRole(metadata.role) ? metadata.role : 'vendedor_externo'
            const allowedBrands = normalizeBrands(metadata.brands ?? metadata.allowed_brands)
            const name = metadata.nome || metadata.name || authUser.email || 'Usuário'
            const phone = metadata.telefone || metadata.phone
            const department = metadata.department || 'outro'
            const companyName = typeof metadata.company_name === 'string' ? metadata.company_name : null
            const supervisedCompanyName = typeof metadata.supervised_company_name === 'string'
                ? metadata.supervised_company_name
                : null

            return {
                id: authUser.id,
                email: authUser.email ?? '',
                role,
                allowed_brands: allowedBrands,
                name,
                phone,
                department,
                status: metadata.status || 'active',
                company_name: companyName,
                supervised_company_name: supervisedCompanyName,
            }
        })

        for (const chunk of chunkArray(rows, 500)) {
            let { error: upsertError } = await supabaseAdmin
                .from('users')
                .upsert(chunk, { onConflict: 'id' })

            if (upsertError && String(upsertError.message || '').toLowerCase().includes('department')) {
                const retryChunk = chunk.map(({ department: _omit, ...rest }) => rest)
                const retry = await supabaseAdmin
                    .from('users')
                    .upsert(retryChunk, { onConflict: 'id' })
                upsertError = retry.error
            }

            if (upsertError) {
                console.error('Erro ao sincronizar usuários:', upsertError)
                return { success: false, message: `Erro ao sincronizar usuários: ${upsertError.message}` }
            }

            processed += chunk.length
        }

        if (data?.lastPage && page >= data.lastPage) break
        if (users.length < perPage) break
        page += 1
    }

    revalidatePath('/admin/usuarios')
    return { success: true, message: `Sincronização concluída. ${processed} usuários processados.` }
}

export async function deleteUser(userId: string) {
    const permission = await checkAdminPermission('manage-users')
    if (!permission.authorized) {
        return { success: false, message: permission.message }
    }

    let supabaseAdmin
    try {
        supabaseAdmin = createSupabaseServiceClient()
    } catch (error) {
        console.error('Erro ao inicializar cliente admin:', error)
        return { success: false, message: 'Configuração do servidor inválida para excluir usuários.' }
    }

    const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()

    // Soft delete to avoid FK blocks and still revoke access
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, true)
    const authMissing =
        error &&
        ((error as any).status === 404 ||
            (error as any).code === 'user_not_found' ||
            String(error.message || '').toLowerCase().includes('user not found'))

    if (error && !authMissing) {
        console.error('Erro ao excluir usuário:', error)
        return { success: false, message: `Erro ao excluir usuário: ${error.message}` }
    }

    const updatePayload: { status: string; email?: string } = { status: 'inactive' }
    if (existingUser?.email) {
        updatePayload.email = `deleted+${userId}@rental.local`
    }

    const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)

    if (updateError) {
        console.error('Aviso: Falha ao atualizar status do usuário:', updateError)
    }

    revalidatePath('/admin/usuarios')
    return authMissing
        ? { success: true, message: 'Usuário removido apenas do cadastro local (não existe no Auth).' }
        : { success: true, message: 'Usuário excluído com sucesso.' }
}

// Schema para atualização (parcial)
const updateUserSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email('Email inválido'),
    role: z.enum(userRoleValues),
    department: z.enum(['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro']).optional(),
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
    name: z.string().min(1, 'Nome é obrigatório'),
    phone: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    password: z.string().optional(),
    supervisor_id: z.string().optional(),
    company_name: z.string().optional(),
    supervised_company_name: z.string().optional(),
})

export async function updateUser(prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
    const permission = await checkAdminPermission('manage-users')
    if (!permission.authorized) {
        return { success: false, message: permission.message || 'Erro de permissão' }
    }

    const rawData = {
        userId: formData.get('userId'),
        email: formData.get('email'),
        role: formData.get('role'),
        department: optionalString(formData.get('department')),
        brands: formData.getAll('brands'),
        name: formData.get('name'),
        phone: formData.get('phone'),
        status: optionalString(formData.get('status')),
        password: formData.get('password') || undefined,
        supervisor_id: optionalString(formData.get('supervisor_id')),
        company_name: optionalString(formData.get('company_name')),
        supervised_company_name: optionalString(formData.get('supervised_company_name')),
    }

    const validated = updateUserSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos.',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    const {
        userId,
        email,
        role,
        brands,
        department,
        name,
        phone,
        status,
        password,
        supervisor_id,
        company_name,
        supervised_company_name,
    } = validated.data
    const supabaseAdmin = createSupabaseServiceClient()
    const normalizedCompanyName = role === 'vendedor_interno' ? company_name ?? null : null
    const normalizedSupervisedCompanyName = role === 'supervisor' ? supervised_company_name ?? null : null

    // 1. Update public.users table (Profile)
    const updatePayload: any = {
        role,
        department: department || 'outro',
        allowed_brands: brands,
        name,
        phone,
        email,
        status: status || 'active',
        supervisor_id: supervisor_id || null, // Set to null if empty string
        company_name: normalizedCompanyName,
        supervised_company_name: normalizedSupervisedCompanyName,
    }

    const { error: profileError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)

    if (profileError) {
        console.error('Erro ao atualizar perfil (public.users):', profileError)
        return { success: false, message: `Erro ao atualizar usuário: ${profileError.message}` }
    }

    // 2. Update auth.users metadata (to keep sync) and password if provided
    const authUpdateData: any = {
        email,
        user_metadata: {
            nome: name,
            role,
            telefone: phone,
            brands,
            department: department || 'outro',
            company_name: normalizedCompanyName,
            supervised_company_name: normalizedSupervisedCompanyName,
        }
    }

    if (password && password.length >= 6) {
        authUpdateData.password = password
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdateData)

    if (authError) {
        console.error('Aviso: Falha ao atualizar auth.users:', authError)
        if (password) {
            return { success: true, message: 'Perfil atualizado, mas falha ao alterar senha. Verifique se a senha atende aos requisitos.' }
        }
    }

    revalidatePath('/admin/usuarios')
    return { success: true, message: password ? 'Usuário e senha atualizados com sucesso!' : 'Usuário atualizado com sucesso!' }
}
