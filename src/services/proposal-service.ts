"use server"

import { createClient } from "@/lib/supabase/server"
import { Database } from "@/types/database"
import { revalidatePath } from "next/cache"

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

    // 1. Create Proposal
    const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .insert(proposalData)
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
export async function calculateProposalValue(
    panels: { id: string, power: number, price: number, quantity: number },
    inverters: { id: string, price: number, quantity: number }[],
    structures: { id: string, price: number, quantity: number }[],
    otherItems: { id: string, price: number, quantity: number }[]
) {
    const rules = await getPricingRules()

    // Convert rules array to object for easier lookup
    const ruleMap: Record<string, number> = {}
    rules.forEach(r => {
        if (r.active) ruleMap[r.key] = Number(r.value)
    })

    // 1. Equipment Cost
    let equipmentCost = 0
    let totalPower = 0

    // Panels
    const totalPanels = panels.quantity
    equipmentCost += panels.price * panels.quantity
    totalPower += (panels.power || 0) * panels.quantity

    // Inverters
    inverters.forEach(inv => {
        equipmentCost += inv.price * inv.quantity
    })

    // Structures
    structures.forEach(str => {
        equipmentCost += str.price * str.quantity
    })

    // Others
    otherItems.forEach(item => {
        equipmentCost += item.price * item.quantity
    })

    // 2. Labor Cost
    // Rules: 'labor_per_panel' OR 'labor_per_watt'
    let laborCost = 0

    if (ruleMap['labor_per_panel'] !== undefined) {
        laborCost = totalPanels * ruleMap['labor_per_panel']
    } else if (ruleMap['labor_per_watt'] !== undefined) {
        laborCost = totalPower * ruleMap['labor_per_watt']
    }

    // 3. Additional & Margin
    let additionalCost = 0 // Extra fixed costs if any rules exist

    // 4. Profit Margin
    // If margin is a percentage of (Equip + Labor)
    let marginValue = 0
    if (ruleMap['default_margin']) {
        const costBasis = equipmentCost + laborCost + additionalCost
        marginValue = costBasis * (ruleMap['default_margin'] / 100)
    }

    const totalValue = equipmentCost + laborCost + additionalCost + marginValue

    return {
        totalValue,
        equipmentCost,
        laborCost,
        additionalCost,
        profitMargin: marginValue,
        totalPower,
        breakdown: {
            panels: panels.price * panels.quantity,
            inverters: inverters.reduce((acc, i) => acc + i.price * i.quantity, 0),
            structures: structures.reduce((acc, s) => acc + s.price * s.quantity, 0),
            others: otherItems.reduce((acc, o) => acc + o.price * o.quantity, 0)
        }
    }
}
