"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import { getSupervisorVisibleUserIds } from "@/lib/supervisor-scope"
import { revalidatePath } from "next/cache"

const proposalViewRoles = [
  "adm_mestre",
  "adm_dorata",
  "supervisor",
  "suporte",
  "suporte_tecnico",
  "suporte_limitado",
  "funcionario_n1",
  "funcionario_n2",
]

const proposalDeleteRoles = [...proposalViewRoles]

function isMissingSchemaError(error: { message?: string | null; details?: string | null; code?: string | null }) {
  const raw = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    raw.includes("does not exist") ||
    raw.includes("could not find the") ||
    raw.includes("schema cache")
  )
}

function mapDeleteProposalError(error: { message?: string | null; details?: string | null; code?: string | null }) {
  const raw = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase()

  if (raw.includes("indicacoes_contract_proposal_id_fkey")) {
    return "Não foi possível excluir: o orçamento está marcado como contrato em uma indicação."
  }
  if (raw.includes("tasks_proposal_id_fkey")) {
    return "Não foi possível excluir: existem tarefas vinculadas ao orçamento."
  }
  if (raw.includes("obra_cards_primary_proposal_id_fkey") || raw.includes("obra_card_proposals_proposal_id_fkey")) {
    return "Não foi possível excluir: o orçamento está vinculado a uma obra."
  }
  if (raw.includes("proposal_items_proposal_id_fkey")) {
    return "Não foi possível excluir: existem itens vinculados ao orçamento."
  }
  if (error.code === "23503") {
    return "Não foi possível excluir: existem registros vinculados a este orçamento."
  }

  return "Erro ao excluir orçamento."
}

