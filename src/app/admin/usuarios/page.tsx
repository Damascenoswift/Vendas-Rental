import { RegisterUserForm } from '@/components/admin/register-user-form'
import { UsersList } from '@/components/admin/users-list'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUsers, getSupervisors } from '@/app/actions/auth-admin'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { hasFullAccess, type UserRole, type UserProfile } from '@/lib/auth'

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
        .select('role, department')
        .eq('id', user.id)
        .single()

    const role = (profile?.role ?? user.user_metadata?.role) as UserRole | undefined
    const department = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null

    const ownerId = process.env.USER_MANAGEMENT_OWNER_ID
    const ownerEmail = process.env.USER_MANAGEMENT_OWNER_EMAIL?.toLowerCase()
    const userEmail = (user.email ?? '').toLowerCase()
    const isOwner =
        (ownerId && user.id === ownerId) ||
        (ownerEmail && userEmail === ownerEmail) ||
        (!ownerId && !ownerEmail && hasFullAccess(role ?? null, department))

    if (!profile || !isOwner) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Somente o perfil proprietário pode gerenciar usuários.</p>
                </div>
            </div>
        )
    }

    const users = await getUsers()
    const supervisors = await getSupervisors()

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Gerenciamento de Usuários <span className="text-sm font-normal text-muted-foreground">(v1.2)</span></h1>
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
                    <UsersList users={users} supervisors={supervisors} />
                </TabsContent>
                <TabsContent value="register">
                    <div className="max-w-md mx-auto">
                        <RegisterUserForm supervisors={supervisors} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
