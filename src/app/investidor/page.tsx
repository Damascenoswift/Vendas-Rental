import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Factory, Users, Zap, DollarSign } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function InvestorDashboardPage() {
    const supabase = await createClient()

    // 1. Get My Usinas
    const { data: usinas } = await supabase.from("usinas").select("id, capacidade_total, status")
    const myUsinasIds = usinas?.map(u => u.id) || []

    // 2. Get Allocations (Active Clients)
    const { count: activeClientsCount } = await supabase
        .from("alocacoes_clientes")
        .select("*", { count: 'exact', head: true })
        .eq("status", "ATIVO")
    // RLS already filters alocacoes by my usinas, but explicit filter is safer if using service role (we are not, but good practice)

    // 3. Get Total Production (All time)
    const { data: production } = await supabase
        .from("historico_producao")
        .select("kwh_gerado")

    const totalProduction = production?.reduce((acc, curr) => acc + Number(curr.kwh_gerado), 0) || 0

    // 4. Get Financial Stats (Total Paid)
    const { data: invoices } = await supabase
        .from("faturas_conciliacao")
        .select("valor_fatura")
        .eq("status_pagamento", "PAGO")

    const totalRevenue = invoices?.reduce((acc, curr) => acc + Number(curr.valor_fatura), 0) || 0

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Visão Geral</h1>
                <p className="text-muted-foreground">Bem-vindo ao seu portal de investimentos.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Usinas Ativas</CardTitle>
                        <Factory className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{usinas?.length || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {usinas?.filter(u => u.status === 'ATIVA').length} em operação
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Clientes Atendidos</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeClientsCount || 0}</div>
                        <p className="text-xs text-muted-foreground">Unidades consumidoras</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Energia Gerada</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalProduction.toLocaleString('pt-BR')} kWh</div>
                        <p className="text-xs text-muted-foreground">Histórico total acumulado</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Retorno Financeiro</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                        </div>
                        <p className="text-xs text-muted-foreground">Total recebido (Faturas Pagas)</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
