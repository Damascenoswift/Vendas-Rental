import { redirect } from "next/navigation"

import { getProfile } from "@/lib/auth"
import { isWhatsAppInboxEnabled } from "@/lib/integrations/whatsapp"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { WhatsAppInbox } from "@/components/admin/whatsapp/whatsapp-inbox"

export const dynamic = "force-dynamic"

const allowedRoles = ["adm_mestre", "adm_dorata", "suporte_tecnico", "suporte_limitado"] as const

export default async function AdminWhatsAppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role

  if (!role || !allowedRoles.includes(role as (typeof allowedRoles)[number])) {
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
  const { data: agentsData, error: agentsError } = await supabaseAdmin
    .from("users")
    .select("id, name, email")
    .in("role", Array.from(allowedRoles))
    .order("name", { ascending: true })

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

  const agents = (agentsData ?? []).map((row) => ({
    id: row.id as string,
    name: (row as { name?: string | null }).name ?? null,
    email: (row as { email?: string | null }).email ?? null,
  }))

  return <WhatsAppInbox currentUserId={user.id} initialAgents={agents} />
}
