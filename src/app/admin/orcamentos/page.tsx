import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { ProposalRowActions } from "@/components/admin/proposals/proposal-row-actions"

function parseMissingColumnError(message?: string | null) {
    if (!message) return null

    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null

    return { column: match[1], table: match[2] }
}

function getEstimatedKwh(calculation: unknown): number | null {
    if (!calculation || typeof calculation !== "object" || Array.isArray(calculation)) return null
    const output = (calculation as Record<string, any>).output
    const dimensioning = output && typeof output === "object" ? output.dimensioning : null
    const value = dimensioning && typeof dimensioning === "object" ? dimensioning.kWh_estimado : null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeSourceMode(value: unknown): "simple" | "complete" | "legacy" {
    if (value === "simple" || value === "complete" || value === "legacy") return value
    return "legacy"
}

function getSourceModeLabel(mode: "simple" | "complete" | "legacy") {
    if (mode === "simple") return "Simples"
    if (mode === "complete") return "Completo"
    return "Legado"
}

interface ProposalsPageProps {
    searchParams: Promise<{
        proposalId?: string
    }>
}

export default async function ProposalsPage({ searchParams }: ProposalsPageProps) {
    const { proposalId } = await searchParams
    const targetProposalId = proposalId?.trim() || null

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
    const deleteAllowedRoles = [...allowedRoles, "suporte"]

    if (!role || !allowedRoles.includes(role)) {
        redirect("/dashboard")
    }

    const canDeleteProposals = deleteAllowedRoles.includes(role)

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
        const buildProposalsQuery = (orderColumn: "updated_at" | "created_at") => {
            let proposalsQuery = supabaseAdmin
                .from('proposals')
                .select(`
                    *,
                    seller:users(name, email),
                    cliente:indicacoes!proposals_client_id_fkey(id, nome)
                `)
                .order(orderColumn, { ascending: false })
                .order('created_at', { ascending: false })

            if (role === "supervisor") {
                proposalsQuery = proposalsQuery.in("client_id", scopedClientIds ?? [])
            }

            if (targetProposalId) {
                proposalsQuery = proposalsQuery.eq("id", targetProposalId)
            }

            return proposalsQuery
        }

        let proposalsResult = await buildProposalsQuery("updated_at")
        const missingOrderColumn = parseMissingColumnError(proposalsResult.error?.message)
        if (
            proposalsResult.error &&
            missingOrderColumn &&
            missingOrderColumn.table === "proposals" &&
            missingOrderColumn.column === "updated_at"
        ) {
            proposalsResult = await buildProposalsQuery("created_at")
        }

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
            estimated_kwh: getEstimatedKwh(proposal.calculation),
            source_mode: normalizeSourceMode(proposal.source_mode),
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
                    {targetProposalId ? (
                        <Link href="/admin/orcamentos">
                            <Button variant="outline">Ver todos</Button>
                        </Link>
                    ) : null}
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="hidden lg:table-cell">Última alteração</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead className="hidden xl:table-cell">Vendedor</TableHead>
                            <TableHead>Produção Estimada</TableHead>
                            <TableHead className="hidden 2xl:table-cell">Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Modo</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {proposalsError ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center h-24 text-destructive">
                                    Erro ao carregar orçamentos: {proposalsError.message}
                                </TableCell>
                            </TableRow>
                        ) : normalizedProposals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                                    Nenhum orçamento encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            normalizedProposals.map((proposal: any) => (
                                <TableRow key={proposal.id}>
                                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                                        {format(new Date(proposal.updated_at ?? proposal.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                                    </TableCell>
                                    <TableCell className="max-w-[180px] truncate font-medium">{proposal.cliente?.nome || '-'}</TableCell>
                                    <TableCell className="hidden xl:table-cell max-w-[160px] truncate">
                                        {proposal.seller?.name || proposal.seller?.email || 'Sistema'}
                                    </TableCell>
                                    <TableCell>
                                        {typeof proposal.estimated_kwh === "number"
                                            ? `${proposal.estimated_kwh.toLocaleString("pt-BR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })} kWh`
                                            : "-"}
                                    </TableCell>
                                    <TableCell className="hidden 2xl:table-cell">
                                        {proposal.valid_until ? format(new Date(proposal.valid_until), 'dd/MM/yyyy') : '-'}
                                    </TableCell>
                                    <TableCell className="capitalize">{proposal.status}</TableCell>
                                    <TableCell>
                                        <Badge variant={proposal.source_mode === "complete" ? "default" : "secondary"}>
                                            {getSourceModeLabel(proposal.source_mode)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {proposal.total_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <ProposalRowActions
                                            proposalId={proposal.id}
                                            sourceMode={proposal.source_mode}
                                            clientName={proposal.cliente?.nome ?? null}
                                            canDelete={canDeleteProposals}
                                            previewData={{
                                                id: proposal.id,
                                                clientName: proposal.cliente?.nome ?? null,
                                                sellerName: proposal.seller?.name ?? proposal.seller?.email ?? null,
                                                status: proposal.status ?? null,
                                                totalValue: Number(proposal.total_value ?? 0),
                                                estimatedKwh:
                                                    typeof proposal.estimated_kwh === "number" ? proposal.estimated_kwh : null,
                                                validUntil: proposal.valid_until ?? null,
                                                calculation: proposal.calculation ?? null,
                                            }}
                                        />
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
