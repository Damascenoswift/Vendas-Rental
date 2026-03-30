import { redirect } from "next/navigation"

import { WorkProcessCompletionAutomationPanel } from "@/components/admin/automations/work-process-completion-automation-panel"
import { getProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import {
    getWorkProcessCompletionAutomationLogsForAdmin,
    getWorkProcessCompletionAutomationSettingsForAdmin,
} from "@/services/work-process-completion-automation-service"

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["adm_mestre", "adm_dorata"] as const

export default async function AutomationPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    if (!profile?.role || !ALLOWED_ROLES.includes(profile.role as (typeof ALLOWED_ROLES)[number])) {
        redirect("/dashboard")
    }

    const [settingsResult, logsResult] = await Promise.all([
        getWorkProcessCompletionAutomationSettingsForAdmin(),
        getWorkProcessCompletionAutomationLogsForAdmin(60),
    ])

    if (settingsResult.error || !settingsResult.settings) {
        return (
            <div className="space-y-4 p-6">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Automações</h1>
                    <p className="text-sm text-muted-foreground">Falha ao carregar configuração da automação.</p>
                </div>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {settingsResult.error ?? "Erro inesperado ao carregar automações."}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4 p-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Automações</h1>
                <p className="text-sm text-muted-foreground">
                    Gestão de canais para automações de eventos operacionais.
                </p>
            </div>

            <WorkProcessCompletionAutomationPanel
                initialSettings={settingsResult.settings}
                initialLogs={logsResult.logs ?? []}
            />
        </div>
    )
}
