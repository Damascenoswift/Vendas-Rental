import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { getAllBenchmarks } from "@/services/task-benchmark-service"
import { BenchmarkConfigTable } from "@/components/admin/benchmarks/benchmark-config-table"

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["adm_mestre", "supervisor"]

export default async function BenchmarksConfigPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const profile = await getProfile(supabase, user.id)
    if (!profile?.role || !ALLOWED_ROLES.includes(profile.role)) redirect("/dashboard")

    const benchmarks = await getAllBenchmarks()

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-xl font-semibold">Benchmarks de Tempo</h1>
                <p className="text-sm text-muted-foreground">
                    Configure os tempos esperados por categoria de tarefa para cada setor.
                </p>
            </div>
            <BenchmarkConfigTable initialBenchmarks={benchmarks} />
        </div>
    )
}
