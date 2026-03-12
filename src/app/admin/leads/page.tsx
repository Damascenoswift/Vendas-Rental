import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/auth'
import { fetchAdminQuickLeads, type QuickLeadsClient } from '@/services/quick-leads-service'
import { redirect } from 'next/navigation'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export const dynamic = 'force-dynamic'

export default async function AdminLeadsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check permissions
    // We check both the DB profile and user_metadata to be robust
    const profile = await getProfile(supabase, user.id)
    const role = profile?.role ?? (user.user_metadata?.role as string | undefined)

    if (!['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role ?? '')) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Seu usuário não tem permissão para acessar esta página.</p>
                </div>
            </div>
        )
    }

    // Use Service Client to bypass RLS for fetching all leads
    const supabaseAdmin = createSupabaseServiceClient() as unknown as QuickLeadsClient

    // Fetch leads with resilient fallback when relationship is missing in schema cache.
    const { leads, error } = await fetchAdminQuickLeads(supabaseAdmin)

    if (error) {
        console.error('Erro ao buscar leads:', error)
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar leads</h3>
                    <p className="text-sm">{error}</p>
                    <p className="text-xs mt-2 text-muted-foreground">Verifique se a variável SUPABASE_SERVICE_ROLE_KEY está configurada na Vercel.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Leads Rápidos</h1>
                <p className="text-muted-foreground">
                    Indicações rápidas cadastradas pelos vendedores.
                </p>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>WhatsApp</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Observação</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {leads?.map((lead) => {
                            // Extract vendedor name safely
                            const vendedorNome = lead.users?.name || lead.users?.email || 'Desconhecido'

                            return (
                                <TableRow key={lead.id}>
                                    <TableCell>
                                        {new Intl.DateTimeFormat('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        }).format(new Date(lead.created_at))}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={lead.marca === 'rental' ? 'default' : 'secondary'}>
                                            {lead.marca.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{lead.nome}</TableCell>
                                    <TableCell>{lead.whatsapp}</TableCell>
                                    <TableCell>{vendedorNome}</TableCell>
                                    <TableCell className="max-w-xs truncate" title={lead.observacao ?? undefined}>
                                        {lead.observacao || '-'}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {leads?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Nenhum lead encontrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
