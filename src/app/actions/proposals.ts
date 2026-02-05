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
  const { data: indicacao, error: indicacaoError } = await supabaseAdmin
    .from("indicacoes")
    .select("id, email, telefone, documento, marca")
    .eq("id", indicacaoId)
    .maybeSingle()

  if (indicacaoError) {
    return { error: indicacaoError.message }
  }

  const candidateIds = new Set<string>([indicacaoId])
  const brand = indicacao?.marca === "rental" ? "rental" : "dorata"

  if (indicacao) {
    const matchClauses: string[] = []
    if (indicacao.email) matchClauses.push(`email.eq.${indicacao.email}`)
    if (indicacao.telefone) matchClauses.push(`telefone.eq.${indicacao.telefone}`)
    if (indicacao.documento) matchClauses.push(`documento.eq.${indicacao.documento}`)

    if (matchClauses.length > 0) {
      const { data: matches } = await supabaseAdmin
        .from("indicacoes")
        .select("id")
        .eq("marca", brand)
        .or(matchClauses.join(","))

      ;(matches ?? []).forEach((row) => {
        if (row?.id) candidateIds.add(row.id)
      })
    }
  }

  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("id, created_at, status, total_value, total_power, calculation, seller:users(name, email)")
    .in("client_id", Array.from(candidateIds))
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data: data ?? [] }
}
