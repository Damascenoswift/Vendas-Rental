"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { Database } from "@/types/database"
import { revalidatePath } from "next/cache"
import { calculateProposal, type ProposalCalcInput, type ProposalCalculation } from "@/lib/proposal-calculation"
import { ensureCrmCardForIndication, type CrmBrand } from "@/services/crm-card-service"
import { upsertWorkCardFromProposal } from "@/services/work-cards-service"

export type PricingRule = Database['public']['Tables']['pricing_rules']['Row']
export type PricingRuleUpdate = Database['public']['Tables']['pricing_rules']['Update']

export type Proposal = Database['public']['Tables']['proposals']['Row']
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert']
export type ProposalItem = Database['public']['Tables']['proposal_items']['Row']
export type ProposalItemInsert = Database['public']['Tables']['proposal_items']['Insert']
type ProposalSourceMode = 'simple' | 'complete' | 'legacy'

type ProposalContactInput = {
    id?: string | null
    first_name?: string | null
    last_name?: string | null
    full_name?: string | null
    email?: string | null
    whatsapp?: string | null
    phone?: string | null
    mobile?: string | null
}

type ProposalCreateOptions = {
    client?: {
        indicacao_id?: string | null
        contact?: ProposalContactInput | null
    } | null
    crm_brand?: CrmBrand
    create_crm_card?: boolean
}

function buildFullName(contact?: ProposalContactInput | null) {
    if (!contact) return ""
    const fullName = contact.full_name?.trim()
    if (fullName) return fullName
    const first = contact.first_name?.trim() ?? ""
    const last = contact.last_name?.trim() ?? ""
    return [first, last].filter(Boolean).join(" ").trim()
}

