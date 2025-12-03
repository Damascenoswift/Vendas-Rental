import { RegisterUserForm } from '@/components/admin/register-user-form'
import { UsersList } from '@/components/admin/users-list'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUsers } from '@/app/actions/auth-admin'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Seu usuário não tem permissão para acessar esta página.</p>
                </div>
            </div>
        )
    }

    const users = await getUsers()

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Gerenciamento de Usuários <span className="text-sm font-normal text-muted-foreground">(v1.1)</span></h1>
                <p className="text-muted-foreground">
                    Cadastre novos vendedores e supervisores ou gerencie os existentes.
                </p>
            </div>

            <Tabs defaultValue="list" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="list">Lista de Usuários</TabsTrigger>
                    <TabsTrigger value="register">Cadastrar Novo</TabsTrigger>
                </TabsList>
                <TabsContent value="list" className="space-y-4">
                    <UsersList users={users} />
                </TabsContent>
                <TabsContent value="register">
                    <div className="max-w-md mx-auto">
                        <RegisterUserForm />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
