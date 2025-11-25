import { createClient } from '@/lib/supabase/server'
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

    // Check permissions (only adm_mestre)
    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'adm_mestre') {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Apenas Administradores Mestre podem acessar esta página.</p>
                    <div className="mt-4 rounded bg-black/10 p-4 font-mono text-xs text-foreground">
                        <p><strong>User ID:</strong> {user.id}</p>
                        <p><strong>Email:</strong> {user.email}</p>
                        <p><strong>Profile Found:</strong> {profile ? 'Yes' : 'No'}</p>
                        <p><strong>Role in DB:</strong> {profile?.role ?? 'N/A'}</p>
                        <p><strong>Role in Metadata:</strong> {user.user_metadata?.role ?? 'N/A'}</p>
                    </div>
                </div>
            </div>
        )
    }

    // Fetch leads with user info
    const { data: leads, error } = await supabase
        .from('quick_leads')
        .select('*, users(email, user_metadata)')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao buscar leads:', error)
        return <div>Erro ao carregar leads.</div>
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
                            const vendedorMeta = (lead.users as any)?.user_metadata
                            const vendedorNome = vendedorMeta?.nome || (lead.users as any)?.email || 'Desconhecido'

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
                                    <TableCell className="max-w-xs truncate" title={lead.observacao}>
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
