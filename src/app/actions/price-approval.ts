// src/app/actions/price-approval.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import { dispatchNotificationEvent } from "@/services/notification-service"
import { calcNewValue } from "@/lib/price-approval-utils"
import { revalidatePath } from "next/cache"

const ADM_ROLES: UserRole[] = ["adm_mestre", "adm_dorata"]

async function assertAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Não autenticado")
  return { userId: user.id, supabase }
}

async function assertAdm() {
  const { userId, supabase } = await assertAuth()
  const profile = await getProfile(supabase, userId)
  const role = (profile?.role ?? null) as UserRole | null
  if (!role || !ADM_ROLES.includes(role)) throw new Error("Acesso negado")
  const service = createSupabaseServiceClient()
  return { userId, role, service }
}

export type PriceApprovalStatus = "pending" | "approved" | "rejected"

export type PriceApprovalRecord = {
  id: string
  proposal_id: string
  requested_by: string
  approved_by: string | null
  status: PriceApprovalStatus
  vendedor_note: string | null
  original_margin: number | null
  original_value: number | null
  adm_min_margin: number | null
  new_value: number | null
  adm_note: string | null
  requested_at: string
  resolved_at: string | null
}

/**
 * Vendedor flags "cliente está achando caro".
 * Inserts a new approval record with status='pending'.
 * Accessible to any authenticated user who owns the proposal.
 */
