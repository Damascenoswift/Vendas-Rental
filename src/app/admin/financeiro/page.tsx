import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getFinancialSummary } from "@/app/actions/financial"
import { FinancialList } from "@/components/financial/financial-list"
import { getUsers } from "@/app/actions/auth-admin"
import { NewTransactionDialog } from "@/components/financial/new-transaction-dialog"
import { getPricingRules } from "@/services/proposal-service"
import { Wallet } from "lucide-react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

export default async function FinancialPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    // Check admin
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(profile.role)) {
        redirect("/dashboard")
    }

    const [transactions, users, pricingRules] = await Promise.all([
        getFinancialSummary(),
        getUsers(),
        getPricingRules()
    ])

    const commissionRule = pricingRules.find(rule => rule.key === 'dorata_commission_percent')
    const rawCommissionValue = commissionRule ? Number(commissionRule.value) : 3
    const defaultCommissionPercent = rawCommissionValue > 1 ? rawCommissionValue / 100 : rawCommissionValue

    const { data: dorataProposals } = await supabase
        .from('proposals')
        .select('id, created_at, total_value, calculation, seller:users(name, email)')
        .eq('status', 'sent')
        .order('created_at', { ascending: false })

    const { data: rentalIndicacoes } = await supabase
        .from('indicacoes')
        .select('id, created_at, nome, status, valor, users!indicacoes_user_id_fkey(name, email)')
        .not('valor', 'is', null)
        .order('created_at', { ascending: false })

    const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

    const dorataForecasts = (dorataProposals ?? []).map((proposal: any) => {
        const calculation = proposal.calculation as any
        const storedCommission = calculation?.commission
        const contractValue = Number(storedCommission?.base_value ?? proposal.total_value ?? 0)
        const commissionPercent = Number(storedCommission?.percent ?? defaultCommissionPercent)
        const commissionValue = Number(storedCommission?.value ?? contractValue * commissionPercent)

        return {
            id: proposal.id,
            created_at: proposal.created_at,
            seller: proposal.seller,
            contractValue,
            commissionPercent,
            commissionValue
        }
    })

    const rentalForecasts = (rentalIndicacoes ?? []).map((indicacao: any) => ({
        id: indicacao.id,
        created_at: indicacao.created_at,
        nome: indicacao.nome,
        status: indicacao.status,
        valor: Number(indicacao.valor ?? 0),
        vendedor: indicacao.users
    }))

    const totalDorataContract = dorataForecasts.reduce((sum, item) => sum + item.contractValue, 0)
    const totalDorataCommission = dorataForecasts.reduce((sum, item) => sum + item.commissionValue, 0)
    const totalRentalForecast = rentalForecasts.reduce((sum, item) => sum + item.valor, 0)

    const dorataPayments = transactions.filter((tx: any) => tx.type === 'comissao_dorata')
    const rentalPayments = transactions.filter((tx: any) => tx.type === 'comissao_venda')

    const dorataPaymentsTotal = dorataPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
    const rentalPaymentsTotal = rentalPayments.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)

    // Calculate Balance (Simplistic)
    const totalBalance = transactions.reduce((acc, curr) => acc + (curr.amount || 0), 0)

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestao de Comissoes</h1>
                    <p className="text-muted-foreground">Dashboard com previsoes e pagamentos de Dorata e Rental.</p>
                </div>
                <NewTransactionDialog users={users as any[]} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Caixa / Liquido</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className={`text-2xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(totalBalance)}
                    </div>
                    <p className="text-xs text-muted-foreground">Saldo acumulado das transacoes listadas</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Previsao Dorata (contratos)</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(totalDorataContract)}</div>
                    <p className="text-xs text-muted-foreground">Total fechado em propostas enviadas</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Comissao Dorata</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(totalDorataCommission)}</div>
                    <p className="text-xs text-muted-foreground">Base para pagamento de comissao</p>
                </div>
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Previsao Rental</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(totalRentalForecast)}</div>
                    <p className="text-xs text-muted-foreground">Indicacoes com valor informado</p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Previsoes Dorata</h2>
                        <p className="text-sm text-muted-foreground">Orcamentos enviados (status sent).</p>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Vendedor</TableHead>
                                <TableHead className="text-right">Contrato</TableHead>
                                <TableHead className="text-right">Comissao</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dorataForecasts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                        Nenhuma previsao registrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                dorataForecasts.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{new Date(item.created_at).toLocaleDateString('pt-BR')}</TableCell>
                                        <TableCell>{item.seller?.name || item.seller?.email || 'Sistema'}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.contractValue)}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.commissionValue)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Previsoes Rental</h2>
                        <p className="text-sm text-muted-foreground">Indicacoes com valor informado.</p>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rentalForecasts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                                        Nenhuma previsao registrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rentalForecasts.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{new Date(item.created_at).toLocaleDateString('pt-BR')}</TableCell>
                                        <TableCell>{item.nome}</TableCell>
                                        <TableCell className="capitalize">{item.status}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(item.valor)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Pagamentos Dorata</h2>
                            <p className="text-sm text-muted-foreground">Lancamentos com tipo comissao_dorata.</p>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(dorataPaymentsTotal)}</span>
                    </div>
                    <FinancialList transactions={dorataPayments as any[]} />
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Pagamentos Rental</h2>
                            <p className="text-sm text-muted-foreground">Lancamentos com tipo comissao_venda.</p>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(rentalPaymentsTotal)}</span>
                    </div>
                    <FinancialList transactions={rentalPayments as any[]} />
                </div>
            </div>
        </div>
    )
}