type ProposalCandidateRow = {
  id?: string | null
  nome?: string | null
  email?: string | null
  telefone?: string | null
  documento?: string | null
  user_id?: string | null
}

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
  const supervisorVisibleUserIds =
    role === "supervisor" ? await getSupervisorVisibleUserIds(user.id) : null

  const supabaseAdmin = createSupabaseServiceClient()
  let indicacaoQuery = supabaseAdmin
    .from("indicacoes")
    .select("id, nome, email, telefone, documento, marca, user_id, contract_proposal_id")
    .eq("id", indicacaoId)

  if (role === "supervisor") {
    indicacaoQuery = indicacaoQuery.in("user_id", supervisorVisibleUserIds ?? [user.id])
  }

  const { data: indicacao, error: indicacaoError } = await indicacaoQuery.maybeSingle()

  if (indicacaoError) {
    return { error: indicacaoError.message }
  }
  if (!indicacao) {
    return { error: "Indicação fora do escopo permitido." }
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

    const candidatePools: ProposalCandidateRow[] = []

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

    let brandCandidatesQuery = supabaseAdmin
      .from("indicacoes")
      .select("id, nome, email, telefone, documento, user_id")
      .eq("marca", brand)
      .order("created_at", { ascending: false })
      .limit(400)
    if (role === "supervisor") {
      brandCandidatesQuery = brandCandidatesQuery.in("user_id", supervisorVisibleUserIds ?? [user.id])
    }

    const { data: brandCandidates, error: brandCandidatesError } = await brandCandidatesQuery

    if (brandCandidatesError) {
      console.error("Erro ao buscar candidatas para vínculo de orçamento:", brandCandidatesError)
    } else {
      candidatePools.push(...(brandCandidates ?? []))
    }

    const seenCandidateIds = new Set<string>()
    candidatePools.forEach((row) => {
      const rowId = row.id ?? undefined
      if (!rowId || seenCandidateIds.has(rowId)) return
      seenCandidateIds.add(rowId)

      const emailRow = (row.email ?? "").trim().toLowerCase()
      const phoneRow = onlyDigits(row.telefone)
      const docRow = onlyDigits(row.documento)
      const nameRow = normalizeText(row.nome)

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
    .select("id, client_id, created_at, status, total_value, total_power, calculation, seller:users(name, email)")
    .in("client_id", Array.from(candidateIds))
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return {
    data: data ?? [],
    selectedProposalId: indicacao?.contract_proposal_id ?? null,
  }
}

export async function deleteProposal(proposalId: string) {
  const normalizedProposalId = proposalId.trim()
  if (!normalizedProposalId) {
    return { error: "Orçamento inválido." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autorizado" }
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role
  if (!role || !proposalDeleteRoles.includes(role)) {
    return { error: "Sem permissão para excluir orçamentos." }
  }

  const supabaseAdmin = createSupabaseServiceClient()

  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from("proposals")
    .select("id, client_id")
    .eq("id", normalizedProposalId)
    .maybeSingle()

  if (proposalError) {
    return { error: proposalError.message }
  }

  if (!proposal) {
    return { error: "Orçamento não encontrado." }
  }

  if (role === "supervisor") {
    const visibleUserIds = await getSupervisorVisibleUserIds(user.id)
    const clientId = proposal.client_id

    if (!clientId || !visibleUserIds.length) {
      return { error: "Orçamento fora do escopo permitido." }
    }

    const { data: scopedIndication, error: scopedIndicationError } = await supabaseAdmin
      .from("indicacoes")
      .select("id")
      .eq("id", clientId)
      .in("user_id", visibleUserIds)
      .maybeSingle()

    if (scopedIndicationError) {
      return { error: scopedIndicationError.message }
    }
    if (!scopedIndication) {
      return { error: "Orçamento fora do escopo permitido." }
    }
  }

  const { error: clearContractProposalError } = await supabaseAdmin
    .from("indicacoes")
    .update({ contract_proposal_id: null })
    .eq("contract_proposal_id", normalizedProposalId)

  if (clearContractProposalError && !isMissingSchemaError(clearContractProposalError)) {
    console.error("Erro ao limpar contract_proposal_id antes de excluir orçamento:", clearContractProposalError)
    return { error: "Não foi possível limpar vínculo de contrato do orçamento." }
  }

  const { error: clearTaskProposalError } = await supabaseAdmin
    .from("tasks")
    .update({ proposal_id: null })
    .eq("proposal_id", normalizedProposalId)

  if (clearTaskProposalError && !isMissingSchemaError(clearTaskProposalError)) {
    console.error("Erro ao limpar tasks.proposal_id antes de excluir orçamento:", clearTaskProposalError)
    return { error: "Não foi possível limpar tarefas vinculadas ao orçamento." }
  }

  const { error: clearWorkPrimaryProposalError } = await supabaseAdmin
    .from("obra_cards")
    .update({ primary_proposal_id: null })
    .eq("primary_proposal_id", normalizedProposalId)

  if (clearWorkPrimaryProposalError && !isMissingSchemaError(clearWorkPrimaryProposalError)) {
    console.error("Erro ao limpar obra_cards.primary_proposal_id antes de excluir orçamento:", clearWorkPrimaryProposalError)
    return { error: "Não foi possível limpar vínculo do orçamento com obras." }
  }

  const { error: clearWorkProposalLinksError } = await supabaseAdmin
    .from("obra_card_proposals")
    .delete()
    .eq("proposal_id", normalizedProposalId)

  if (clearWorkProposalLinksError && !isMissingSchemaError(clearWorkProposalLinksError)) {
    console.error("Erro ao limpar obra_card_proposals antes de excluir orçamento:", clearWorkProposalLinksError)
    return { error: "Não foi possível limpar vínculos de obra do orçamento." }
  }

  const { error: clearProposalItemsError } = await supabaseAdmin
    .from("proposal_items")
    .delete()
    .eq("proposal_id", normalizedProposalId)

  if (clearProposalItemsError && !isMissingSchemaError(clearProposalItemsError)) {
    console.error("Erro ao limpar itens do orçamento antes de excluir:", clearProposalItemsError)
    return { error: "Não foi possível limpar itens do orçamento." }
  }

  const { error: deleteError } = await supabaseAdmin
    .from("proposals")
    .delete()
    .eq("id", normalizedProposalId)

  if (deleteError) {
    return { error: mapDeleteProposalError(deleteError) }
  }

  revalidatePath("/admin/orcamentos")
  revalidatePath("/admin/obras")
  revalidatePath("/admin/crm")
  revalidatePath("/admin/indicacoes")
  revalidatePath("/admin/financeiro")

  return { success: true }
}
