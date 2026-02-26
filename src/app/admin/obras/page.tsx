import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { getWorkCards, type WorkCardStatus } from "@/services/work-cards-service"
import { WorkFilters } from "@/components/admin/works/work-filters"
import { WorkBoard } from "@/components/admin/works/work-board"
import { hasWorksOnlyScope } from "@/lib/department-access"

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = [
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
]

function normalizeStatus(value?: string | null): WorkCardStatus {
    if (value === "PARA_INICIAR" || value === "EM_ANDAMENTO") return value
    return "FECHADA"
}

export default async function AdminWorksPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; q?: string }>
}) {
    const params = searchParams ? await searchParams : undefined

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const canAccessByDepartment = hasWorksOnlyScope(profile?.department)
    if (!profile?.role || (!ALLOWED_ROLES.includes(profile.role) && !canAccessByDepartment)) {
        redirect("/dashboard")
    }

    const status = normalizeStatus(params?.status)
    const search = params?.q?.trim() || undefined

    const cards = await getWorkCards({
        brand: "dorata",
        status,
        search,
    })

    return (
        <div className="flex-1 space-y-4 p-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Obras Dorata</h1>
                <p className="text-sm text-muted-foreground">
                    Projeto e execução no mesmo card, com dados técnicos sem valores financeiros.
                </p>
            </div>

            <WorkFilters />

            <WorkBoard initialCards={cards} />
        </div>
    )
}
