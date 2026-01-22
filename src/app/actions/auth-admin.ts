'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { UserRole, Brand } from '@/lib/auth'

// Schema de validação
const createUserSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    name: z.string().min(1, 'Nome é obrigatório'),
    phone: z.string().optional(),
    role: z.enum(['vendedor_externo', 'vendedor_interno', 'supervisor', 'adm_mestre', 'adm_dorata', 'investidor', 'funcionario_n1', 'funcionario_n2']),
    department: z.enum(['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro']).optional(),
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
    supervisor_id: z.string().optional().or(z.literal('')),
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

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: currentUserProfile } = await supabaseAdmin
        .from('users')
        .select('role, email')
        .eq('id', user.id)
        .single()

    const role = (currentUserProfile?.role ?? user.user_metadata?.role) as UserRole | undefined
    const ownerId = process.env.USER_MANAGEMENT_OWNER_ID
    const ownerEmail = process.env.USER_MANAGEMENT_OWNER_EMAIL?.toLowerCase()
    const userEmail = (user.email ?? currentUserProfile?.email ?? '').toLowerCase()
    const isOwner =
        (ownerId && user.id === ownerId) ||
        (ownerEmail && userEmail === ownerEmail) ||
        (!ownerId && !ownerEmail && role === 'adm_mestre')

    if (mode === 'manage-users') {
        if (!isOwner) {
            return { authorized: false, message: 'Acesso negado. Apenas o perfil proprietário pode alterar usuários.' }
        }
        return { authorized: true, role, isOwner }
    }

    const allowedReadRoles: UserRole[] = ['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2']
    if (!role || !allowedReadRoles.includes(role)) {
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
        department: formData.get('department'),
        brands: formData.getAll('brands'),
        supervisor_id: formData.get('supervisor_id'),
    }

    const validated = createUserSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos. Verifique o formulário.',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    const { email, password, name, phone, role, brands, department, supervisor_id } = validated.data

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            nome: name,
            telefone: phone,
            role: role,
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

    // Prepare update data, ignoring supervisor_id if explicitly empty string
    const updatePayload: any = {
        role: role,
        department: department || 'outro',
        allowed_brands: brands,
        status: 'active',
        name: name,
        phone: phone
    }

    if (supervisor_id) {
        updatePayload.supervisor_id = supervisor_id
    }

    const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', newUser.user.id)

    if (updateError) {
        console.error('Erro ao atualizar perfil:', updateError)
        return { success: true, message: 'Usuário criado, mas houve um aviso ao atualizar permissões ou supervisor.' }
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

export async function getSubordinates(supervisorId: string) {
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: subordinates, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('supervisor_id', supervisorId)
        .eq('status', 'active')
        .order('name', { ascending: true })

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
        .eq('status', 'active')
        .order('name', { ascending: true })

    if (error) {
        console.error('Erro ao buscar supervisores:', error)
        return []
    }

    return supervisors
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

    // Delete from auth.users (this should cascade to public.users if configured, but we'll see)
    // Actually, usually we delete from auth.users via admin API
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (error) {
        console.error('Erro ao excluir usuário:', error)
        return { success: false, message: 'Erro ao excluir usuário.' }
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
    return { success: true, message: 'Usuário excluído com sucesso.' }
}

// Schema para atualização (parcial)
const updateUserSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().email('Email inválido'),
    role: z.enum(['vendedor_externo', 'vendedor_interno', 'supervisor', 'adm_mestre', 'adm_dorata', 'investidor', 'funcionario_n1', 'funcionario_n2']),
    department: z.enum(['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'outro']).optional(),
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
    name: z.string().min(1, 'Nome é obrigatório'),
    phone: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    password: z.string().optional(),
    supervisor_id: z.string().optional().or(z.literal('')),
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
        department: formData.get('department'),
        brands: formData.getAll('brands'),
        name: formData.get('name'),
        phone: formData.get('phone'),
        status: formData.get('status'),
        password: formData.get('password') || undefined,
        supervisor_id: formData.get('supervisor_id'),
    }

    const validated = updateUserSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos.',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    const { userId, email, role, brands, department, name, phone, status, password, supervisor_id } = validated.data
    const supabaseAdmin = createSupabaseServiceClient()

    // 1. Update public.users table (Profile)
    const updatePayload: any = {
        role,
        department: department || 'outro',
        allowed_brands: brands,
        name,
        phone,
        email,
        status: status || 'active',
        supervisor_id: supervisor_id || null // Set to null if empty string
    }

    // @ts-ignore
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
            brands
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
