import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

import {
  extractInboundMessageText,
  isWhatsAppInboxEnabled,
  mapInboundMessageType,
  normalizeWhatsAppIdentifier,
  type WhatsAppMessageStatus,
  type WhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@/lib/integrations/whatsapp"
import { createSupabaseServiceClient } from "@/lib/supabase-server"

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000

type AccountRow = {
  id: string
  phone_number_id: string
  waba_id: string
  display_phone_number: string | null
  status: "active" | "inactive"
}

type ContactRow = {
  id: string
  full_name: string | null
  whatsapp: string | null
  whatsapp_normalized: string | null
}

type ConversationRow = {
  id: string
  account_id: string
  contact_id: string | null
  customer_wa_id: string
  customer_name: string | null
  status: "PENDING_BRAND" | "OPEN" | "CLOSED"
  unread_count: number
}

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || ""
}

function getDefaultPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || ""
}

function getDefaultWabaId() {
  return process.env.WHATSAPP_WABA_ID || ""
}

function toIsoTimestamp(raw: string | null | undefined) {
  if (!raw) return null
  const value = Number(raw)
  if (Number.isNaN(value) || value <= 0) return null
  return new Date(value * 1000).toISOString()
}

function statusToMessageStatus(status: string | null | undefined): WhatsAppMessageStatus | null {
  switch (status) {
    case "sent":
      return "sent"
    case "delivered":
      return "delivered"
    case "read":
      return "read"
    case "failed":
      return "failed"
    default:
      return null
  }
}

async function ensureAccount(input: {
  phoneNumberId: string
  displayPhoneNumber: string | null
  wabaId: string
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id, phone_number_id, waba_id, display_phone_number, status")
    .eq("phone_number_id", input.phoneNumberId)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existing = (existingData ?? null) as AccountRow | null

  if (existing) {
    const updates: Record<string, unknown> = {}

    if (input.wabaId && existing.waba_id !== input.wabaId) {
      updates.waba_id = input.wabaId
    }

    if (input.displayPhoneNumber && existing.display_phone_number !== input.displayPhoneNumber) {
      updates.display_phone_number = input.displayPhoneNumber
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from("whatsapp_accounts")
        .update(updates)
        .eq("id", existing.id)
    }

    return existing.id
  }

  const { data: insertedData, error: insertError } = await supabaseAdmin
    .from("whatsapp_accounts")
    .insert({
      provider: "meta_cloud_api",
      waba_id: input.wabaId,
      phone_number_id: input.phoneNumberId,
      display_phone_number: input.displayPhoneNumber,
      status: "active",
    })
    .select("id")
    .single()

  if (insertError || !insertedData) {
    throw new Error(insertError?.message ?? "Falha ao criar conta WhatsApp")
  }

  return (insertedData as { id: string }).id
}

async function findOrCreateContact(customerWaId: string, customerName: string | null, payload: unknown) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data: existingByNormalizedData, error: existingByNormalizedError } = await supabaseAdmin
    .from("contacts")
    .select("id, full_name, whatsapp, whatsapp_normalized")
    .eq("whatsapp_normalized", customerWaId)
    .limit(1)
    .maybeSingle()

  if (existingByNormalizedError) {
    throw new Error(existingByNormalizedError.message)
  }

  const existingByNormalized = (existingByNormalizedData ?? null) as ContactRow | null
  if (existingByNormalized) {
    return existingByNormalized.id
  }

  const fallbackName = customerName?.trim() || `Contato ${customerWaId}`
  const firstName = fallbackName.split(" ").filter(Boolean)[0] ?? fallbackName

  const { data: insertedData, error: insertError } = await supabaseAdmin
    .from("contacts")
    .insert({
      source: "whatsapp_cloud_api",
      full_name: fallbackName,
      first_name: firstName,
      whatsapp: customerWaId,
      whatsapp_normalized: customerWaId,
      raw_payload: payload as Record<string, unknown>,
    })
    .select("id")
    .single()

  if (insertError || !insertedData) {
    throw new Error(insertError?.message ?? "Falha ao criar contato WhatsApp")
  }

  return (insertedData as { id: string }).id
}

