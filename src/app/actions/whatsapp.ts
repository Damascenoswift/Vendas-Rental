"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth"
import {
  getWhatsAppProvider,
  isWhatsAppInboxEnabled,
  normalizeWhatsAppIdentifier,
  sendWhatsAppTextMessage as sendWhatsAppCloudTextMessage,
  type SendMessageResult,
  type WhatsAppBrand,
  type WhatsAppConversationStatus,
  type WhatsAppMessageDirection,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/lib/integrations/whatsapp"
import { sendZApiTextMessage } from "@/lib/integrations/whatsapp-zapi"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasWhatsAppInboxAccess } from "@/lib/whatsapp-inbox-access"

const SEND_RATE_LIMIT_PER_MINUTE = 20
const MESSAGE_PAGE_SIZE_DEFAULT = 100
const MESSAGE_PAGE_SIZE_MAX = 200
const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000

export type WhatsAppAgent = {
  id: string
  name: string | null
  email: string | null
}

export type WhatsAppConversationListFilters = {
  search?: string
  brand?: WhatsAppBrand | "all"
  status?: WhatsAppConversationStatus | "all"
  unassignedOnly?: boolean
}

export type WhatsAppConversationListItem = {
  id: string
  account_id: string
  account_phone_number_id: string
  account_display_phone_number: string | null
  contact_id: string | null
  contact_name: string | null
  contact_whatsapp: string | null
  customer_wa_id: string
  customer_name: string | null
  brand: WhatsAppBrand | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  status: WhatsAppConversationStatus
  window_expires_at: string | null
  unread_count: number
  last_message_at: string
  updated_at: string
}

export type WhatsAppMessage = {
  id: string
  conversation_id: string
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  message_type: WhatsAppMessageType
  body_text: string | null
  status: WhatsAppMessageStatus
  sender_user_id: string | null
  sender_user_name: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
}

export type WhatsAppContactOption = {
  id: string
  name: string
  whatsapp: string
}

type ActionResult<T> = {
  success: boolean
  data?: T
  error?: string
}

type ConversationMessagesQueryOptions = {
  before?: string | null
  limit?: number
}

type ConversationMessagesResult = {
  conversation: ConversationRow
  messages: WhatsAppMessage[]
  has_more: boolean
  next_before: string | null
}

type ConversationRow = {
  id: string
  account_id: string
  contact_id: string | null
  customer_wa_id: string
  customer_name: string | null
  brand: WhatsAppBrand | null
  assigned_user_id: string | null
  status: WhatsAppConversationStatus
  window_expires_at: string | null
  unread_count: number
  last_message_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  message_type: WhatsAppMessageType
  body_text: string | null
  status: WhatsAppMessageStatus
  sender_user_id: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
}

type ContactSearchRow = {
  id: string
  full_name: string | null
  whatsapp: string | null
  whatsapp_normalized: string | null
}

class WhatsAppActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhatsAppActionError"
  }
}

function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, " ").trim()
}

function ensureValidBrand(value: string): value is WhatsAppBrand {
  return value === "rental" || value === "dorata"
}

function ensureValidStatus(value: string): value is WhatsAppConversationStatus {
  return value === "PENDING_BRAND" || value === "OPEN" || value === "CLOSED"
}

function mapSendResultToMessageStatus(sendResult: SendMessageResult): WhatsAppMessageStatus {
  if (!sendResult.success) return "failed"
  return "sent"
}

function buildWhatsAppAgentDisplayName(input: { name?: string; email?: string | null }) {
  const name = input.name?.trim()
  if (name) return name

  const email = input.email?.trim().toLowerCase() || ""
  if (email.includes("@")) {
    return email.split("@")[0] || "Atendente"
  }

  return "Atendente"
}

function hasMessageAgentSignature(text: string) {
  return /^\*[^*\n]+\*:\s*/.test(text)
}

