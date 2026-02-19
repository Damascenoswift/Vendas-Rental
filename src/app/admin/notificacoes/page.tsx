import { NotificationsCenter } from "@/components/admin/notifications/notifications-center"
import { getMyNotifications } from "@/services/notification-service"

export default async function NotificationsPage({
    searchParams,
}: {
    searchParams?: Promise<{ id?: string }>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const selectedId = resolvedSearchParams?.id?.trim() || null

    const notifications = await getMyNotifications({
        includeRead: true,
        limit: 200,
    })

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
                <p className="text-sm text-muted-foreground">
                    Acompanhe comentários, menções e respostas em tarefas da equipe.
                </p>
            </div>

            <NotificationsCenter
                initialNotifications={notifications}
                initialSelectedId={selectedId}
            />
        </div>
    )
}
