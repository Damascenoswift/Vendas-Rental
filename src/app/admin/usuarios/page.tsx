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
        // DEBUG MODE: Instead of redirecting, show why it failed
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado (Debug)</h2>
                    <p>Seu usuário não tem permissão para acessar esta página.</p>
                    <div className="mt-4 rounded bg-black/10 p-4 font-mono text-xs text-foreground">
                        <p><strong>User ID:</strong> {user.id}</p>
                        <p><strong>Profile Found:</strong> {profile ? 'Yes' : 'No'}</p>
                        <p><strong>Role in DB:</strong> {profile?.role ?? 'N/A'}</p>
                        <p><strong>Expected:</strong> adm_mestre OR adm_dorata</p>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                        Se você vê esta tela, o banco de dados não retornou o cargo correto para seu usuário.
                        Verifique a tabela 'users' no Supabase.
                    </p>
                </div>
            </div>
        )
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
