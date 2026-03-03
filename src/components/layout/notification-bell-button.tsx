"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Bell } from "lucide-react"

import { useAuthSession } from "@/hooks/use-auth-session"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type NotificationBellButtonProps = {
    initialUnreadCount?: number
}

export function NotificationBellButton({
    initialUnreadCount = 0,
}: NotificationBellButtonProps) {
    const { session, profile, status } = useAuthSession()
    const currentUserId = profile?.id ?? session?.user.id ?? null
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

    useEffect(() => {
        setUnreadCount(initialUnreadCount)
    }, [initialUnreadCount, currentUserId])

    useEffect(() => {
        if (status !== "authenticated" || !currentUserId) return

        let isMounted = true

        const loadUnreadCount = async () => {
            const { count, error } = await supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("recipient_user_id", currentUserId)
                .eq("is_read", false)

            if (error) {
                console.error("Erro ao atualizar badge de notificações:", error)
                return
            }

            if (isMounted) {
                setUnreadCount(count ?? 0)
            }
        }

        void loadUnreadCount()

        const channel = supabase
            .channel(`notification-bell-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "notifications",
                    filter: `recipient_user_id=eq.${currentUserId}`,
                },
                () => {
                    void loadUnreadCount()
                }
            )
            .subscribe()

        return () => {
            isMounted = false
            void supabase.removeChannel(channel)
        }
    }, [currentUserId, status])

    const hasUnread = unreadCount > 0

    return (
        <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(
                "transition-all duration-300",
                hasUnread && "animate-pulse border-amber-400/80 ring-2 ring-amber-300/70 shadow-lg shadow-amber-200/60"
            )}
        >
            <Link
                href="/admin/notificacoes"
                aria-label={
                    hasUnread
                        ? `Notificações, ${unreadCount} não lidas`
                        : "Notificações"
                }
            >
                <Bell className={cn("mr-2 h-4 w-4", hasUnread && "text-amber-600")} />
                Notificações
                {hasUnread && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </Link>
        </Button>
    )
}
