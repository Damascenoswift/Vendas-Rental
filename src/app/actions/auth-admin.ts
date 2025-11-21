'use server'

import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getUserFromAuthorizationHeader } from '@/lib/supabase-server' // We might need a different way to get current user in Server Action
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { UserRole, Brand } from '@/lib/auth'

// Schema de validação
const createUserSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    name: z.string().min(1, 'Nome é obrigatório'),
    role: z.enum(['vendedor_externo', 'vendedor_interno', 'supervisor', 'adm_mestre', 'adm_dorata']),
    brands: z.array(z.enum(['rental', 'dorata'])).min(1, 'Selecione pelo menos uma marca'),
})

export type CreateUserState = {
    success: boolean
    message: string
    errors?: Record<string, string[]>
}

export async function createUser(prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
    // 1. Verificar se quem está chamando é Admin
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { success: false, message: 'Você precisa estar logado.' }
    }

    // Buscar role do usuário atual
    const { data: currentUserProfile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!currentUserProfile || !['adm_mestre', 'adm_dorata'].includes(currentUserProfile.role)) {
        return { success: false, message: 'Acesso negado. Apenas administradores podem criar usuários.' }
    }

    // 2. Validar dados do formulário
    const rawData = {
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
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

    const { email, password, name, role, brands } = validated.data

    // 3. Criar usuário usando Service Role (para não deslogar o admin)
    // Importante: createSupabaseServiceClient usa a chave secreta
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Confirma automaticamente
        user_metadata: {
            nome: name,
            role: role,
            // company_name: 'Rental', // Opcional, dependendo da lógica
        }
    })

    if (createError) {
        console.error('Erro ao criar usuário:', createError)
        return { success: false, message: `Erro ao criar usuário: ${createError.message}` }
    }

    if (!newUser.user) {
        return { success: false, message: 'Erro inesperado: Usuário não retornado.' }
    }

    // 4. Atualizar tabela public.users (Trigger deve ter criado, mas atualizamos brands/role para garantir)
    // O trigger sync_users cria o user, mas as vezes queremos garantir os campos extras
    const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
            role: role as UserRole,
            allowed_brands: brands as Brand[],
            // nome: name // Se tiver coluna nome na tabela users
        })
        .eq('id', newUser.user.id)

    if (updateError) {
        console.error('Erro ao atualizar perfil:', updateError)
        // Não falhamos totalmente aqui, pois o usuário foi criado
        return { success: true, message: 'Usuário criado, mas houve um aviso ao atualizar permissões. Verifique no banco.' }
    }

    return { success: true, message: 'Usuário cadastrado com sucesso!' }
}