async function findOrCreateConversation(input: {
  accountId: string
  contactId: string
  customerWaId: string
  customerName: string | null
}) {
  const supabaseAdmin = createSupabaseServiceClient()

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, account_id, contact_id, customer_wa_id, customer_name, status, unread_count")
    .eq("account_id", input.accountId)
    .eq("customer_wa_id", input.customerWaId)
    .not("status", "eq", "CLOSED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existing = (existingData ?? null) as ConversationRow | null

  if (existing) {
    const updates: Record<string, unknown> = {}

    if (!existing.contact_id || existing.contact_id !== input.contactId) {
      updates.contact_id = input.contactId
    }

    if (input.customerName && existing.customer_name !== input.customerName) {
      updates.customer_name = input.customerName
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update(updates)
        .eq("id", existing.id)
    }

    return existing
  }

  const { data: insertedData, error: insertError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      account_id: input.accountId,
      contact_id: input.contactId,
      customer_wa_id: input.customerWaId,
      customer_name: input.customerName,
      status: "PENDING_BRAND",
      unread_count: 0,
      last_message_at: new Date().toISOString(),
      window_expires_at: new Date(Date.now() + WINDOW_DURATION_MS).toISOString(),
    })
    .select("id, account_id, contact_id, customer_wa_id, customer_name, status, unread_count")
    .single()

  if (insertError || !insertedData) {
    throw new Error(insertError?.message ?? "Falha ao criar conversa WhatsApp")
  }

  return insertedData as ConversationRow
}

async function hasInboundMessageDuplicate(waMessageId: string | null, dedupeHash: string | null) {
  const supabaseAdmin = createSupabaseServiceClient()

  if (waMessageId) {
    const { data } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .limit(1)
      .maybeSingle()

    if (data) return true
  }

  if (dedupeHash) {
    const { data } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("direction", "INBOUND")
      .eq("dedupe_hash", dedupeHash)
      .limit(1)
      .maybeSingle()

    if (data) return true
  }

  return false
}

async function createInboundMessage(input: {
  conversation: ConversationRow
  rawMessage: NonNullable<
    NonNullable<
      NonNullable<NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]>[number]["value"]
    >["messages"]
  >[number]
}) {
  const supabaseAdmin = createSupabaseServiceClient()
  const waMessageId = input.rawMessage.id || null
  const dedupeHash = waMessageId
    ? null
    : createHash("sha256")
        .update(JSON.stringify(input.rawMessage))
        .digest("hex")

  const alreadyExists = await hasInboundMessageDuplicate(waMessageId, dedupeHash)
  if (alreadyExists) {
    return false
  }

  const nowIso = new Date().toISOString()
  const messageType = mapInboundMessageType(input.rawMessage.type)
  const bodyText = extractInboundMessageText(input.rawMessage)

  const { error: insertError } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: input.conversation.id,
      direction: "INBOUND",
      wa_message_id: waMessageId,
      dedupe_hash: dedupeHash,
      message_type: messageType,
      body_text: bodyText,
      status: "received",
      raw_payload: input.rawMessage,
      created_at: nowIso,
    })

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return false
    }

    throw new Error(insertError.message)
  }

  const nextUnreadCount = (input.conversation.unread_count ?? 0) + 1

  const { error: updateConversationError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .update({
      unread_count: nextUnreadCount,
      last_message_at: nowIso,
      window_expires_at: new Date(Date.now() + WINDOW_DURATION_MS).toISOString(),
    })
    .eq("id", input.conversation.id)

  if (updateConversationError) {
    console.error("whatsapp_webhook_conversation_update_failed", {
      conversation_id: input.conversation.id,
      error: updateConversationError.message,
    })
  }

  return true
}

async function processInboundMessage(params: {
  accountId: string
  customerWaId: string
  customerName: string | null
  rawMessage: NonNullable<
    NonNullable<
      NonNullable<NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]>[number]["value"]
    >["messages"]
  >[number]
}) {
  const contactId = await findOrCreateContact(params.customerWaId, params.customerName, {
    source: "whatsapp_webhook",
    profile_name: params.customerName,
    wa_id: params.customerWaId,
  })

  const conversation = await findOrCreateConversation({
    accountId: params.accountId,
    contactId,
    customerWaId: params.customerWaId,
    customerName: params.customerName,
  })

  await createInboundMessage({
    conversation,
    rawMessage: params.rawMessage,
  })
}

async function processStatusUpdate(status: NonNullable<
  NonNullable<
    NonNullable<NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]>[number]["value"]
  >["statuses"]
