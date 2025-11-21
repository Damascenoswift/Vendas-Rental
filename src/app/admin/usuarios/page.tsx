import { RegisterUserForm } from '@/components/admin/register-user-form'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

import { createSupabaseServiceClient } from '@/lib/supabase-server'

export default async function AdminUsersPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Use Service Client to bypass RLS when checking permissions
    const supabaseAdmin = createSupabaseServiceClient()
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['adm_mestre', 'adm_dorata'].includes(profile.role)) {
        redirect('/')
    }

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
                <p className="text-muted-foreground">
                    Cadastre novos vendedores e supervisores.
                </p>
            </div>

            <RegisterUserForm />
        </div>
    )
}
