import { Award, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PersonalHistoryEntry } from "@/services/task-benchmark-service"

const DEPARTMENT_LABELS: Record<string, string> = {
    vendas: "Vendas",
    cadastro: "Cadastro",
    energia: "Energia",
    juridico: "Jurídico",
    financeiro: "Financeiro",
    ti: "TI",
    diretoria: "Diretoria",
    obras: "Obras",
    outro: "Outro",
}

function formatDepartment(d: string) {
    return DEPARTMENT_LABELS[d] ?? d
}

export function TaskArenaDashboard({ entries }: { entries: PersonalHistoryEntry[] }) {
    if (entries.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum benchmark configurado ainda. Peça ao administrador para cadastrar as metas de tempo.
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                    <Card key={entry.benchmark.id}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-muted-foreground">
                                {formatDepartment(entry.benchmark.department)}
                            </CardTitle>
                            <p className="text-base font-semibold">{entry.benchmark.label}</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Meta</span>
                                <Badge variant="outline">
                                    {entry.benchmark.expected_business_days} dias úteis
                                </Badge>
                            </div>
                            {entry.record ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                                    <div className="flex items-center gap-2">
                                        <Trophy className="h-4 w-4 text-amber-600" />
                                        <span className="text-sm font-medium text-amber-800">
                                            Seu recorde: {entry.record.best_business_days} dias úteis
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-amber-700">
                                        Alcançado em{" "}
                                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                                            new Date(entry.record.achieved_at)
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-md bg-muted p-3">
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            Ainda sem recorde. Conclua uma tarefa para aparecer aqui.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
