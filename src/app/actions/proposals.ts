"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import { getSupervisorVisibleUserIds } from "@/lib/supervisor-scope"
import { aggregateProposalInverterItems } from "@/lib/proposal-inverter-utils"
import {
  applyProposalFinancialAdjustment,
  computeEffectiveMarginPercent,
  computeProposalMaterialBreakdown,
} from "@/lib/proposal-financial-adjustment-utils"
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

const ADM_ROLES = ["adm_mestre", "adm_dorata"]

export type ProposalSummaryData = {
  id: string
  clientName: string
  // Financeiro
  totalValue: number | null
  profitValue: number | null
  effectiveMarginPercent: number | null
  marginCalculatedPercent: number | null
  materialValue: number | null
  kitCost: number | null
  structureCost: number | null
  additionalCost: number | null
  materialTotal: number | null
  materialWithAdditionalTotal: number | null
  // Pagamento
  entrada: number | null          // valor entrada
  parcelaMensal: number | null
  totalPago: number | null
  jurosPagos: number | null
  saldoPosCarencia: number | null
  qtdParcelas: number | null
  mesesCarencia: number | null
  // Sistema
  totalPower: number | null
  kWp: number | null
  kWhMensal: number | null        // kWh estimado por mês
  kWhAnual: number | null         // kWh estimado por ano
  indiceProducao: number | null
  // Comercial
  economiaMensal: number | null
  economiaAnual: number | null
  tarifaKwh: number | null
  // Equipamentos
  qtdModulos: number | null
  potenciaModuloW: number | null
  moduleName: string | null
  inverterType: string | null
  inverterNames: string[]
  inverterTotalQuantity: number | null
  inverterItems: Array<{ name: string; quantity: number }>
}

export async function getProposalSummary(proposalId: string): Promise<ProposalSummaryData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const supabaseAdmin = createSupabaseServiceClient()

  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from("proposals")
    .select(`
      id, total_value, profit_margin, total_power, calculation, equipment_cost, additional_cost,
      cliente:indicacoes!proposals_client_id_fkey(nome),
      contato:contacts!proposals_contact_id_fkey(full_name, first_name, last_name)
    `)
    .eq("id", proposalId)
    .maybeSingle()

  if (proposalError || !proposal) return null

  const { data: items } = await supabaseAdmin
    .from("proposal_items")
    .select("product_id, quantity, products(id, name, type)")
    .eq("proposal_id", proposalId)

  // Extract calculation fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calc = proposal.calculation as any

  const kWp: number | null = calc?.output?.dimensioning?.kWp ?? null
  const kWhMensal: number | null = calc?.output?.dimensioning?.kWh_estimado ?? null
  const kWhAnual: number | null = kWhMensal != null ? kWhMensal * 12 : null
  const inverterType: string | null =
    calc?.output?.dimensioning?.inversor?.tipo ??
    calc?.input?.dimensioning?.tipo_inversor ??
    null
  const qtdModulos: number | null = calc?.input?.dimensioning?.qtd_modulos ?? null
  const potenciaModuloW: number | null = calc?.input?.dimensioning?.potencia_modulo_w ?? null
  const indiceProducao: number | null = calc?.input?.dimensioning?.indice_producao ?? null
  const materialValue: number | null = calc?.output?.totals?.views?.view_material ?? null
  const marginCalculatedPercentRaw = Number(calc?.input?.margin?.margem_percentual ?? NaN)
  const marginCalculatedPercent: number | null = Number.isFinite(marginCalculatedPercentRaw)
    ? marginCalculatedPercentRaw * 100
    : null
  const materialBreakdown = computeProposalMaterialBreakdown({
    kitCost: calc?.output?.kit?.custo_kit ?? proposal.equipment_cost ?? null,
    structureCost: calc?.output?.structure?.valor_estrutura_total ?? null,
    additionalCost: calc?.output?.extras?.extras_total ?? proposal.additional_cost ?? null,
    materialValueFallback: materialValue,
  })
  // Pagamento
  const entrada: number | null = calc?.output?.finance?.entrada_percentual != null && calc?.output?.totals?.total_a_vista != null
    ? calc.output.finance.entrada_percentual / 100 * calc.output.totals.total_a_vista
    : null
  const parcelaMensal: number | null = calc?.output?.finance?.parcela_mensal ?? null
  const totalPago: number | null = calc?.output?.finance?.total_pago ?? null
  const jurosPagos: number | null = calc?.output?.finance?.juros_pagos ?? null
  const saldoPosCarencia: number | null = calc?.output?.finance?.saldo_pos_carencia ?? null
  const qtdParcelas: number | null = calc?.output?.finance?.parcela_mensal != null ? (calc?.params?.parcelas ?? null) : null
  const mesesCarencia: number | null = calc?.params?.meses_carencia ?? null
  // Comercial
  const economiaMensal: number | null = calc?.output?.commercial?.economia_mensal_estimada ?? null
  const economiaAnual: number | null = calc?.output?.commercial?.economia_anual_estimada ?? null
  const tarifaKwh: number | null = calc?.output?.commercial?.tarifa_kwh ?? null

  // Extract product names from items
  let moduleName: string | null = null
  const inverterAggregationInput: Array<{
    quantity?: number | null
    productType?: string | null
    productName?: string | null
  }> = []

  for (const item of items ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product = Array.isArray((item as any).products) ? (item as any).products[0] : (item as any).products
    if (!product) continue
    const type: string = (product.type ?? "").toLowerCase()
    if (type === "module" && !moduleName) {
      moduleName = product.name ?? null
    }

    inverterAggregationInput.push({
      quantity: Number((item as { quantity?: number | null }).quantity ?? 0),
      productType: product.type ?? null,
      productName: product.name ?? null,
    })
  }

  const inverterSummary = aggregateProposalInverterItems(inverterAggregationInput)

  // Derive client name
  const cliente = Array.isArray(proposal.cliente) ? (proposal.cliente[0] ?? null) : proposal.cliente
  const contato = Array.isArray(proposal.contato) ? (proposal.contato[0] ?? null) : proposal.contato

  const clienteNome = (cliente?.nome ?? "").trim()
  const contatoFullName = (contato?.full_name ?? "").trim()
  const contatoByParts = [contato?.first_name, contato?.last_name].filter(Boolean).join(" ").trim()
  const clientName = clienteNome || contatoFullName || contatoByParts || "Cliente"

  return {
    id: proposal.id,
    clientName,
    totalValue: proposal.total_value ?? null,
    profitValue: proposal.profit_margin ?? null,
    effectiveMarginPercent: computeEffectiveMarginPercent(
      proposal.total_value ?? null,
      proposal.profit_margin ?? null
    ),
    marginCalculatedPercent,
    materialValue,
    kitCost: materialBreakdown.kitCost,
    structureCost: materialBreakdown.structureCost,
    additionalCost: materialBreakdown.additionalCost,
    materialTotal: materialBreakdown.materialTotal,
    materialWithAdditionalTotal: materialBreakdown.materialWithAdditionalTotal,
    totalPower: proposal.total_power ?? null,
    kWp,
    kWhMensal,
    kWhAnual,
    indiceProducao,
    inverterType,
    qtdModulos,
    potenciaModuloW,
    entrada,
    parcelaMensal,
    totalPago,
    jurosPagos,
    saldoPosCarencia,
    qtdParcelas,
    mesesCarencia,
    economiaMensal,
    economiaAnual,
    tarifaKwh,
    moduleName,
    inverterNames: inverterSummary.inverterNames,
    inverterTotalQuantity: inverterSummary.inverterTotalQuantity,
    inverterItems: inverterSummary.inverterItems,
  }
}

