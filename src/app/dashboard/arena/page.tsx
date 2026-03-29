import { redirect } from "next/navigation"
import { TrendingUp } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getPersonalArenaStats } from "@/services/task-benchmark-service"
import { TaskArenaDashboard } from "@/components/arena/task-arena-dashboard"

export const dynamic = "force-dynamic"

export default async function ArenaPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const entries = await getPersonalArenaStats(user.id)

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
                <div>
                    <h1 className="text-xl font-semibold">Meu Desempenho</h1>
                    <p className="text-sm text-muted-foreground">
                        Seus recordes pessoais por categoria de tarefa
                    </p>
                </div>
            </div>
            <TaskArenaDashboard entries={entries} />
        </div>
    )
}
