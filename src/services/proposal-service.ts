"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { Database } from "@/types/database"
import { revalidatePath } from "next/cache"
import { calculateProposal, type ProposalCalcInput, type ProposalCalculation } from "@/lib/proposal-calculation"
import { ensureCrmCardForIndication, type CrmBrand } from "@/services/crm-card-service"

export type PricingRule = Database['public']['Tables']['pricing_rules']['Row']
export type PricingRuleUpdate = Database['public']['Tables']['pricing_rules']['Update']

export type Proposal = Database['public']['Tables']['proposals']['Row']
export type ProposalInsert = Database['public']['Tables']['proposals']['Insert']
export type ProposalItem = Database['public']['Tables']['proposal_items']['Row']
export type ProposalItemInsert = Database['public']['Tables']['proposal_items']['Insert']
export type ProposalStatus = Database['public']['Enums']['proposal_status_enum']
export type ProposalSourceMode = 'simple' | 'complete' | 'legacy'

export type ProposalContactInput = {
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

export type ProposalEditorData = {
    id: string
    source_mode: ProposalSourceMode
    status: ProposalStatus | null
    client_id: string | null
    client_name: string | null
    contact_id: string | null
    contact_name: string | null
    seller_id: string | null
    total_power: number | null
    total_value: number | null
    calculation: ProposalCalculation | null
    contact: ProposalContactInput | null
    items: ProposalItem[]
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

function normalizeEmail(value?: string | null) {
    return sanitizeText(value).toLowerCase()
}

function onlyDigits(value?: string | null) {
    return sanitizeText(value).replace(/\D/g, "")
}

function phonesLikelyMatch(a?: string | null, b?: string | null) {
    const digitsA = onlyDigits(a)
    const digitsB = onlyDigits(b)
    if (!digitsA || !digitsB) return false
    if (digitsA === digitsB) return true

    const shortA = digitsA.slice(-8)
    const shortB = digitsB.slice(-8)
    if (!shortA || !shortB) return false
    return shortA === shortB
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
        const contactEmail = normalizeEmail(contact.email)

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
        const telefoneDigits = onlyDigits(telefone)
        const email = normalizeEmail(contactRecord.email)

        let reusedIndicacao: { id: string } | null = null

        if (contactId) {
            const { data: latestProposalByContact, error: latestProposalByContactError } = await supabaseAdmin
                .from("proposals")
                .select("client_id, created_at")
                .eq("contact_id", contactId)
                .not("client_id", "is", null)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (latestProposalByContactError) {
                console.error("Erro ao buscar histórico de proposta por contato:", latestProposalByContactError)
            } else if (latestProposalByContact?.client_id) {
                reusedIndicacao = { id: latestProposalByContact.client_id as string }
            }
        }

        if (!reusedIndicacao && telefone) {
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

        if (!reusedIndicacao && telefoneDigits) {
            const { data: phoneCandidates, error: phoneCandidatesError } = await supabaseAdmin
                .from("indicacoes")
                .select("id, telefone")
                .eq("marca", brand)
                .not("telefone", "is", null)
                .order("created_at", { ascending: false })
                .limit(300)

            if (phoneCandidatesError) {
                console.error("Erro ao buscar candidatas por telefone normalizado:", phoneCandidatesError)
            } else {
                const matched = (phoneCandidates ?? []).find((candidate: { id: string; telefone: string | null }) =>
                    phonesLikelyMatch(candidate.telefone, telefoneDigits)
                )
                if (matched?.id) {
                    reusedIndicacao = { id: matched.id }
                }
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
            const indicacaoPhoneDigits = onlyDigits(indicacaoPhone)
            const indicacaoEmail = normalizeEmail(existingIndicacao.email)

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

            if (!contactId && indicacaoPhoneDigits) {
                const { data: contactCandidates, error: contactCandidatesError } = await supabaseAdmin
                    .from("contacts")
                    .select("id, whatsapp, phone, mobile")
                    .order("created_at", { ascending: false })
                    .limit(300)

                if (contactCandidatesError) {
                    console.error("Erro ao buscar contato por telefone normalizado:", contactCandidatesError)
                } else {
                    const matchedContact = (contactCandidates ?? []).find((candidate: {
                        id: string
                        whatsapp: string | null
                        phone: string | null
                        mobile: string | null
                    }) =>
                        phonesLikelyMatch(candidate.whatsapp, indicacaoPhoneDigits) ||
                        phonesLikelyMatch(candidate.phone, indicacaoPhoneDigits) ||
                        phonesLikelyMatch(candidate.mobile, indicacaoPhoneDigits)
                    )

                    if (matchedContact?.id) {
                        contactId = matchedContact.id
                    }
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

    revalidatePath('/admin/orcamentos')
    return { success: true }
}

function normalizeSourceMode(value: unknown): ProposalSourceMode {
    if (value === "simple" || value === "complete" || value === "legacy") {
        return value
    }
    return "legacy"
}

function normalizeProposalStatusForForm(status: ProposalStatus | null | undefined): ProposalStatus {
    return status ?? "sent"
}

function asProposalCalculation(value: unknown): ProposalCalculation | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null
    }
    return value as ProposalCalculation
}

export async function getProposalEditorData(proposalId: string): Promise<ProposalEditorData | null> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return null
    }

    const supabaseAdmin = createSupabaseServiceClient()
    let includeSourceMode = true

    while (true) {
        const columns = [
            "id",
            "client_id",
            "contact_id",
            "seller_id",
            "status",
            "calculation",
            "total_power",
            "total_value",
            "cliente:indicacoes(id, nome)",
            "contato:contacts(id, full_name, first_name, last_name, email, whatsapp, phone, mobile)",
        ]
        if (includeSourceMode) columns.splice(8, 0, "source_mode")

        const { data: proposal, error } = await supabaseAdmin
            .from("proposals")
            .select(columns.join(", "))
            .eq("id", proposalId)
            .maybeSingle()

        if (error) {
            const missingColumn = parseMissingColumnError(error.message)
            if (missingColumn?.table === "proposals" && missingColumn.column === "source_mode" && includeSourceMode) {
                includeSourceMode = false
                continue
            }
            console.error("Erro ao carregar proposta para edição:", error)
            return null
        }

        if (!proposal) {
            return null
        }

        const { data: items, error: itemsError } = await supabaseAdmin
            .from("proposal_items")
            .select("*")
            .eq("proposal_id", proposalId)
            .order("created_at", { ascending: true })

        if (itemsError) {
            console.error("Erro ao carregar itens da proposta para edição:", itemsError)
            return null
        }

        const rawCliente = (proposal as Record<string, any>).cliente
        const rawContato = (proposal as Record<string, any>).contato
        const cliente = Array.isArray(rawCliente) ? (rawCliente[0] ?? null) : rawCliente
        const contato = Array.isArray(rawContato) ? (rawContato[0] ?? null) : rawContato
        const contactName =
            contato?.full_name?.trim() ||
            [contato?.first_name, contato?.last_name].filter(Boolean).join(" ").trim() ||
            null

        return {
            id: String((proposal as Record<string, any>).id),
            source_mode: normalizeSourceMode((proposal as Record<string, any>).source_mode),
            status: ((proposal as Record<string, any>).status as ProposalStatus | null) ?? null,
            client_id: ((proposal as Record<string, any>).client_id as string | null) ?? null,
            client_name: (cliente?.nome as string | null) ?? null,
            contact_id: ((proposal as Record<string, any>).contact_id as string | null) ?? null,
            contact_name: contactName,
            seller_id: ((proposal as Record<string, any>).seller_id as string | null) ?? null,
            total_power: ((proposal as Record<string, any>).total_power as number | null) ?? null,
            total_value: ((proposal as Record<string, any>).total_value as number | null) ?? null,
            calculation: asProposalCalculation((proposal as Record<string, any>).calculation),
            contact: contato
                ? {
                    id: (contato.id as string | null) ?? null,
                    first_name: (contato.first_name as string | null) ?? null,
                    last_name: (contato.last_name as string | null) ?? null,
                    full_name: (contato.full_name as string | null) ?? null,
                    email: (contato.email as string | null) ?? null,
                    whatsapp: (contato.whatsapp as string | null) ?? null,
                    phone: (contato.phone as string | null) ?? null,
                    mobile: (contato.mobile as string | null) ?? null,
                }
                : null,
            items: (items ?? []) as ProposalItem[],
        }
    }
}

export async function updateProposal(
    proposalId: string,
    proposalData: Partial<ProposalInsert> & { source_mode?: ProposalSourceMode },
    items: ProposalItemInsert[]
): Promise<{ success: true } | { success: false; error: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: "Usuário não autenticado." }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    let includeSourceMode = "source_mode" in proposalData

    const updatePayload: Record<string, any> = {
        ...proposalData,
        status: normalizeProposalStatusForForm((proposalData.status as ProposalStatus | null | undefined) ?? null),
        updated_at: new Date().toISOString(),
    }

    if (!includeSourceMode) {
        delete updatePayload.source_mode
    }

    let updatedProposal: { id: string; status: ProposalStatus | null } | null = null

    while (true) {
        const { data, error } = await supabaseAdmin
            .from("proposals")
            .update(updatePayload)
            .eq("id", proposalId)
            .select("id, status")
            .maybeSingle()

        if (!error && data) {
            updatedProposal = data as { id: string; status: ProposalStatus | null }
            break
        }

        if (!error || !includeSourceMode) {
            const message = error?.message ?? "Proposta não encontrada."
            return { success: false, error: `Falha ao atualizar orçamento: ${message}` }
        }

        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn?.table === "proposals" && missingColumn.column === "source_mode") {
            delete updatePayload.source_mode
            includeSourceMode = false
            continue
        }

        return { success: false, error: `Falha ao atualizar orçamento: ${error.message}` }
    }

    const { error: deleteItemsError } = await supabaseAdmin
        .from("proposal_items")
        .delete()
        .eq("proposal_id", proposalId)

    if (deleteItemsError) {
        return { success: false, error: `Falha ao atualizar itens do orçamento: ${deleteItemsError.message}` }
    }

    const itemsWithProposalId = items.map((item) => ({
        ...item,
        proposal_id: proposalId,
    }))

    if (itemsWithProposalId.length > 0) {
        const { error: insertItemsError } = await supabaseAdmin
            .from("proposal_items")
            .insert(itemsWithProposalId)

        if (insertItemsError) {
            return { success: false, error: `Falha ao salvar itens do orçamento: ${insertItemsError.message}` }
        }
    }

    let shouldSyncWorkCard = updatedProposal?.status === "accepted"

    if (!shouldSyncWorkCard) {
        const { data: workLinks, error: workLinksError } = await supabaseAdmin
            .from("obra_card_proposals" as any)
            .select("obra_id")
            .eq("proposal_id", proposalId)
            .limit(1)

        if (!workLinksError && (workLinks?.length ?? 0) > 0) {
            shouldSyncWorkCard = true
        }
    }

    if (shouldSyncWorkCard) {
        try {
            const workCardsModule = await import("@/services/work-cards-service")
            const workSyncResult = await workCardsModule.upsertWorkCardFromProposal({
                proposalId,
                actorId: user.id,
                allowNonAccepted: true,
            })

            if (workSyncResult && "error" in workSyncResult && workSyncResult.error) {
                console.error("Falha ao sincronizar obra após editar orçamento:", workSyncResult.error)
            }
        } catch (error) {
            console.error("Erro ao sincronizar obra após editar orçamento:", error)
        }
    }

    revalidatePath('/admin/orcamentos')
    revalidatePath('/admin/obras')
    revalidatePath('/admin/crm')
    revalidatePath('/admin/indicacoes')

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