export async function updateProposalMargin(
  proposalId: string,
  margin: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const profile = await getProfile(supabase, user.id)
  const role = (profile?.role ?? user.user_metadata?.role) as string | undefined
  if (!role || !ADM_ROLES.includes(role)) return { error: "Acesso negado" }

  if (margin < 0 || margin > 60) return { error: "Margem inválida (0–60%)" }

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from("proposals")
    .update({ profit_margin: margin })
    .eq("id", proposalId)

  if (error) return { error: "Erro ao salvar margem" }

  revalidatePath("/admin/orcamentos")
  return {}
}

type UpdateProposalFinancialAdjustmentInput = {
  deltaTotalValue: number
  deltaProfitValue: number
}

type UpdateProposalFinancialAdjustmentResult = {
  error?: string
  data?: {
    totalValue: number
    profitValue: number
    effectiveMarginPercent: number | null
  }
}

export async function updateProposalFinancialAdjustment(
  proposalId: string,
  input: UpdateProposalFinancialAdjustmentInput
): Promise<UpdateProposalFinancialAdjustmentResult> {
  const normalizedProposalId = proposalId.trim()
  if (!normalizedProposalId) return { error: "Orçamento inválido." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  const profile = await getProfile(supabase, user.id)
  const role = (profile?.role ?? user.user_metadata?.role) as string | undefined
  if (!role || !ADM_ROLES.includes(role)) return { error: "Acesso negado" }

  const deltaTotalValue = Number(input.deltaTotalValue)
  const deltaProfitValue = Number(input.deltaProfitValue)
  if (!Number.isFinite(deltaTotalValue) || !Number.isFinite(deltaProfitValue)) {
    return { error: "Ajuste financeiro inválido." }
  }

  const service = createSupabaseServiceClient()
  const { data: current, error: fetchError } = await service
    .from("proposals")
    .select("id, total_value, profit_margin")
    .eq("id", normalizedProposalId)
    .maybeSingle()

  if (fetchError || !current) {
    return { error: "Orçamento não encontrado." }
  }

  const adjustment = applyProposalFinancialAdjustment({
    currentTotalValue: current.total_value ?? 0,
    currentProfitValue: current.profit_margin ?? 0,
    deltaTotalValue,
    deltaProfitValue,
  })

  if (!adjustment.ok) return { error: adjustment.error }

  const { error: updateError } = await service
    .from("proposals")
    .update({
      total_value: adjustment.nextTotalValue,
      profit_margin: adjustment.nextProfitValue,
    })
    .eq("id", normalizedProposalId)

  if (updateError) {
    return { error: "Erro ao salvar ajuste financeiro." }
  }

  revalidatePath("/admin/orcamentos")

  return {
    data: {
      totalValue: adjustment.nextTotalValue,
      profitValue: adjustment.nextProfitValue,
      effectiveMarginPercent: adjustment.nextMarginPercent,
    },
  }
}
