"use client"

import { useEffect } from "react"

import { useAuthSession } from "@/hooks/use-auth-session"
import { playNotificationSound, initializeNotificationSounds } from "@/lib/notification-sounds"
import { supabase } from "@/lib/supabase"

type RealtimePayload = {
    new?: Record<string, unknown> | null
    old?: Record<string, unknown> | null
}

function toNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}

function hasIndicacoesAccess(role: string | null | undefined, department: string | null | undefined) {
    if (!role) return false
    if (department === "financeiro") return true
    return [
        "adm_mestre",
        "funcionario_n1",
        "funcionario_n2",
        "adm_dorata",
        "supervisor",
    ].includes(role)
}

export function NotificationSoundListener() {
    const { session, profile, status } = useAuthSession()

    const currentUserId = profile?.id ?? session?.user.id ?? null
    const role = profile?.role ?? null
    const department = profile?.department ?? null
    const canAccessIndicacoes = hasIndicacoesAccess(role, department)
    const canAccessInternalChat = Boolean(profile?.internalChatAccess)

    useEffect(() => {
        initializeNotificationSounds()
    }, [])

    useEffect(() => {
        if (status !== "authenticated" || !currentUserId) return

        const notificationsChannel = supabase
            .channel(`notification-sound-task-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `recipient_user_id=eq.${currentUserId}`,
                },
                (payload) => {
                    const row = (payload as RealtimePayload).new ?? null
                    const notificationType = String(row?.type ?? "").toUpperCase()

                    if (notificationType.startsWith("TASK_")) {
                        playNotificationSound("task_notification")
                    }
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(notificationsChannel)
        }
    }, [currentUserId, status])

    useEffect(() => {
        if (status !== "authenticated" || !currentUserId || !canAccessInternalChat) return

        const chatChannel = supabase
            .channel(`notification-sound-chat-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "internal_chat_participants",
                    filter: `user_id=eq.${currentUserId}`,
                },
                (payload) => {
                    const realtimePayload = payload as RealtimePayload
                    const nextUnread = toNumber(realtimePayload.new?.unread_count)
                    const prevUnread = toNumber(realtimePayload.old?.unread_count)

                    if (nextUnread > prevUnread) {
                        playNotificationSound("internal_chat")
                    }
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(chatChannel)
        }
    }, [canAccessInternalChat, currentUserId, status])

    useEffect(() => {
        if (status !== "authenticated" || !currentUserId || !canAccessIndicacoes) return

        const indicacoesChannel = supabase
            .channel(`notification-sound-indicacoes-rental-${currentUserId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "indicacoes",
                },
                (payload) => {
                    const row = (payload as RealtimePayload).new ?? null
                    const marca = String(row?.marca ?? "").trim().toLowerCase()
                    if (marca === "rental") {
                        playNotificationSound("rental_indication")
                    }
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(indicacoesChannel)
        }
    }, [canAccessIndicacoes, currentUserId, status])

    return null
}
