import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth"
import { isWhatsAppInboxEnabled } from "@/lib/integrations/whatsapp"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasWhatsAppInboxAccess } from "@/lib/whatsapp-inbox-access"
import { WhatsAppInbox } from "@/components/admin/whatsapp/whatsapp-inbox"

export const dynamic = "force-dynamic"

export default async function AdminWhatsAppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getProfile(supabase, user.id)
  const canAccessInbox = hasWhatsAppInboxAccess({
    role: profile?.role ?? null,
    whatsapp_inbox_access: profile?.whatsappInboxAccess ?? null,
  })

  if (!canAccessInbox) {
    return (
      <div className="container mx-auto py-10">
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          <h2 className="text-lg font-bold">Acesso Negado</h2>
          <p>Você não tem permissão para acessar a inbox WhatsApp.</p>
        </div>
      </div>
    )
  }

  if (!isWhatsAppInboxEnabled()) {
    return (
      <div className="container mx-auto py-10">
        <div className="rounded-md border bg-amber-50 border-amber-200 p-4 text-amber-900">
          <h2 className="text-lg font-bold">Inbox WhatsApp desabilitada</h2>
          <p className="text-sm">
            Configure <code>WHATSAPP_INBOX_ENABLED=true</code> para habilitar este módulo.
          </p>
        </div>
      </div>
    )
  }

  const supabaseAdmin = createSupabaseServiceClient()
  let { data: agentsData, error: agentsError } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, whatsapp_inbox_access, status")
    .order("name", { ascending: true })

  if (agentsError && /could not find the 'whatsapp_inbox_access' column/i.test(agentsError.message ?? "")) {
    const fallback = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, status")
      .order("name", { ascending: true })

    agentsData = fallback.data as typeof agentsData
    agentsError = fallback.error as typeof agentsError
  }

  if (agentsError) {
    return (
      <div className="container mx-auto py-10">
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          <h2 className="text-lg font-bold">Erro ao carregar inbox WhatsApp</h2>
          <p className="text-sm">{agentsError.message}</p>
        </div>
      </div>
    )
  }

  const agents = (agentsData ?? [])
    .filter((row) => {
      const data = row as {
        role?: string | null
        status?: string | null
        whatsapp_inbox_access?: boolean | null
      }

      if (data.status && data.status !== "active" && data.status !== "ATIVO") {
        return false
      }

      return hasWhatsAppInboxAccess({
        role: data.role ?? null,
        whatsapp_inbox_access:
          typeof data.whatsapp_inbox_access === "boolean" ? data.whatsapp_inbox_access : null,
      })
    })
    .map((row) => ({
      id: row.id as string,
      name: (row as { name?: string | null }).name ?? null,
      email: (row as { email?: string | null }).email ?? null,
    }))

  const canManageConversationRestrictions =
    profile?.role === "adm_mestre" || profile?.role === "adm_dorata"

  return (
    <WhatsAppInbox
      currentUserId={user.id}
      initialAgents={agents}
      canManageConversationRestrictions={canManageConversationRestrictions}
    />
  )
}