function sanitizeText(value?: string | null) {
    if (!value) return ""
    return String(value).trim()
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null
    return { column: match[1], table: match[2] }
}

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
    proposalData: ProposalInsert & { source_mode?: ProposalSourceMode },
    items: ProposalItemInsert[],
    options?: ProposalCreateOptions
): Promise<{ success: true } | { success: false; error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: "Usuário não autenticado." }
    }
    const commissionPercent = await getCommissionPercent(supabase)
    const supabaseAdmin = createSupabaseServiceClient()
    const brand: CrmBrand = options?.crm_brand ?? "dorata"

    let clientId = proposalData.client_id ?? options?.client?.indicacao_id ?? null
    const contact = options?.client?.contact ?? null
    let contactId = ((proposalData as Record<string, any>).contact_id as string | null | undefined) ?? contact?.id ?? null
    let crmCreated = false

    if (!clientId && contact) {
        let contactRecord = contact

        const contactWhatsapp = sanitizeText(contact.whatsapp)
        const contactEmail = sanitizeText(contact.email).toLowerCase()

        if (!contactRecord.id) {
            let existingContact: ProposalContactInput | null = null

            if (contactWhatsapp) {
                const { data: foundByWhatsapp } = await supabaseAdmin
                    .from("contacts")
                    .select("id, first_name, last_name, full_name, email, whatsapp, phone, mobile")
                    .eq("whatsapp", contactWhatsapp)
                    .maybeSingle()
                if (foundByWhatsapp) {
                    existingContact = foundByWhatsapp
                }
            }

            if (!existingContact && contactEmail) {
                const { data: foundByEmail } = await supabaseAdmin
                    .from("contacts")
                    .select("id, first_name, last_name, full_name, email, whatsapp, phone, mobile")
                    .eq("email", contactEmail)
                    .maybeSingle()
                if (foundByEmail) {
                    existingContact = foundByEmail
                }
            }

            if (existingContact) {
                contactRecord = existingContact
            } else {
                const fullName = buildFullName(contact)
                const { data: createdContact, error: contactError } = await supabaseAdmin
                    .from("contacts")
                    .insert({
                        first_name: sanitizeText(contact.first_name) || null,
                        last_name: sanitizeText(contact.last_name) || null,
                        full_name: fullName || null,
                        email: contactEmail || null,
                        whatsapp: contactWhatsapp || null,
                        phone: sanitizeText(contact.phone) || null,
                        mobile: sanitizeText(contact.mobile) || null,
                        source: "orcamento",
                        imported_by: user.id,
                        raw_payload: contact,
                    })
                    .select("id, first_name, last_name, full_name, email, whatsapp, phone, mobile")
                    .single()

                if (contactError) {
                    console.error("Error creating contact:", contactError)
                    return { success: false, error: `Falha ao criar contato: ${contactError.message ?? "erro desconhecido"}` }
                }

                contactRecord = createdContact
            }
        }

        if (contactRecord.id) {
            contactId = contactRecord.id
        }

        const nome = buildFullName(contactRecord) || "Cliente"
        const telefone = sanitizeText(
            contactRecord.whatsapp || contactRecord.phone || contactRecord.mobile
        )
        const email = sanitizeText(contactRecord.email)

        let reusedIndicacao: { id: string } | null = null

        if (telefone) {
            const { data: indicacaoByPhone } = await supabaseAdmin
                .from("indicacoes")
                .select("id")
                .eq("marca", brand)
                .eq("telefone", telefone)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (indicacaoByPhone) {
                reusedIndicacao = indicacaoByPhone
            }
        }

        if (!reusedIndicacao && email) {
            const { data: indicacaoByEmail } = await supabaseAdmin
                .from("indicacoes")
                .select("id")
                .eq("marca", brand)
                .eq("email", email)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (indicacaoByEmail) {
                reusedIndicacao = indicacaoByEmail
            }
        }

        if (reusedIndicacao) {
            clientId = reusedIndicacao.id
        } else {
            const { data: indicacao, error: indicacaoError } = await supabaseAdmin
                .from("indicacoes")
                .insert({
                    tipo: "PF",
                    nome,
                    email: email || "",
                    telefone: telefone || "",
                    status: "EM_ANALISE",
                    user_id: user.id,
                    marca: brand,
                    valor: proposalData.total_value ?? 0,
                })
                .select("id")
                .single()

            if (indicacaoError || !indicacao) {
                console.error("Error creating indicacao for proposal:", indicacaoError)
                return { success: false, error: `Falha ao criar indicação: ${indicacaoError?.message ?? "erro desconhecido"}` }
            }

            clientId = indicacao.id

            if (options?.create_crm_card !== false) {
                const crmResult = await ensureCrmCardForIndication({
                    indicacaoId: indicacao.id,
                    title: nome,
                    assigneeId: proposalData.seller_id ?? user.id,
                    createdBy: user.id,
                    brand,
                    status: "EM_ANALISE",
                })
                if (crmResult?.error) {
                    console.error("Erro ao criar card CRM:", crmResult.error)
                }
                crmCreated = true
            }
        }
    }

    if (clientId) {
        const { data: existingIndicacao, error: indicacaoFetchError } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, email, telefone, tipo, documento, unidade_consumidora, codigo_cliente, codigo_instalacao, marca, user_id")
            .eq("id", clientId)
            .maybeSingle()

        if (indicacaoFetchError) {
            console.error("Erro ao buscar indicacao do orçamento:", indicacaoFetchError)
            return { success: false, error: `Falha ao validar indicação: ${indicacaoFetchError.message}` }
        }

        if (!existingIndicacao) {
            return { success: false, error: "Indicação não encontrada para o orçamento." }
        }

        if (!contactId) {
            const indicacaoPhone = sanitizeText(existingIndicacao.telefone)
            const indicacaoEmail = sanitizeText(existingIndicacao.email).toLowerCase()

            if (indicacaoPhone) {
                const { data: contactByPhone } = await supabaseAdmin
                    .from("contacts")
                    .select("id")
                    .eq("whatsapp", indicacaoPhone)
                    .limit(1)
                    .maybeSingle()

                if (contactByPhone?.id) {
                    contactId = contactByPhone.id
                }
            }

            if (!contactId && indicacaoEmail) {
                const { data: contactByEmail } = await supabaseAdmin
                    .from("contacts")
                    .select("id")
                    .eq("email", indicacaoEmail)
                    .limit(1)
                    .maybeSingle()

                if (contactByEmail?.id) {
                    contactId = contactByEmail.id
                }
            }
        }

        if (existingIndicacao.marca !== brand) {
            const { data: clonedIndicacao, error: cloneError } = await supabaseAdmin
                .from("indicacoes")
                .insert({
                    tipo: existingIndicacao.tipo ?? "PF",
                    nome: existingIndicacao.nome,
                    email: existingIndicacao.email ?? "",
                    telefone: existingIndicacao.telefone ?? "",
                    status: "EM_ANALISE",
                    user_id: existingIndicacao.user_id ?? user.id,
                    marca: brand,
                    documento: existingIndicacao.documento ?? null,
                    unidade_consumidora: existingIndicacao.unidade_consumidora ?? null,
                    codigo_cliente: existingIndicacao.codigo_cliente ?? null,
                    codigo_instalacao: existingIndicacao.codigo_instalacao ?? null,
                    valor: proposalData.total_value ?? null,
                })
                .select("id")
                .single()

            if (cloneError || !clonedIndicacao) {
                console.error("Erro ao clonar indicacao para marca correta:", cloneError)
                return { success: false, error: `Falha ao criar indicação Dorata: ${cloneError?.message ?? "erro desconhecido"}` }
            }

            clientId = clonedIndicacao.id
        }
    }

    if (clientId && proposalData.total_value != null) {
        await supabaseAdmin
            .from("indicacoes")
            .update({ valor: proposalData.total_value })
            .eq("id", clientId)
    }

    if (clientId && options?.create_crm_card !== false && !crmCreated) {
        const { data: indicacaoInfo } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, marca")
            .eq("id", clientId)
            .maybeSingle()

        const crmTitle = indicacaoInfo?.nome ?? null

        const crmResult = await ensureCrmCardForIndication({
            indicacaoId: clientId,
            title: crmTitle,
            assigneeId: proposalData.seller_id ?? user.id,
            createdBy: user.id,
            brand,
        })
        if (crmResult?.error) {
            console.error("Erro ao criar card CRM:", crmResult.error)
        }
    }

    // 1. Create Proposal
    const proposalPayload: Record<string, any> = {
        ...proposalData,
        client_id: clientId ?? proposalData.client_id ?? null,
        seller_id: proposalData.seller_id ?? user?.id ?? null,
        contact_id: contactId ?? null,
        source_mode: proposalData.source_mode ?? 'legacy',
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

    let proposal: Proposal | null = null
    let propError: { message?: string | null } | null = null
    while (true) {
        const insertResult = await supabaseAdmin
            .from('proposals')
            .insert(proposalPayload as any)
            .select()
            .single()

        proposal = insertResult.data as Proposal | null
        propError = insertResult.error

        if (!propError) break

        const missingColumn = parseMissingColumnError(propError.message)
        if (missingColumn && missingColumn.table === 'proposals' && missingColumn.column === 'contact_id') {
            delete proposalPayload.contact_id
            continue
        }
        if (missingColumn && missingColumn.table === 'proposals' && missingColumn.column === 'source_mode') {
            delete proposalPayload.source_mode
            continue
        }

        break
    }

    if (propError || !proposal) {
        console.error("Error creating proposal:", propError)
        const rawMessage = propError?.message ?? "erro desconhecido"
        if (rawMessage.includes('proposals_seller_id_fkey') || rawMessage.includes('public.users')) {
            return { success: false, error: "Usuário não sincronizado no painel. Vá em Usuários e sincronize com o Auth." }
        }
        if (rawMessage.includes('calculation') && rawMessage.includes('does not exist')) {
            return { success: false, error: "Banco desatualizado: falta a coluna calculation. Rode a migração 044_add_proposal_calculation.sql." }
        }
        if (rawMessage.includes('equipment_cost') && rawMessage.includes('does not exist')) {
            return { success: false, error: "Banco desatualizado: faltam colunas de cálculo. Rode a migração 034_create_pricing_rules.sql." }
        }
        return { success: false, error: `Falha ao criar orçamento: ${rawMessage}` }
    }

    // 2. Create Items
    const itemsWithId = items.map(item => ({
        ...item,
        proposal_id: proposal.id
    }))

    if (itemsWithId.length > 0) {
        const { error: itemsError } = await supabaseAdmin
            .from('proposal_items')
            .insert(itemsWithId)

        if (itemsError) {
            console.error("Error creating items:", itemsError)
            // Ideally we would rollback here, but Supabase HTTP client doesn't support transactions easily without RPC.
            // For MVP, we proceed.
        }
    }

    if (proposal.status === 'accepted') {
        const workResult = await upsertWorkCardFromProposal({
            proposalId: proposal.id,
            actorId: user.id,
        })
        if (workResult?.error) {
            console.error("Erro ao criar/atualizar card de obra a partir do orçamento:", workResult.error)
        }
    }

    revalidatePath('/admin/orcamentos')
    return { success: true }
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
    const { data: { user } } = await supabase.auth.getUser()

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

        const workResult = await upsertWorkCardFromProposal({
            proposalId: id,
            actorId: user?.id ?? null,
        })
        if (workResult?.error) {
            console.error("Erro ao criar/atualizar card de obra ao aceitar orçamento:", workResult.error)
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
