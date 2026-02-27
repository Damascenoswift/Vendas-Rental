import { NotificationsCenter } from "@/components/admin/notifications/notifications-center"
import { createClient } from "@/lib/supabase/server"
import { getMyNotificationRules, getMyNotifications } from "@/services/notification-service"

export default async function NotificationsPage({
    searchParams,
}: {
    searchParams?: Promise<{ id?: string }>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const selectedId = resolvedSearchParams?.id?.trim() || null
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return null
    }

    const notifications = await getMyNotifications({
        includeRead: true,
        limit: 200,
    })
    const rulesResponse = await getMyNotificationRules()

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
                <p className="text-sm text-muted-foreground">
                    Acompanhe movimentações de tarefas, indicações, obras e chat em um só lugar.
                </p>
            </div>

            <NotificationsCenter
                currentUserId={user.id}
                initialNotifications={notifications}
                initialSelectedId={selectedId}
                initialRules={rulesResponse.rules}
                userSector={rulesResponse.sector}
                canManageDefaults={rulesResponse.canManageDefaults}
            />
        </div>
    )
}
