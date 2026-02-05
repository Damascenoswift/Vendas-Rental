"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"

const proposalViewRoles = [
  "adm_mestre",
  "adm_dorata",
  "supervisor",
  "suporte",
  "suporte_tecnico",
  "suporte_limitado",
  "funcionario_n1",
  "funcionario_n2",
] as const

export async function getProposalsForIndication(indicacaoId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autorizado" }
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role
  if (!role || !proposalViewRoles.includes(role)) {
    return { error: "Sem permissão para acessar orçamentos." }
  }

  const supabaseAdmin = createSupabaseServiceClient()
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("id, created_at, status, total_value, total_power, calculation, seller:users(name, email)")
    .eq("client_id", indicacaoId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data: data ?? [] }
}