async function shouldPrefixAgentSignature(input: { conversationId: string; senderUserId: string }) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("sender_user_id")
    .eq("conversation_id", input.conversationId)
    .eq("direction", "OUTBOUND")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new WhatsAppActionError(error.message)
  }

  if (!data) {
    return true
  }

  const lastSenderId = (data as { sender_user_id: string | null }).sender_user_id
  return lastSenderId !== input.senderUserId
}

async function sendWhatsAppByConfiguredProvider(input: {
  to: string
  text: string
  phoneNumberId: string
}): Promise<SendMessageResult> {
  const provider = getWhatsAppProvider()

  if (provider === "z_api") {
    return sendZApiTextMessage({
      to: input.to,
      text: input.text,
    })
  }

  return sendWhatsAppCloudTextMessage({
    to: input.to,
    text: input.text,
    phoneNumberId: input.phoneNumberId,
  })
}

async function requireWhatsAppAccess() {
  if (!isWhatsAppInboxEnabled()) {
    throw new WhatsAppActionError("Inbox WhatsApp desabilitada no ambiente atual.")
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new WhatsAppActionError("Usuário não autenticado.")
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role ?? null
  const canAccessInbox = hasWhatsAppInboxAccess({
    role,
    whatsapp_inbox_access: profile?.whatsappInboxAccess ?? null,
  })

  if (!canAccessInbox) {
    throw new WhatsAppActionError("Sem permissão para acessar a inbox WhatsApp.")
  }

  return {
    user,
    profile,
  }
}

async function fetchConversationById(conversationId: string) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select(
      "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at"
    )
    .eq("id", conversationId)
    .maybeSingle()

  if (error) {
    throw new WhatsAppActionError(error.message)
  }

  if (!data) {
    throw new WhatsAppActionError("Conversa não encontrada.")
  }

  return data as ConversationRow
}

