// src/app/actions/sales-analyst.ts
"use server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { differenceInDays, parseISO } from "date-fns"
import { getInstallationType } from "@/lib/price-approval-utils"

const ALLOWED_ROLES: UserRole[] = ['adm_mestre', 'adm_dorata']

async function assertAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Não autenticado")
  const profile = await getProfile(supabase, user.id)
  const role = (profile?.role ?? user.user_metadata?.role) as UserRole | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) throw new Error("Acesso negado")
  const service = createSupabaseServiceClient()
  // users.id = auth.uid() in this project (no separate auth_id column)
  return { userId: user.id, role, service }
}

export async function getSalesAnalystConversation(proposalId: string) {
  const { service } = await assertAccess()
  const { data, error } = await service
    .from("proposal_analyst_conversations")
    .select("id, role, content, status_suggestion, created_at, user_id")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getNegotiationRecord(proposalId: string) {
  const { service } = await assertAccess()
  const { data } = await service
    .from("proposal_negotiations")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle()
  return data
}

// confirmStatusSuggestion is a named alias for updateNegotiationStatus — used when
// the analyst suggests a status change and the user confirms via the chat UI.
// Keeping it as a distinct export preserves the semantic distinction for future audit logging.
export async function confirmStatusSuggestion(
  proposalId: string,
  status: NegotiationStatus
) {
  return updateNegotiationStatus(proposalId, status)
}

export async function updateNegotiationStatus(
  proposalId: string,
  status: NegotiationStatus
) {
  const { userId, service } = await assertAccess()
  const { data: existing } = await service
    .from("proposal_negotiations")
    .select("id")
    .eq("proposal_id", proposalId)
    .maybeSingle()

  if (existing) {
    await service
      .from("proposal_negotiations")
      .update({ negotiation_status: status, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("proposal_id", proposalId)
  } else {
    await service
      .from("proposal_negotiations")
      .insert({ proposal_id: proposalId, negotiation_status: status, updated_by: userId })
  }
}

export type PanoramaKpis = {
  totalAberto: number
  totalFechamento: number
  totalConcluido: number
  qtdParados: number
}

export type PanoramaProposal = {
  id: string
  clientName: string
  sellerId: string | null
  sellerName: string | null
  negotiationStatus: NegotiationStatus
  totalValue: number | null
  profitMargin: number | null
  totalPower: number | null
  daysSinceUpdate: number
  crmContractDate: string | null   // ISO string or null
}

export type PanoramaData = {
  kpis: PanoramaKpis
  proposals: PanoramaProposal[]
  conversionByMonth: { month: string; avgDays: number }[]
  avgMargin: number | null
  installationBreakdown: {
    telhado: { count: number; totalValue: number }
    solo: { count: number; totalValue: number }
  }
}

export async function getSalesAnalystPanorama(): Promise<PanoramaData> {
  const { service } = await assertAccess()

  // Load proposals with their negotiations.
  // The `proposals` table has no `marca` column — brand scoping is handled by RLS
  // (adm_dorata users can only see their brand's proposals via seller_id policies).
  // adm_mestre sees all; if stricter filtering is needed later, add a `marca` column migration.
  const { data: proposals } = await service
    .from("proposals")
    .select(`
      id,
      client_id,
      seller_id,
      total_value,
      profit_margin,
      total_power,
      calculation,
      updated_at,
      created_at,
      contato:contacts(full_name),
      seller:users(name, email),
      proposal_negotiations(negotiation_status, updated_at)
    `)
    .order("updated_at", { ascending: false })

  if (!proposals) return { kpis: { totalAberto: 0, totalFechamento: 0, totalConcluido: 0, qtdParados: 0 }, proposals: [], conversionByMonth: [], avgMargin: null, installationBreakdown: { telhado: { count: 0, totalValue: 0 }, solo: { count: 0, totalValue: 0 } } }

  // --- CRM contract date lookup ---
  const clientIds = proposals.map((p) => p.client_id).filter((id): id is string => !!id)

  let contractDateMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    // Find stage IDs for "Contrato Assinado" in the Dorata pipeline
    const { data: contractStages } = await service
      .from("crm_stages")
      .select("id, pipeline_id, crm_pipelines(brand)")
      .eq("name", "Contrato Assinado")
      .eq("is_closed", true)

    type PipeRow = { brand?: string | null }
    const dorataStageIds = (contractStages ?? [])
      .filter((s) => {
        const pipe = (Array.isArray(s.crm_pipelines) ? s.crm_pipelines[0] : s.crm_pipelines) as PipeRow | null
        return pipe?.brand === "dorata"
      })
      .map((s) => s.id)

    if (dorataStageIds.length > 0) {
      const { data: contractCards } = await service
        .from("crm_cards")
        .select("indicacao_id, stage_entered_at")
        .in("stage_id", dorataStageIds)
        .in("indicacao_id", clientIds)

      for (const card of contractCards ?? []) {
        if (card.indicacao_id && card.stage_entered_at) {
          contractDateMap[card.indicacao_id] = card.stage_entered_at
        }
      }
    }
  }

  type ContactRow = { full_name?: string | null }
  type SellerRow = { name?: string | null; email?: string | null }
  type NegRow = { negotiation_status: string; updated_at: string } | null

  const FECHAMENTO_STATUSES: NegotiationStatus[] = ['em_negociacao', 'followup']
  const CONCLUIDO_STATUSES: NegotiationStatus[] = ['convertido']
  const PARADO_STATUSES: NegotiationStatus[] = ['parado', 'perdido']

  let totalAberto = 0, totalFechamento = 0, totalConcluido = 0, qtdParados = 0
  const panoramaProposals: PanoramaProposal[] = []

  // For avg margin
  let marginSum = 0
  let marginCount = 0

  // For installation breakdown (misto counts as telhado)
  const breakdown = {
    telhado: { count: 0, totalValue: 0 },
    solo: { count: 0, totalValue: 0 },
  }

  for (const p of proposals) {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    const status = (neg?.negotiation_status ?? "sem_contato") as NegotiationStatus
    const value = p.total_value ?? 0
    const profitMargin = p.profit_margin ?? null
    const contactArr = Array.isArray(p.contato) ? p.contato : p.contato ? [p.contato] : []
    const clientName = (contactArr[0] as ContactRow)?.full_name ?? "Cliente"
    const sellerRow = (Array.isArray(p.seller) ? p.seller[0] : p.seller) as SellerRow | null
    const sellerName = sellerRow?.name?.trim() || sellerRow?.email?.trim() || null
    const daysSinceUpdate = p.updated_at ? differenceInDays(new Date(), parseISO(p.updated_at)) : 0
    const crmContractDate = (p.client_id ? contractDateMap[p.client_id] : undefined) ?? null

    if (CONCLUIDO_STATUSES.includes(status)) totalConcluido += value
    else if (FECHAMENTO_STATUSES.includes(status)) { totalAberto += value; totalFechamento += value }
    else { totalAberto += value }

    if (PARADO_STATUSES.includes(status)) qtdParados++

    // Avg margin accumulation
    if (profitMargin != null) {
      marginSum += profitMargin
      marginCount++
    }

    // Installation breakdown
    const installType = getInstallationType(p.calculation)
    if (installType === "solo") {
      breakdown.solo.count++
      breakdown.solo.totalValue += value
    } else if (installType === "telhado" || installType === "misto") {
      breakdown.telhado.count++
      breakdown.telhado.totalValue += value
    }

    panoramaProposals.push({
      id: p.id,
      clientName,
      sellerId: p.seller_id ?? null,
      sellerName,
      negotiationStatus: status,
      totalValue: p.total_value,
      profitMargin,
      daysSinceUpdate,
      totalPower: p.total_power ?? null,
      crmContractDate,
    })
  }

  const avgMargin = marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : null

  // Conversion time by month: proposals that are 'convertido', days from created_at to updated_at
  const converted = proposals.filter((p) => {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    return neg?.negotiation_status === 'convertido'
  })

  const byMonth: Record<string, number[]> = {}
  for (const p of converted) {
    if (!p.created_at || !p.updated_at) continue
    const days = differenceInDays(parseISO(p.updated_at), parseISO(p.created_at))
    const month = p.updated_at.slice(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(days)
  }

  const conversionByMonth = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, days]) => ({
      month,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    }))

  return {
    kpis: { totalAberto, totalFechamento, totalConcluido, qtdParados },
    proposals: panoramaProposals,
    conversionByMonth,
    avgMargin,
    installationBreakdown: breakdown,
  }
}
