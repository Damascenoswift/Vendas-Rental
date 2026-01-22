"use server"

import { createClient } from "@/lib/supabase/server"
import { Database } from "@/types/database"
import { revalidatePath } from "next/cache"
import { calculateProposal, type ProposalCalcInput, type ProposalCalculation } from "@/lib/proposal-calculation"

export type PricingRule = Database['public']['Tables']['pricing_rules']['Row']
export type PricingRuleUpdate = Database['public']['Tables']['pricing_rules']['Update']

export type Proposal = Database['public']['Tables']['proposals']['Row']
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert']
export type ProposalItem = Database['public']['Tables']['proposal_items']['Row']
export type ProposalItemInsert = Database['public']['Tables']['proposal_items']['Insert']

// Pricing Rules
export async function getPricingRules() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .order('name')

    if (error) {
        console.error("Error fetching pricing rules:", error)
        return []
    }
    return data
}

export async function updatePricingRule(id: string, updates: PricingRuleUpdate) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('pricing_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw new Error("Failed to update pricing rule")

    revalidatePath('/admin/configuracoes/precos')
    return data
}

// Proposals
export async function createProposal(
    proposalData: ProposalInsert,
    items: ProposalItemInsert[]
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const commissionPercent = await getCommissionPercent(supabase)

    // 1. Create Proposal
    const proposalPayload: ProposalInsert = {
        ...proposalData,
        seller_id: proposalData.seller_id ?? user?.id ?? null
    }

    const calculation = proposalPayload.calculation as ProposalCalculation | null
    if (calculation) {
        const contractValue = Number(
            calculation.output?.totals?.total_a_vista ?? proposalPayload.total_value ?? 0
        )
        calculation.commission = {
            percent: commissionPercent,
            value: contractValue * commissionPercent,
            base_value: contractValue
        }
        proposalPayload.calculation = calculation as any
    }
    const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .insert(proposalPayload)
        .select()
        .single()

    if (propError || !proposal) {
        console.error("Error creating proposal:", propError)
        throw new Error("Failed to create proposal")
    }

    // 2. Create Items
    const itemsWithId = items.map(item => ({
        ...item,
        proposal_id: proposal.id
    }))

    const { error: itemsError } = await supabase
        .from('proposal_items')
        .insert(itemsWithId)

    if (itemsError) {
        console.error("Error creating items:", itemsError)
        // Ideally we would rollback here, but Supabase HTTP client doesn't support transactions easily without RPC.
        // For MVP, we proceed.
    }

    revalidatePath('/admin/orcamentos')
    return proposal
}

// Calculation Logic
// This could be moved to a shared utility or kept here.
// Returns calculated values but does NOT save to DB.
export async function calculateProposalValue(input: ProposalCalcInput) {
    return calculateProposal(input)
}

async function getCommissionPercent(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data, error } = await supabase
        .from('pricing_rules')
        .select('value')
        .eq('key', 'dorata_commission_percent')
        .single()

    if (error || !data) {
        return 0.03
    }

    const rawValue = Number(data.value)
    if (!Number.isFinite(rawValue)) {
        return 0.03
    }

    return rawValue > 1 ? rawValue / 100 : rawValue
}

// Status & Stock Logic
export type ProposalStatus = Database['public']['Enums']['proposal_status_enum']

import { createStockMovement } from "./product-service"

export async function updateProposalStatus(id: string, newStatus: ProposalStatus) {
    const supabase = await createClient()

    // 1. Get current proposal (to check previous status)
    const { data: currentProposal, error: fetchError } = await supabase
        .from('proposals')
        .select('*, items:proposal_items(*)')
        .eq('id', id)
        .single()

    if (fetchError || !currentProposal) {
        throw new Error("Proposta não encontrada")
    }

    const previousStatus = currentProposal.status

    // 2. Update status
    const { error: updateError } = await supabase
        .from('proposals')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)

    if (updateError) {
        throw new Error("Erro ao atualizar status da proposta")
    }

    // 3. Stock Logic
    // If becoming ACCEPTED -> Reserve Stock
    if (newStatus === 'accepted' && previousStatus !== 'accepted') {
        const items = currentProposal.items as any[]
        for (const item of items) {
            if (item.product_id) {
                await createStockMovement({
                    product_id: item.product_id,
                    type: 'RESERVE',
                    quantity: item.quantity,
                    reference_id: id,
                    entity_name: `Proposta #${id.slice(0, 8)}`,
                    date: new Date().toISOString()
                })
            }
        }
    }

    // If leaving ACCEPTED (e.g. to Rejected or Draft) -> Release Stock
    if (previousStatus === 'accepted' && newStatus !== 'accepted') {
        const items = currentProposal.items as any[]
        for (const item of items) {
            if (item.product_id) {
                await createStockMovement({
                    product_id: item.product_id,
                    type: 'RELEASE',
                    quantity: item.quantity,
                    reference_id: id,
                    entity_name: `Reversão Proposta #${id.slice(0, 8)}`,
                    date: new Date().toISOString()
                })
            }
        }
    }

    revalidatePath('/admin/orcamentos')
    return { success: true }
}