async function insertConversationEvent(input: {
  conversationId: string
  actorUserId: string
  eventType: "BRAND_SET" | "ASSIGNED" | "UNASSIGNED" | "CLOSED" | "REOPENED"
  payload?: Record<string, unknown>
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { error } = await supabaseAdmin.from("whatsapp_conversation_events").insert({
    conversation_id: input.conversationId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    event_payload: input.payload ?? {},
  })

  if (error) {
    throw new WhatsAppActionError(error.message)
  }
}

export async function listWhatsAppAgents(): Promise<ActionResult<WhatsAppAgent[]>> {
  try {
    await requireWhatsAppAccess()

    const supabaseAdmin = createSupabaseServiceClient()
    let { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, status, whatsapp_inbox_access")
      .order("name", { ascending: true })

    if (error && /could not find the 'whatsapp_inbox_access' column/i.test(error.message ?? "")) {
      const fallback = await supabaseAdmin
        .from("users")
        .select("id, name, email, role, status")
        .order("name", { ascending: true })

      data = fallback.data as typeof data
      error = fallback.error as typeof error
    }

    if (error) {
      throw new WhatsAppActionError(error.message)
    }

    const agents = (data ?? [])
      .filter((row) => {
        const value = row as {
          role?: string | null
          status?: string | null
          whatsapp_inbox_access?: boolean | null
        }

        const status = (value.status ?? "").toLowerCase()
        const isActive = !status || status === "active" || status === "ativo"
        if (!isActive) return false

        return hasWhatsAppInboxAccess({
          role: value.role ?? null,
          whatsapp_inbox_access:
            typeof value.whatsapp_inbox_access === "boolean" ? value.whatsapp_inbox_access : null,
        })
      })
      .map((row) => ({
        id: (row as { id: string }).id,
        name: (row as { name?: string | null }).name ?? null,
        email: (row as { email?: string | null }).email ?? null,
      })) as WhatsAppAgent[]

    return { success: true, data: agents }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao buscar usuários de atendimento.",
    }
  }
}

export async function listWhatsAppConversations(
  filters: WhatsAppConversationListFilters = {}
): Promise<ActionResult<WhatsAppConversationListItem[]>> {
  try {
    await requireWhatsAppAccess()

    const supabaseAdmin = createSupabaseServiceClient()

    let query = supabaseAdmin
      .from("whatsapp_conversations")
      .select(
        "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at"
      )
      .order("last_message_at", { ascending: false })
      .limit(250)

    if (filters.unassignedOnly) {
      query = query.is("assigned_user_id", null)
    }

    if (filters.brand && filters.brand !== "all") {
      query = query.eq("brand", filters.brand)
    }

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status)
    }

    if (filters.search?.trim()) {
      const sanitized = sanitizeSearchTerm(filters.search)
      if (sanitized) {
        const digits = sanitized.replace(/\D/g, "")
        const conditions = [`customer_name.ilike.%${sanitized}%`]
        if (digits) {
          conditions.push(`customer_wa_id.ilike.%${digits}%`)
        }
        query = query.or(conditions.join(","))
      }
    }

    const { data: conversationsData, error: conversationsError } = await query

    if (conversationsError) {
      throw new WhatsAppActionError(conversationsError.message)
    }

    const conversations = (conversationsData ?? []) as ConversationRow[]

    if (conversations.length === 0) {
      return { success: true, data: [] }
    }

    const contactIds = Array.from(
      new Set(
        conversations
          .map((conversation) => conversation.contact_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const assigneeIds = Array.from(
      new Set(
        conversations
          .map((conversation) => conversation.assigned_user_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const accountIds = Array.from(new Set(conversations.map((conversation) => conversation.account_id)))

    const [contactsResult, usersResult, accountsResult] = await Promise.all([
      contactIds.length > 0
        ? supabaseAdmin
            .from("contacts")
            .select("id, full_name, whatsapp, whatsapp_normalized")
            .in("id", contactIds)
        : Promise.resolve({ data: [], error: null }),
      assigneeIds.length > 0
        ? supabaseAdmin.from("users").select("id, name").in("id", assigneeIds)
        : Promise.resolve({ data: [], error: null }),
      accountIds.length > 0
        ? supabaseAdmin
            .from("whatsapp_accounts")
            .select("id, phone_number_id, display_phone_number")
            .in("id", accountIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (contactsResult.error) {
      throw new WhatsAppActionError(contactsResult.error.message)
    }

    if (usersResult.error) {
      throw new WhatsAppActionError(usersResult.error.message)
    }

    if (accountsResult.error) {
      throw new WhatsAppActionError(accountsResult.error.message)
    }

    const contactsById = new Map(
      (contactsResult.data ?? []).map((row: any) => [
        row.id,
        {
          full_name: row.full_name as string | null,
          whatsapp: (row.whatsapp as string | null) || (row.whatsapp_normalized as string | null),
        },
      ])
    )

    const usersById = new Map(
      (usersResult.data ?? []).map((row: any) => [row.id, row.name as string | null])
    )

    const accountsById = new Map(
      (accountsResult.data ?? []).map((row: any) => [
        row.id,
        {
          phone_number_id: row.phone_number_id as string,
          display_phone_number: row.display_phone_number as string | null,
        },
      ])
    )

    const items = conversations.map((conversation) => {
      const contact = conversation.contact_id ? contactsById.get(conversation.contact_id) : null
      const account = accountsById.get(conversation.account_id)

      return {
        id: conversation.id,
        account_id: conversation.account_id,
        account_phone_number_id: account?.phone_number_id ?? "",
        account_display_phone_number: account?.display_phone_number ?? null,
        contact_id: conversation.contact_id,
        contact_name: contact?.full_name ?? null,
        contact_whatsapp: contact?.whatsapp ?? null,
        customer_wa_id: conversation.customer_wa_id,
        customer_name: conversation.customer_name,
        brand: conversation.brand,
        assigned_user_id: conversation.assigned_user_id,
        assigned_user_name: conversation.assigned_user_id
          ? usersById.get(conversation.assigned_user_id) ?? null
          : null,
        status: conversation.status,
        window_expires_at: conversation.window_expires_at,
        unread_count: conversation.unread_count,
        last_message_at: conversation.last_message_at,
        updated_at: conversation.updated_at,
      } satisfies WhatsAppConversationListItem
    })

    return { success: true, data: items }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao listar conversas WhatsApp.",
    }
  }
}

export async function getWhatsAppConversationMessages(
  conversationId: string,
  options: ConversationMessagesQueryOptions = {}
): Promise<ActionResult<ConversationMessagesResult>> {
  try {
    await requireWhatsAppAccess()

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId)
    const requestedLimit = Number.isFinite(options.limit) ? Number(options.limit) : MESSAGE_PAGE_SIZE_DEFAULT
    const pageLimit = Math.min(MESSAGE_PAGE_SIZE_MAX, Math.max(1, Math.floor(requestedLimit)))
    const beforeCursor = options.before?.trim() || null

    let messageQuery = supabaseAdmin
      .from("whatsapp_messages")
      .select(
        "id, conversation_id, direction, wa_message_id, message_type, body_text, status, sender_user_id, error_message, created_at, sent_at, delivered_at, read_at, failed_at"
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageLimit + 1)

    if (beforeCursor) {
      messageQuery = messageQuery.lt("created_at", beforeCursor)
    }

    const { data: messageRowsData, error: messageRowsError } = await messageQuery

    if (messageRowsError) {
      throw new WhatsAppActionError(messageRowsError.message)
    }

    const messageRowsDesc = (messageRowsData ?? []) as MessageRow[]
    const hasMore = messageRowsDesc.length > pageLimit
    const pageRowsDesc = hasMore ? messageRowsDesc.slice(0, pageLimit) : messageRowsDesc
    const messageRows = [...pageRowsDesc].reverse()

    const senderIds = Array.from(
      new Set(
        messageRows
          .map((row) => row.sender_user_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const sendersById = new Map<string, string | null>()

    if (senderIds.length > 0) {
      const { data: senderRowsData, error: senderRowsError } = await supabaseAdmin
        .from("users")
        .select("id, name")
        .in("id", senderIds)

      if (senderRowsError) {
        throw new WhatsAppActionError(senderRowsError.message)
      }

      for (const row of senderRowsData ?? []) {
        const sender = row as { id: string; name: string | null }
        sendersById.set(sender.id, sender.name)
      }
    }

    const messages = messageRows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      direction: row.direction,
      wa_message_id: row.wa_message_id,
      message_type: row.message_type,
      body_text: row.body_text,
      status: row.status,
      sender_user_id: row.sender_user_id,
      sender_user_name: row.sender_user_id ? sendersById.get(row.sender_user_id) ?? null : null,
      error_message: row.error_message,
      created_at: row.created_at,
      sent_at: row.sent_at,
      delivered_at: row.delivered_at,
      read_at: row.read_at,
      failed_at: row.failed_at,
    }))

    if (!beforeCursor && conversation.unread_count > 0) {
      const { error: unreadResetError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId)

      if (unreadResetError) {
        console.error("whatsapp_unread_reset_failed", {
          conversation_id: conversationId,
          error: unreadResetError.message,
        })
      } else {
        conversation.unread_count = 0
      }
    }

    return {
      success: true,
      data: {
        conversation,
        messages,
        has_more: hasMore,
        next_before: hasMore ? messageRows[0]?.created_at ?? null : null,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao carregar mensagens da conversa.",
    }
  }
}

export async function searchWhatsAppContacts(
  search = ""
): Promise<ActionResult<WhatsAppContactOption[]>> {
  try {
    await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const term = sanitizeSearchTerm(search)

    let query = supabaseAdmin
      .from("contacts")
      .select("id, full_name, whatsapp, whatsapp_normalized")
      .order("created_at", { ascending: false })
      .limit(30)

    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,whatsapp.ilike.%${term}%,whatsapp_normalized.ilike.%${term}%`
      )
    }

    const { data, error } = await query

    if (error) {
      throw new WhatsAppActionError(error.message)
    }

    const contacts = ((data ?? []) as ContactSearchRow[])
      .map((row) => {
        const normalized = normalizeWhatsAppIdentifier(row.whatsapp_normalized || row.whatsapp)
        if (!normalized) return null

        return {
          id: row.id,
          name: (row.full_name || `Contato ${normalized}`).trim(),
          whatsapp: normalized,
        } satisfies WhatsAppContactOption
      })
      .filter((value): value is WhatsAppContactOption => Boolean(value))

    return {
      success: true,
      data: contacts,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao buscar contatos do WhatsApp.",
    }
  }
}

export async function startWhatsAppConversationFromContact(
  contactId: string
): Promise<ActionResult<{ conversation_id: string }>> {
  try {
    await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: contactData, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, whatsapp, whatsapp_normalized")
      .eq("id", contactId)
      .maybeSingle()

    if (contactError || !contactData) {
      throw new WhatsAppActionError(contactError?.message ?? "Contato não encontrado.")
    }

    const contact = contactData as ContactSearchRow
    const customerWaId = normalizeWhatsAppIdentifier(contact.whatsapp_normalized || contact.whatsapp)

    if (!customerWaId) {
      throw new WhatsAppActionError("Contato não possui WhatsApp válido para iniciar conversa.")
    }

    const provider = getWhatsAppProvider()
    const { data: accountData, error: accountError } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("id")
      .eq("provider", provider)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (accountError || !accountData) {
      throw new WhatsAppActionError(
        accountError?.message ?? "Nenhuma conta WhatsApp ativa configurada para este provedor."
      )
    }

    const accountId = (accountData as { id: string }).id

    const { data: existingConversationData, error: existingConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id")
      .eq("account_id", accountId)
      .eq("customer_wa_id", customerWaId)
      .not("status", "eq", "CLOSED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingConversationError) {
      throw new WhatsAppActionError(existingConversationError.message)
    }

    if (existingConversationData) {
      return {
        success: true,
        data: {
          conversation_id: (existingConversationData as { id: string }).id,
        },
      }
    }

    const nowIso = new Date().toISOString()
    const conversationPayload: Record<string, unknown> = {
      account_id: accountId,
      contact_id: contact.id,
      customer_wa_id: customerWaId,
      customer_name: contact.full_name || null,
      status: "PENDING_BRAND",
      unread_count: 0,
      last_message_at: nowIso,
    }

    // With Z-API the conversation is commonly started by outbound messages.
    if (provider === "z_api") {
      conversationPayload.window_expires_at = new Date(Date.now() + WINDOW_DURATION_MS).toISOString()
    }

    const { data: insertedConversationData, error: insertConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert(conversationPayload)
      .select("id")
      .single()

    if (insertConversationError || !insertedConversationData) {
      throw new WhatsAppActionError(
        insertConversationError?.message ?? "Falha ao iniciar conversa com o contato."
      )
    }

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: {
        conversation_id: (insertedConversationData as { id: string }).id,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao iniciar conversa do WhatsApp a partir do contato.",
    }
  }
}

export async function assignWhatsAppConversation(
  conversationId: string,
  userId: string | null
): Promise<ActionResult<{ id: string; assigned_user_id: string | null }>> {
  try {
    const { user } = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId)

    if (userId) {
      const { data: assigneeData, error: assigneeError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle()

      if (assigneeError || !assigneeData) {
        throw new WhatsAppActionError("Usuário de atribuição não encontrado.")
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ assigned_user_id: userId })
      .eq("id", conversationId)

    if (updateError) {
      throw new WhatsAppActionError(updateError.message)
    }

    await insertConversationEvent({
      conversationId,
      actorUserId: user.id,
      eventType: userId ? "ASSIGNED" : "UNASSIGNED",
      payload: {
        previous_assigned_user_id: conversation.assigned_user_id,
        next_assigned_user_id: userId,
      },
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: { id: conversationId, assigned_user_id: userId },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao atribuir conversa.",
    }
  }
}

export async function setWhatsAppConversationBrand(
  conversationId: string,
  brand: WhatsAppBrand
): Promise<ActionResult<{ id: string; brand: WhatsAppBrand }>> {
  try {
    const { user } = await requireWhatsAppAccess()

    if (!ensureValidBrand(brand)) {
      throw new WhatsAppActionError("Marca inválida para a conversa.")
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId)

    const updates: Record<string, unknown> = {
      brand,
    }

    if (conversation.status === "PENDING_BRAND") {
      updates.status = "OPEN"
    }

    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update(updates)
      .eq("id", conversationId)

    if (updateError) {
      throw new WhatsAppActionError(updateError.message)
    }

    await insertConversationEvent({
      conversationId,
      actorUserId: user.id,
      eventType: "BRAND_SET",
      payload: {
        previous_brand: conversation.brand,
        next_brand: brand,
      },
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: { id: conversationId, brand },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao definir marca da conversa.",
    }
  }
}

export async function closeWhatsAppConversation(
  conversationId: string
): Promise<ActionResult<{ id: string; status: "CLOSED" }>> {
  try {
    const { user } = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()

    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ status: "CLOSED", unread_count: 0 })
      .eq("id", conversationId)

    if (updateError) {
      throw new WhatsAppActionError(updateError.message)
    }

    await insertConversationEvent({
      conversationId,
      actorUserId: user.id,
      eventType: "CLOSED",
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: { id: conversationId, status: "CLOSED" },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao fechar conversa.",
    }
  }
}

export async function reopenWhatsAppConversation(
  conversationId: string
): Promise<ActionResult<{ id: string; status: "OPEN" | "PENDING_BRAND" }>> {
  try {
    const { user } = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId)

    const nextStatus: "OPEN" | "PENDING_BRAND" = conversation.brand ? "OPEN" : "PENDING_BRAND"

    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ status: nextStatus })
      .eq("id", conversationId)

    if (updateError) {
      throw new WhatsAppActionError(updateError.message)
    }

    await insertConversationEvent({
      conversationId,
      actorUserId: user.id,
      eventType: "REOPENED",
      payload: {
        next_status: nextStatus,
      },
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: { id: conversationId, status: nextStatus },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao reabrir conversa.",
    }
  }
}

export async function sendWhatsAppTextMessage(
  conversationId: string,
  text: string
): Promise<ActionResult<{ message: WhatsAppMessage; send_result: SendMessageResult }>> {
  try {
    const { user, profile } = await requireWhatsAppAccess()

    const messageText = text.trim()

    if (!messageText) {
      throw new WhatsAppActionError("Digite uma mensagem antes de enviar.")
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId)

    if (!conversation.brand) {
      throw new WhatsAppActionError("Defina a marca da conversa antes de enviar mensagens.")
    }

    if (conversation.status === "CLOSED") {
      throw new WhatsAppActionError("Conversa fechada. Reabra para enviar novas mensagens.")
    }

    const now = Date.now()
    if (!conversation.window_expires_at || new Date(conversation.window_expires_at).getTime() <= now) {
      throw new WhatsAppActionError(
        "Janela de 24h encerrada. O envio de texto livre foi bloqueado nesta fase."
      )
    }

    const oneMinuteAgo = new Date(now - 60 * 1000).toISOString()
    const { count: recentOutboundCount, error: rateError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "OUTBOUND")
      .eq("sender_user_id", user.id)
      .gte("created_at", oneMinuteAgo)

    if (rateError) {
      throw new WhatsAppActionError(rateError.message)
    }

    if ((recentOutboundCount ?? 0) >= SEND_RATE_LIMIT_PER_MINUTE) {
      throw new WhatsAppActionError(
        "Limite de envio atingido temporariamente. Aguarde alguns segundos e tente novamente."
      )
    }

    const { data: accountData, error: accountError } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("id, phone_number_id, status")
      .eq("id", conversation.account_id)
      .maybeSingle()

    if (accountError || !accountData) {
      throw new WhatsAppActionError(accountError?.message ?? "Conta WhatsApp não encontrada.")
    }

    if ((accountData as { status: string }).status !== "active") {
      throw new WhatsAppActionError("Conta WhatsApp inativa. Verifique a configuração da integração.")
    }

    const shouldAddSignature = await shouldPrefixAgentSignature({
      conversationId,
      senderUserId: user.id,
    })

    const agentDisplayName = buildWhatsAppAgentDisplayName({
      name: profile?.name,
      email: user.email,
    })

    const messageToSend =
      shouldAddSignature && !hasMessageAgentSignature(messageText)
        ? `*${agentDisplayName}*: ${messageText}`
        : messageText

    const sendResult = await sendWhatsAppByConfiguredProvider({
      to: conversation.customer_wa_id,
      text: messageToSend,
      phoneNumberId: (accountData as { phone_number_id: string }).phone_number_id,
    })

    if (!sendResult.success) {
      throw new WhatsAppActionError(sendResult.error || "Falha no envio para WhatsApp Cloud API")
    }

    const nowIso = new Date().toISOString()

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversationId,
        direction: "OUTBOUND",
        wa_message_id: sendResult.messageId ?? null,
        message_type: "text",
        body_text: messageToSend,
        status: mapSendResultToMessageStatus(sendResult),
        sender_user_id: user.id,
        raw_payload: sendResult.raw ?? {},
        sent_at: nowIso,
      })
      .select(
        "id, conversation_id, direction, wa_message_id, message_type, body_text, status, sender_user_id, error_message, created_at, sent_at, delivered_at, read_at, failed_at"
      )
      .single()

    if (insertError || !insertedData) {
      throw new WhatsAppActionError(insertError?.message ?? "Falha ao registrar mensagem enviada")
    }

    const { error: conversationUpdateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        status: "OPEN",
        last_message_at: nowIso,
      })
      .eq("id", conversationId)

    if (conversationUpdateError) {
      console.error("whatsapp_conversation_last_message_update_failed", {
        conversation_id: conversationId,
        error: conversationUpdateError.message,
      })
    }

    revalidatePath("/admin/whatsapp")

    const inserted = insertedData as MessageRow

    return {
      success: true,
      data: {
        message: {
          id: inserted.id,
          conversation_id: inserted.conversation_id,
          direction: inserted.direction,
          wa_message_id: inserted.wa_message_id,
          message_type: inserted.message_type,
          body_text: inserted.body_text,
          status: inserted.status,
          sender_user_id: inserted.sender_user_id,
          sender_user_name: null,
          error_message: inserted.error_message,
          created_at: inserted.created_at,
          sent_at: inserted.sent_at,
          delivered_at: inserted.delivered_at,
          read_at: inserted.read_at,
          failed_at: inserted.failed_at,
        },
        send_result: sendResult,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao enviar mensagem.",
    }
  }
}

export async function updateWhatsAppConversationStatus(
  conversationId: string,
  status: WhatsAppConversationStatus
): Promise<ActionResult<{ id: string; status: WhatsAppConversationStatus }>> {
  if (!ensureValidStatus(status)) {
    return {
      success: false,
      error: "Status inválido para atualização de conversa.",
    }
  }

  if (status === "CLOSED") {
    const closeResult = await closeWhatsAppConversation(conversationId)
    if (!closeResult.success || !closeResult.data) return closeResult
    return { success: true, data: { id: conversationId, status: closeResult.data.status } }
  }

  const reopenResult = await reopenWhatsAppConversation(conversationId)
  if (!reopenResult.success || !reopenResult.data) return reopenResult

  return {
    success: true,
    data: {
      id: conversationId,
      status: reopenResult.data.status,
    },
  }
}
