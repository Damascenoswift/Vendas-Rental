import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getFinancialSummary } from "@/app/actions/financial"
import { FinancialList } from "@/components/financial/financial-list"
import { getUsers } from "@/app/actions/auth-admin"
import { NewTransactionDialog } from "@/components/financial/new-transaction-dialog"
import { Wallet } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function FinancialPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    // Check admin
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['adm_mestre', 'adm_dorata'].includes(profile.role)) {
        redirect("/dashboard")
    }

    const [transactions, users] = await Promise.all([
        getFinancialSummary(),
        getUsers()
    ])

    // Calculate Balance (Simplistic)
    const totalBalance = transactions.reduce((acc, curr) => acc + (curr.amount || 0), 0)

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestão Financeira</h1>
                    <p className="text-muted-foreground">Controle de comissões, bônus e pagamentos.</p>
                </div>
                <NewTransactionDialog users={users as any[]} />
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Caixa / Líquido</h3>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className={`text-2xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalBalance)}
                    </div>
                    <p className="text-xs text-muted-foreground">Saldo acumulado das transações listadas</p>
                </div>
                {/* Add more stats as needed */}
            </div>

            {/* List */}
            <FinancialList transactions={transactions as any[]} />
        </div>
    )
}
