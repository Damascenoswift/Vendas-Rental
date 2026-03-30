// src/app/actions/sales-analyst.ts
"use server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { differenceInDays, parseISO } from "date-fns"

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
  negotiationStatus: NegotiationStatus
  totalValue: number | null
  profitMargin: number | null
  totalPower: number | null
  daysSinceUpdate: number
}

export type PanoramaData = {
  kpis: PanoramaKpis
  proposals: PanoramaProposal[]
  conversionByMonth: { month: string; avgDays: number }[]
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
      total_value,
      profit_margin,
      total_power,
      updated_at,
      created_at,
      contato:contacts(full_name),
      proposal_negotiations(negotiation_status, updated_at)
    `)
    .order("updated_at", { ascending: false })

  if (!proposals) return { kpis: { totalAberto: 0, totalFechamento: 0, totalConcluido: 0, qtdParados: 0 }, proposals: [], conversionByMonth: [] }

  type ContactRow = { full_name?: string | null }
  type NegRow = { negotiation_status: string; updated_at: string } | null

  const FECHAMENTO_STATUSES: NegotiationStatus[] = ['em_negociacao', 'followup']
  const CONCLUIDO_STATUSES: NegotiationStatus[] = ['convertido']
  const PARADO_STATUSES: NegotiationStatus[] = ['parado', 'perdido']

  let totalAberto = 0, totalFechamento = 0, totalConcluido = 0, qtdParados = 0
  const panoramaProposals: PanoramaProposal[] = []

  for (const p of proposals) {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    const status = (neg?.negotiation_status ?? 'sem_contato') as NegotiationStatus
    const value = p.total_value ?? 0
    const profitMargin = p.profit_margin ?? null    // use top-level column
    const contactArr = Array.isArray(p.contato) ? p.contato : p.contato ? [p.contato] : []
    const clientName = (contactArr[0] as ContactRow)?.full_name ?? "Cliente"
    const daysSinceUpdate = p.updated_at ? differenceInDays(new Date(), parseISO(p.updated_at)) : 0

    if (CONCLUIDO_STATUSES.includes(status)) totalConcluido += value
    else if (FECHAMENTO_STATUSES.includes(status)) { totalAberto += value; totalFechamento += value }
    else { totalAberto += value }

    if (PARADO_STATUSES.includes(status)) qtdParados++

    panoramaProposals.push({ id: p.id, clientName, negotiationStatus: status, totalValue: p.total_value, profitMargin, daysSinceUpdate, totalPower: p.total_power ?? null })
  }

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
  }
}
