'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const quickLeadSchema = z.object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    whatsapp: z.string().min(10, 'WhatsApp inválido'),
    observacao: z.string().optional(),
    marca: z.enum(['rental', 'dorata']),
})

export type QuickLeadState = {
    success?: boolean
    error?: string
    errors?: {
        nome?: string[]
        whatsapp?: string[]
        observacao?: string[]
        marca?: string[]
    }
}

export async function createQuickLead(prevState: QuickLeadState, formData: FormData): Promise<QuickLeadState> {
    const validatedFields = quickLeadSchema.safeParse({
        nome: formData.get('nome'),
        whatsapp: formData.get('whatsapp'),
        observacao: formData.get('observacao'),
        marca: formData.get('marca'),
    })

    if (!validatedFields.success) {
        return {
            error: 'Campos inválidos',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Usuário não autenticado' }
    }

    const { error } = await supabase.from('quick_leads').insert({
        user_id: user.id,
        nome: validatedFields.data.nome,
        whatsapp: validatedFields.data.whatsapp,
        observacao: validatedFields.data.observacao,
        marca: validatedFields.data.marca,
    })

    if (error) {
        console.error('Erro ao criar lead rápido:', error)
        return { error: 'Erro ao salvar indicação. Tente novamente.' }
    }

    revalidatePath('/dashboard')
    return { success: true }
}
