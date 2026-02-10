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
    .select("id, nome, email, telefone, documento, marca, user_id")
    .eq("id", indicacaoId)
    .maybeSingle()

  if (indicacaoError) {
    return { error: indicacaoError.message }
  }

  const candidateIds = new Set<string>([indicacaoId])
  const brand = indicacao?.marca === "rental" ? "rental" : "dorata"
  const normalizeText = (value?: string | null) =>
    (value ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  const onlyDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "")

  if (indicacao) {
    const emailCurrent = (indicacao.email ?? "").trim().toLowerCase()
    const phoneCurrent = onlyDigits(indicacao.telefone)
    const docCurrent = onlyDigits(indicacao.documento)
    const nameCurrent = normalizeText(indicacao.nome)

    const candidatePools: any[] = []

    if (indicacao.user_id) {
      const { data: sameSellerCandidates, error: sameSellerError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, nome, email, telefone, documento, user_id")
        .eq("marca", brand)
        .eq("user_id", indicacao.user_id)
        .order("created_at", { ascending: false })
        .limit(400)

      if (sameSellerError) {
        console.error("Erro ao buscar candidatas (mesmo vendedor):", sameSellerError)
      } else {
        candidatePools.push(...(sameSellerCandidates ?? []))
      }
    }

    const { data: brandCandidates, error: brandCandidatesError } = await supabaseAdmin
      .from("indicacoes")
      .select("id, nome, email, telefone, documento, user_id")
      .eq("marca", brand)
      .order("created_at", { ascending: false })
      .limit(400)

    if (brandCandidatesError) {
      console.error("Erro ao buscar candidatas para vínculo de orçamento:", brandCandidatesError)
    } else {
      candidatePools.push(...(brandCandidates ?? []))
    }

    const seenCandidateIds = new Set<string>()
    candidatePools.forEach((row: any) => {
      const rowId = row?.id as string | undefined
      if (!rowId || seenCandidateIds.has(rowId)) return
      seenCandidateIds.add(rowId)

      const emailRow = ((row?.email as string | null) ?? "").trim().toLowerCase()
      const phoneRow = onlyDigits(row?.telefone as string | null)
      const docRow = onlyDigits(row?.documento as string | null)
      const nameRow = normalizeText(row?.nome as string | null)

      const emailMatch = Boolean(emailCurrent && emailRow && emailCurrent === emailRow)
      const docMatch = Boolean(docCurrent && docRow && docCurrent === docRow)

      const phoneMatch = Boolean(
        phoneCurrent &&
          phoneRow &&
          (
            phoneCurrent === phoneRow ||
            phoneRow.endsWith(phoneCurrent.slice(-8)) ||
            phoneCurrent.endsWith(phoneRow.slice(-8))
          )
      )

      const nameMatch = Boolean(
        nameCurrent &&
          nameRow &&
          (nameCurrent === nameRow || nameCurrent.includes(nameRow) || nameRow.includes(nameCurrent))
      )

      if (emailMatch || docMatch || phoneMatch || nameMatch) {
        candidateIds.add(rowId)
      }
    })
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