export async function requestPriceApproval(
  proposalId: string,
  vendedorNote?: string
): Promise<void> {
  const { userId } = await assertAuth()
  const service = createSupabaseServiceClient()

  const { data: proposal, error: propError } = await service
    .from("proposals")
    .select("id, total_value, profit_margin, seller_id")
    .eq("id", proposalId)
    .single()

  if (propError || !proposal) throw new Error("Orçamento não encontrado")

  // Ownership check (ADMs can also request on behalf)
  if (proposal.seller_id !== userId) {
    const supabase = await createClient()
    const profile = await getProfile(supabase, userId)
    if (!profile?.role || !ADM_ROLES.includes(profile.role as UserRole)) {
      throw new Error("Acesso negado")
    }
  }

  const { error } = await service.from("proposal_price_approvals").insert({
    proposal_id: proposalId,
    requested_by: userId,
    status: "pending",
    vendedor_note: vendedorNote ?? null,
    original_margin: proposal.profit_margin,
    original_value: proposal.total_value,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/orcamentos/${proposalId}/editar`)
}

/**
 * Returns the latest approval record for a proposal (any status).
 * Used to hydrate the vendedor UI on the edit page.
 */
export async function getProposalPriceApproval(
  proposalId: string
): Promise<PriceApprovalRecord | null> {
  const service = createSupabaseServiceClient()
  const { data } = await service
    .from("proposal_price_approvals")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as PriceApprovalRecord | null) ?? null
}

export type PendingApprovalItem = {
  id: string
  proposal_id: string
  requested_by: string
  vendedor_note: string | null
  original_margin: number | null
  original_value: number | null
  requested_at: string
  clientName: string
  requesterName: string
}

/**
 * ADM-only: returns all pending approval requests with client + requester names.
 */
export async function getPendingApprovals(): Promise<PendingApprovalItem[]> {
  const { service } = await assertAdm()

  const { data, error } = await service
    .from("proposal_price_approvals")
    .select(`
      id,
      proposal_id,
      requested_by,
      vendedor_note,
      original_margin,
      original_value,
      requested_at,
      proposal:proposals(contato:contacts(full_name)),
      requester:users!proposal_price_approvals_requested_by_fkey(name, email)
    `)
    .eq("status", "pending")
    .order("requested_at", { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const proposal = Array.isArray(row.proposal) ? row.proposal[0] : row.proposal
    const contactArr = Array.isArray(proposal?.contato)
      ? proposal.contato
      : proposal?.contato
      ? [proposal.contato]
      : []
    const clientName = (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

    const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester
    const requesterName =
      (requester as { name?: string | null; email?: string | null } | null)?.name ??
      (requester as { name?: string | null; email?: string | null } | null)?.email ??
      "Vendedor"

    return {
      id: row.id,
      proposal_id: row.proposal_id,
      requested_by: row.requested_by,
      vendedor_note: row.vendedor_note,
      original_margin: row.original_margin,
      original_value: row.original_value,
      requested_at: row.requested_at,
      clientName,
      requesterName,
    }
  })
}

/**
 * ADM approves a pending request, sets minimum margin, computes new value,
 * and notifies the vendedor.
 */
export async function approvePriceApproval(
  approvalId: string,
  admMinMargin: number
): Promise<void> {
  const { userId, service } = await assertAdm()

  const { data: approval, error: approvalError } = await service
    .from("proposal_price_approvals")
    .select(`
      *,
      proposal:proposals(equipment_cost, labor_cost, additional_cost, seller_id, contato:contacts(full_name))
    `)
    .eq("id", approvalId)
    .single()

  if (approvalError || !approval) throw new Error("Aprovação não encontrada")
  if (approval.status !== "pending") throw new Error("Aprovação não está pendente")

  const proposal = Array.isArray(approval.proposal) ? approval.proposal[0] : approval.proposal

  const newValue = calcNewValue(
    (proposal as { equipment_cost?: number | null } | null)?.equipment_cost ?? null,
    (proposal as { labor_cost?: number | null } | null)?.labor_cost ?? null,
    (proposal as { additional_cost?: number | null } | null)?.additional_cost ?? null,
    approval.original_value,
    approval.original_margin,
    admMinMargin
  )

  const { error: updateError } = await service
    .from("proposal_price_approvals")
    .update({
      status: "approved",
      adm_min_margin: admMinMargin,
      new_value: newValue,
      approved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)

  if (updateError) throw new Error(updateError.message)

  const contactArr = Array.isArray(
    (proposal as { contato?: unknown } | null)?.contato
  )
    ? ((proposal as { contato: unknown[] }).contato)
    : (proposal as { contato?: unknown } | null)?.contato
    ? [(proposal as { contato: unknown }).contato]
    : []

  const clientName =
    (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

  const formattedValue = newValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })

  await dispatchNotificationEvent({
    domain: "SYSTEM",
    eventKey: "SYSTEM_GENERIC",
    entityType: "SYSTEM",
    entityId: approvalId,
    title: `Revisão de margem — ${clientName}`,
    message: `ADM aprovou margem mínima de ${admMinMargin}%. Novo valor sugerido: ${formattedValue}`,
    recipients: [{ userId: approval.requested_by, responsibilityKind: "OWNER" }],
    targetPath: `/admin/orcamentos/${approval.proposal_id}/editar`,
    revalidatePaths: ["/admin/orcamentos"],
  })
}

/**
 * ADM rejects a pending request and notifies the vendedor.
 */
export async function rejectPriceApproval(
  approvalId: string,
  admNote?: string
): Promise<void> {
  const { userId, service } = await assertAdm()

  const { data: approval, error: approvalError } = await service
    .from("proposal_price_approvals")
    .select(`
      *,
      proposal:proposals(seller_id, contato:contacts(full_name))
    `)
    .eq("id", approvalId)
    .single()

  if (approvalError || !approval) throw new Error("Aprovação não encontrada")
  if (approval.status !== "pending") throw new Error("Aprovação não está pendente")

  const { error: updateError } = await service
    .from("proposal_price_approvals")
    .update({
      status: "rejected",
      approved_by: userId,
      adm_note: admNote ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)

  if (updateError) throw new Error(updateError.message)

  const proposal = Array.isArray(approval.proposal) ? approval.proposal[0] : approval.proposal
  const contactArr = Array.isArray(
    (proposal as { contato?: unknown } | null)?.contato
  )
    ? ((proposal as { contato: unknown[] }).contato)
    : (proposal as { contato?: unknown } | null)?.contato
    ? [(proposal as { contato: unknown }).contato]
    : []

  const clientName =
    (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

  await dispatchNotificationEvent({
    domain: "SYSTEM",
    eventKey: "SYSTEM_GENERIC",
    entityType: "SYSTEM",
    entityId: approvalId,
    title: `Revisão de margem — ${clientName}`,
    message: `ADM não aprovou a revisão de margem para ${clientName}`,
    recipients: [{ userId: approval.requested_by, responsibilityKind: "OWNER" }],
    targetPath: `/admin/orcamentos/${approval.proposal_id}/editar`,
    revalidatePaths: ["/admin/orcamentos"],
  })
}
