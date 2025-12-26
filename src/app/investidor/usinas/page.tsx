import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function MinhasUsinasPage() {
    const supabase = await createClient()

    // RLS ensures only my usinas are returned
    const { data: usinas } = await supabase
        .from("usinas")
        .select(`
            id, 
            nome, 
            capacidade_total, 
            status, 
            modelo_negocio,
            created_at
        `)
        .order("created_at", { ascending: false })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Minhas Usinas</h1>
                <p className="text-muted-foreground">Acompanhe o status e capacidade dos seus ativos.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {usinas?.map((usina) => (
                    <Card key={usina.id} className="overflow-hidden">
                        <div className="h-2 bg-blue-600" />
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">{usina.nome}</CardTitle>
                                <Badge variant={usina.status === 'ATIVA' ? 'default' : 'secondary'}>
                                    {usina.status}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <span className="text-sm font-medium text-muted-foreground">Capacidade</span>
                                <div className="text-2xl font-bold flex items-baseline gap-1">
                                    {usina.capacidade_total} <span className="text-sm font-normal text-muted-foreground">kWh/mês</span>
                                </div>
                            </div>

                            <div className="space-y-1 border-t pt-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Modelo</span>
                                    <span className="font-medium">{usina.modelo_negocio || 'Padrao'}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {(!usinas || usinas.length === 0) && (
                    <p className="text-muted-foreground col-span-full text-center py-10">
                        Nenhuma usina vinculada à sua conta.
                    </p>
                )}
            </div>
        </div>
    )
}
