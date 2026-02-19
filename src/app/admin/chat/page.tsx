import { redirect } from "next/navigation"

import { InternalChatInbox } from "@/components/admin/chat/internal-chat-inbox"
import { getProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listMyConversations } from "@/services/internal-chat-service"

export const dynamic = "force-dynamic"

export default async function AdminChatPage({
    searchParams,
}: {
    searchParams?: Promise<{ conversation?: string }>
}) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const initialConversationId = resolvedSearchParams?.conversation?.trim() || undefined

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    if (!profile || !profile.internalChatAccess) {
        return (
            <div className="container mx-auto py-8">
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                    <h1 className="text-base font-semibold">Acesso indisponível</h1>
                    <p className="text-sm">
                        Seu perfil não possui permissão para usar o chat interno.
                    </p>
                </div>
            </div>
        )
    }

    const conversationsResult = await listMyConversations()

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Chat Interno</h1>
                <p className="text-sm text-muted-foreground">
                    Converse com a equipe em tempo real e acompanhe mensagens não lidas.
                </p>
            </div>

            <InternalChatInbox
                currentUserId={user.id}
                initialConversations={conversationsResult.success ? conversationsResult.data : []}
                initialConversationId={initialConversationId}
                initialLoadError={conversationsResult.success ? null : conversationsResult.error}
            />
        </div>
    )
}