>[number]) {
  const supabaseAdmin = createSupabaseServiceClient()

  const waMessageId = status.id || null
  const mappedStatus = statusToMessageStatus(status.status)
  if (!waMessageId || !mappedStatus) return

  const statusTimestamp = toIsoTimestamp(status.timestamp)

  const updates: Record<string, unknown> = {
    status: mappedStatus,
    raw_payload: status,
  }

  if (mappedStatus === "sent") {
    updates.sent_at = statusTimestamp || new Date().toISOString()
  }

  if (mappedStatus === "delivered") {
    updates.delivered_at = statusTimestamp || new Date().toISOString()
  }

  if (mappedStatus === "read") {
    updates.read_at = statusTimestamp || new Date().toISOString()
  }

  if (mappedStatus === "failed") {
    updates.failed_at = statusTimestamp || new Date().toISOString()
    updates.error_message = status.errors?.[0]?.message || status.errors?.[0]?.title || "Falha no envio"
  }

  const { data: updatedMessageData, error: updateMessageError } = await supabaseAdmin
    .from("whatsapp_messages")
    .update(updates)
    .eq("wa_message_id", waMessageId)
    .eq("direction", "OUTBOUND")
    .select("id, conversation_id")
    .maybeSingle()

  if (updateMessageError) {
    console.error("whatsapp_webhook_status_update_failed", {
      wa_message_id: waMessageId,
      status: mappedStatus,
      error: updateMessageError.message,
    })
    return
  }

  if (!updatedMessageData) return

  const expirationTimestamp = status.conversation?.expiration_timestamp
  const expirationDate = toIsoTimestamp(expirationTimestamp)

  if (expirationDate) {
    const { error: conversationUpdateError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ window_expires_at: expirationDate })
      .eq("id", (updatedMessageData as { conversation_id: string }).conversation_id)

    if (conversationUpdateError) {
      console.error("whatsapp_webhook_window_update_failed", {
        wa_message_id: waMessageId,
        conversation_id: (updatedMessageData as { conversation_id: string }).conversation_id,
        error: conversationUpdateError.message,
      })
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const verifyToken = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const expectedVerifyToken = getVerifyToken()

  if (!expectedVerifyToken) {
    return NextResponse.json(
      { error: "WHATSAPP_WEBHOOK_VERIFY_TOKEN nao configurado" },
      { status: 500 }
    )
  }

  if (mode === "subscribe" && verifyToken === expectedVerifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader =
    request.headers.get("x-hub-signature-256") || request.headers.get("X-Hub-Signature-256")

  if (!verifyWhatsAppWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 })
  }

  let payload: WhatsAppWebhookPayload

  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  if (!isWhatsAppInboxEnabled()) {
    return NextResponse.json({ ok: true, ignored: true, reason: "inbox_disabled" }, { status: 202 })
  }

  if (!payload.entry || payload.entry.length === 0) {
    return NextResponse.json({ ok: true, ignored: true, reason: "empty_entry" })
  }

  let processedMessages = 0
  let processedStatuses = 0

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue
      }

      const value = change.value
      if (!value) continue

      const metadata = value.metadata
      const phoneNumberId = metadata?.phone_number_id || getDefaultPhoneNumberId()
      const wabaId = entry.id || getDefaultWabaId()

      if (!phoneNumberId || !wabaId) {
        console.error("whatsapp_webhook_missing_account_data", {
          phone_number_id: metadata?.phone_number_id,
          entry_id: entry.id,
        })
        continue
      }

      let accountId: string

      try {
        accountId = await ensureAccount({
          phoneNumberId,
          wabaId,
          displayPhoneNumber: metadata?.display_phone_number || null,
        })
      } catch (error) {
        console.error("whatsapp_webhook_account_upsert_failed", {
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          error: error instanceof Error ? error.message : "unknown",
        })
        continue
      }

      const contactNamesByWaId = new Map<string, string>()

      for (const contact of value.contacts ?? []) {
        const waId = normalizeWhatsAppIdentifier(contact.wa_id)
        if (!waId) continue
        const profileName = contact.profile?.name?.trim()
        if (profileName) {
          contactNamesByWaId.set(waId, profileName)
        }
      }

      for (const message of value.messages ?? []) {
        const customerWaId = normalizeWhatsAppIdentifier(message.from)

        if (!customerWaId) {
          continue
        }

        try {
          await processInboundMessage({
            accountId,
            customerWaId,
            customerName: contactNamesByWaId.get(customerWaId) || null,
            rawMessage: message,
          })

          processedMessages += 1
        } catch (error) {
          console.error("whatsapp_webhook_inbound_process_failed", {
            account_id: accountId,
            wa_message_id: message.id,
            customer_wa_id: customerWaId,
            phone_number_id: phoneNumberId,
            error: error instanceof Error ? error.message : "unknown",
          })
        }
      }

      for (const status of value.statuses ?? []) {
        try {
          await processStatusUpdate(status)
          processedStatuses += 1
        } catch (error) {
          console.error("whatsapp_webhook_status_process_failed", {
            status_id: status.id,
            status: status.status,
            phone_number_id: phoneNumberId,
            error: error instanceof Error ? error.message : "unknown",
          })
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed_messages: processedMessages,
    processed_statuses: processedStatuses,
  })
}
