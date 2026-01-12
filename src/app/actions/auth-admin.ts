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
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
})

export type CreateUserState = {
    success: boolean
    message: string
    errors?: Record<string, string[]>
}

async function checkAdminPermission() {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { authorized: false, message: 'Você precisa estar logado.' }
    }

    const { data: currentUserProfile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!currentUserProfile || !['adm_mestre', 'adm_dorata'].includes(currentUserProfile.role)) {
        return { authorized: false, message: 'Acesso negado. Apenas administradores podem realizar esta ação.' }
    }

    return { authorized: true }
}

export async function createUser(prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
    const permission = await checkAdminPermission()
    if (!permission.authorized) {
        return { success: false, message: permission.message || 'Erro de permissão' }
    }

    const rawData = {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        phone: formData.get('phone'),
        role: formData.get('role'),
        brands: formData.getAll('brands'),
    }

    const validated = createUserSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: 'Dados inválidos. Verifique o formulário.',
            errors: validated.error.flatten().fieldErrors,
        }
    }

    const { email, password, name, phone, role, brands } = validated.data

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
        return { success: false, message: `Erro ao criar usuário: ${createError.message}` }
    }

    if (!newUser.user) {
        return { success: false, message: 'Erro inesperado: Usuário não retornado.' }
    }

    const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
            role: role as UserRole,
            allowed_brands: brands as Brand[],
            name: name,
            phone: phone,
        })
        .eq('id', newUser.user.id)

    if (updateError) {
        console.error('Erro ao atualizar perfil:', updateError)
        return { success: true, message: 'Usuário criado, mas houve um aviso ao atualizar permissões.' }
    }

    revalidatePath('/admin/usuarios')
    return { success: true, message: 'Usuário cadastrado com sucesso!' }
}

export async function getUsers() {
    const permission = await checkAdminPermission()
    if (!permission.authorized) return []

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao buscar usuários:', error)
        return []
    }

    return users
}

export async function deleteUser(userId: string) {
    const permission = await checkAdminPermission()
    if (!permission.authorized) {
        return { success: false, message: permission.message }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    // Delete from auth.users (this should cascade to public.users if configured, but we'll see)
    // Actually, usually we delete from auth.users via admin API
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (error) {
        console.error('Erro ao excluir usuário:', error)
        return { success: false, message: 'Erro ao excluir usuário.' }
    }

    revalidatePath('/admin/usuarios')
    return { success: true, message: 'Usuário excluído com sucesso.' }
}
