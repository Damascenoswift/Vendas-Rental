import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { getSupervisorVisibleUserIds } from "@/lib/supervisor-scope"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export default async function ProposalsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    const allowedRoles = [
        "adm_mestre",
        "adm_dorata",
        "supervisor",
        "suporte_tecnico",
        "suporte_limitado",
        "funcionario_n1",
        "funcionario_n2",
    ]

    if (!role || !allowedRoles.includes(role)) {
        redirect("/dashboard")
    }

    // Use service client here to avoid RLS false-negatives for internal operational roles.
    const supabaseAdmin = createSupabaseServiceClient()
    let scopedClientIds: string[] | null = null
    if (role === "supervisor") {
        const visibleUserIds = await getSupervisorVisibleUserIds(user.id)
        const { data: scopedIndicacoes, error: scopedIndicacoesError } = await supabaseAdmin
            .from("indicacoes")
            .select("id")
            .in("user_id", visibleUserIds)

        if (scopedIndicacoesError) {
            return (
                <div className="flex-1 space-y-4 p-8 pt-6">
                    <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                        <h3 className="font-bold">Erro ao aplicar escopo do supervisor</h3>
                        <p className="text-sm">{scopedIndicacoesError.message}</p>
                    </div>
                </div>
            )
        }

        scopedClientIds = (scopedIndicacoes ?? []).map((item: { id: string }) => item.id)
    }

    let proposals: any[] = []
    let proposalsError: { message: string } | null = null

    if (role === "supervisor" && (!scopedClientIds || scopedClientIds.length === 0)) {
        proposals = []
    } else {
        let proposalsQuery = supabaseAdmin
            .from('proposals')
            .select(`
                *,
                seller:users(name, email),
                cliente:indicacoes(id, nome)
            `)
            .order('created_at', { ascending: false })

        if (role === "supervisor") {
            proposalsQuery = proposalsQuery.in("client_id", scopedClientIds ?? [])
        }

        const proposalsResult = await proposalsQuery
        proposals = proposalsResult.data ?? []
        proposalsError = proposalsResult.error as { message: string } | null
    }

    const normalizedProposals = proposals.map((proposal: any) => {
        const seller = Array.isArray(proposal.seller) ? (proposal.seller[0] ?? null) : proposal.seller
        const cliente = Array.isArray(proposal.cliente) ? (proposal.cliente[0] ?? null) : proposal.cliente

        return {
            ...proposal,
            seller,
            cliente,
        }
    })

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Orçamentos</h2>
                <div className="flex items-center space-x-2">
                    <Link href="/admin/orcamentos/novo">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo Orçamento
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {proposalsError ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24 text-destructive">
                                    Erro ao carregar orçamentos: {proposalsError.message}
                                </TableCell>
                            </TableRow>
                        ) : normalizedProposals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                    Nenhum orçamento encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            normalizedProposals.map((proposal: any) => (
                                <TableRow key={proposal.id}>
                                    <TableCell>{format(new Date(proposal.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                                    <TableCell>{proposal.cliente?.nome || '-'}</TableCell>
                                    <TableCell>{proposal.seller?.name || proposal.seller?.email || 'Sistema'}</TableCell>
                                    <TableCell>{proposal.valid_until ? format(new Date(proposal.valid_until), 'dd/MM/yyyy') : '-'}</TableCell>
                                    <TableCell className="capitalize">{proposal.status}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {proposal.total_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
