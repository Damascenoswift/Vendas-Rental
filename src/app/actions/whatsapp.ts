"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth"
import {
  getWhatsAppProvider,
  isWhatsAppInboxEnabled,
  normalizeWhatsAppIdentifier,
  sendWhatsAppMediaMessage as sendWhatsAppCloudMediaMessage,
  sendWhatsAppTextMessage as sendWhatsAppCloudTextMessage,
  type SendMessageResult,
  type WhatsAppBrand,
  type WhatsAppConversationStatus,
  type WhatsAppMessageDirection,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/lib/integrations/whatsapp"
import {
  sendZApiAudioMessage,
  sendZApiDocumentMessage,
  sendZApiImageMessage,
  sendZApiTextMessage,
} from "@/lib/integrations/whatsapp-zapi"
import {
  WHATSAPP_OUTBOUND_MEDIA_BUCKET,
  formatOutboundMediaBodyText,
  isWhatsAppOutboundMediaType,
  type WhatsAppOutboundMediaType,
} from "@/lib/whatsapp-media"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { hasWhatsAppInboxAccess } from "@/lib/whatsapp-inbox-access"
import { dispatchNotificationEvent } from "@/services/notification-service"

const SEND_RATE_LIMIT_PER_MINUTE = 20
const MESSAGE_PAGE_SIZE_DEFAULT = 100
const MESSAGE_PAGE_SIZE_MAX = 200
const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000
const WHATSAPP_RESTRICTION_ADMIN_ROLES = new Set(["adm_mestre", "adm_dorata"])
const RESTRICTION_SCHEMA_HINT =
  "Execute a migration 113 (whatsapp_conversation_restrictions) no Supabase para habilitar conversas restritas."

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
  missingContactOnly?: boolean
}

export type WhatsAppConversationListItem = {
  id: string
  account_id: string
  account_phone_number_id: string
  account_display_phone_number: string | null
  contact_id: string | null
  has_contact_link: boolean
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
  is_restricted: boolean
}

export type WhatsAppMessage = {
  id: string
  conversation_id: string
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  message_type: WhatsAppMessageType
  body_text: string | null
  media_url: string | null
  media_file_name: string | null
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

export type WhatsAppConversationRestrictionSettings = {
  conversation_id: string
  is_restricted: boolean
  allowed_user_ids: string[]
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
  is_restricted: boolean
}

type MessageRow = {
  id: string
  conversation_id: string
  direction: WhatsAppMessageDirection
  wa_message_id: string | null
  message_type: WhatsAppMessageType
  body_text: string | null
  raw_payload?: Record<string, unknown> | null
  status: WhatsAppMessageStatus
  sender_user_id: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
}

type ResolvedMessageMedia = {
  url: string
  fileName: string | null
}

type EnsuredConversationContact = {
  contactId: string
  contactName: string
  contactWhatsapp: string | null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toStringOrNull(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function extractDirectMediaFromRawPayload(
  rawPayload: Record<string, unknown> | null,
  messageType: WhatsAppMessageType
): ResolvedMessageMedia | null {
  if (!rawPayload) return null

  if (messageType === "audio") {
    const audio = toRecord(rawPayload.audio)
    const url = toStringOrNull(audio?.audioUrl)
    return url ? { url, fileName: null } : null
  }

  if (messageType === "image") {
    const image = toRecord(rawPayload.image)
    const url = toStringOrNull(image?.imageUrl)
    return url ? { url, fileName: null } : null
  }

  if (messageType === "document") {
    const document = toRecord(rawPayload.document)
    const url = toStringOrNull(document?.documentUrl)
    if (!url) return null
    const fileName = toStringOrNull(document?.fileName) || toStringOrNull(document?.title)
    return { url, fileName }
  }

  return null
}

function extractOutboundStoredMedia(rawPayload: Record<string, unknown> | null) {
  if (!rawPayload) return null
  const outboundMedia = toRecord(rawPayload.outbound_media)
  if (!outboundMedia) return null

  const bucket = toStringOrNull(outboundMedia.storage_bucket)
  const path = toStringOrNull(outboundMedia.storage_path)
  if (!path) return null

  return {
    bucket: bucket || WHATSAPP_OUTBOUND_MEDIA_BUCKET,
    path,
    fileName: toStringOrNull(outboundMedia.file_name),
  }
}

async function resolveMessageMedia(
  row: MessageRow,
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
): Promise<ResolvedMessageMedia | null> {
  if (
    row.message_type !== "audio" &&
    row.message_type !== "image" &&
    row.message_type !== "document"
  ) {
    return null
  }

  const rawPayload = toRecord(row.raw_payload)
  const storedMedia = extractOutboundStoredMedia(rawPayload)

  if (storedMedia) {
    const { data, error } = await supabaseAdmin.storage
      .from(storedMedia.bucket)
      .createSignedUrl(storedMedia.path, 60 * 30)

    if (!error && data?.signedUrl) {
      return {
        url: data.signedUrl,
        fileName: storedMedia.fileName,
      }
    }
  }

  return extractDirectMediaFromRawPayload(rawPayload, row.message_type)
}

function chunkArray<T>(items: T[], chunkSize: number) {
  if (chunkSize <= 0) return [items]
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

type ContactSearchRow = {
  id: string
  full_name: string | null
  whatsapp: string | null
  whatsapp_normalized: string | null
}

type WhatsAppAccessContext = {
  user: {
    id: string
    email?: string | null
  }
  profile: Awaited<ReturnType<typeof getProfile>>
  isRestrictionAdmin: boolean
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

function normalizeContactFullName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function extractFirstName(fullName: string) {
  const [firstName] = fullName.split(" ")
  return firstName || fullName
}

function ensureValidBrand(value: string): value is WhatsAppBrand {
  return (
    value === "rental" ||
    value === "dorata" ||
    value === "funcionario" ||
    value === "diversos"
  )
}

function ensureValidStatus(value: string): value is WhatsAppConversationStatus {
  return value === "PENDING_BRAND" || value === "OPEN" || value === "CLOSED"
}

function isMissingColumnError(error: { message?: string } | null, columnName: string) {
  const message = error?.message ?? ""
  const escapedColumn = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const columnRegex = new RegExp(`could not find the '${escapedColumn}' column`, "i")
  return columnRegex.test(message)
}

function isMissingRelationError(error: { message?: string } | null, relationName: string) {
  const message = error?.message ?? ""
  const escapedName = relationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const relationRegex = new RegExp(`relation .*${escapedName}.* does not exist`, "i")
  return relationRegex.test(message)
}

function isWhatsAppRestrictionAdminRole(role?: string | null) {
  return WHATSAPP_RESTRICTION_ADMIN_ROLES.has((role ?? "").trim())
}

function toConversationRow(row: Record<string, unknown>): ConversationRow {
  return {
    id: String(row.id),
    account_id: String(row.account_id),
    contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
    customer_wa_id: String(row.customer_wa_id),
    customer_name: typeof row.customer_name === "string" ? row.customer_name : null,
    brand: (row.brand as WhatsAppBrand | null) ?? null,
    assigned_user_id: typeof row.assigned_user_id === "string" ? row.assigned_user_id : null,
    status: row.status as WhatsAppConversationStatus,
    window_expires_at: typeof row.window_expires_at === "string" ? row.window_expires_at : null,
    unread_count:
      typeof row.unread_count === "number"
        ? row.unread_count
        : Number.isFinite(Number(row.unread_count))
          ? Number(row.unread_count)
          : 0,
    last_message_at: String(row.last_message_at),
    updated_at: String(row.updated_at),
    is_restricted: Boolean(row.is_restricted),
  }
}

async function hasConversationExplicitAccess(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  conversationId: string
  userId: string
}) {
  const { data, error } = await params.supabaseAdmin
    .from("whatsapp_conversation_access")
    .select("conversation_id")
    .eq("conversation_id", params.conversationId)
    .eq("user_id", params.userId)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, "whatsapp_conversation_access")) {
      return false
    }
    throw new WhatsAppActionError(error.message)
  }

  return Boolean(data)
}

async function ensureConversationVisible(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  conversation: ConversationRow
  accessContext: Pick<WhatsAppAccessContext, "user" | "isRestrictionAdmin">
}) {
  const { conversation, accessContext } = params

  if (!conversation.is_restricted) {
    return
  }

  if (accessContext.isRestrictionAdmin) {
    return
  }

  if (conversation.assigned_user_id === accessContext.user.id) {
    return
  }

  const hasExplicitAccess = await hasConversationExplicitAccess({
    supabaseAdmin: params.supabaseAdmin,
    conversationId: conversation.id,
    userId: accessContext.user.id,
  })

  if (hasExplicitAccess) {
    return
  }

  throw new WhatsAppActionError("Conversa restrita. Você não tem permissão para visualizar esta conversa.")
}

async function filterConversationsByVisibility(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  conversations: ConversationRow[]
  accessContext: Pick<WhatsAppAccessContext, "user" | "isRestrictionAdmin">
}) {
  const { conversations, accessContext } = params

  if (accessContext.isRestrictionAdmin) {
    return conversations
  }

  const restrictedToCheck = conversations.filter(
    (conversation) => conversation.is_restricted && conversation.assigned_user_id !== accessContext.user.id
  )

  if (restrictedToCheck.length === 0) {
    return conversations
  }

  const restrictedIds = restrictedToCheck.map((conversation) => conversation.id)
  const { data, error } = await params.supabaseAdmin
    .from("whatsapp_conversation_access")
    .select("conversation_id")
    .eq("user_id", accessContext.user.id)
    .in("conversation_id", restrictedIds)

  if (error) {
    if (isMissingRelationError(error, "whatsapp_conversation_access")) {
      return conversations.filter(
        (conversation) => !conversation.is_restricted || conversation.assigned_user_id === accessContext.user.id
      )
    }
    throw new WhatsAppActionError(error.message)
  }

  const allowedConversationIds = new Set(
    (data ?? []).map((row: { conversation_id: string }) => row.conversation_id)
  )

  return conversations.filter((conversation) => {
    if (!conversation.is_restricted) return true
    if (conversation.assigned_user_id === accessContext.user.id) return true
    return allowedConversationIds.has(conversation.id)
  })
}

async function ensureRestrictionSchemaAvailable(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
) {
  const { error: conversationColumnError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("is_restricted")
    .limit(1)

  if (conversationColumnError && isMissingColumnError(conversationColumnError, "is_restricted")) {
    throw new WhatsAppActionError(
      `Campo de restrição ainda não disponível no banco. ${RESTRICTION_SCHEMA_HINT}`
    )
  }

  if (conversationColumnError) {
    throw new WhatsAppActionError(conversationColumnError.message)
  }

  const { error: accessTableError } = await supabaseAdmin
    .from("whatsapp_conversation_access")
    .select("conversation_id")
    .limit(1)

  if (accessTableError && isMissingRelationError(accessTableError, "whatsapp_conversation_access")) {
    throw new WhatsAppActionError(
      `Tabela de acesso restrito ainda não disponível no banco. ${RESTRICTION_SCHEMA_HINT}`
    )
  }

  if (accessTableError && isMissingColumnError(accessTableError, "conversation_id")) {
    throw new WhatsAppActionError(
      `Tabela de acesso restrito incompleta no banco. ${RESTRICTION_SCHEMA_HINT}`
    )
  }

  if (accessTableError) {
    throw new WhatsAppActionError(accessTableError.message)
  }
}

function mapSendResultToMessageStatus(sendResult: SendMessageResult): WhatsAppMessageStatus {
  if (!sendResult.success) return "failed"
  return "sent"
}

function mapMessageRowToModel(row: MessageRow): WhatsAppMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    wa_message_id: row.wa_message_id,
    message_type: row.message_type,
    body_text: row.body_text,
    media_url: null,
    media_file_name: null,
    status: row.status,
    sender_user_id: row.sender_user_id,
    sender_user_name: null,
    error_message: row.error_message,
    created_at: row.created_at,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    read_at: row.read_at,
    failed_at: row.failed_at,
  }
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

async function sendWhatsAppMediaByConfiguredProvider(input: {
  to: string
  mediaType: WhatsAppOutboundMediaType
  mediaUrl: string
  caption?: string | null
  fileName?: string | null
  phoneNumberId: string
}): Promise<SendMessageResult> {
  const provider = getWhatsAppProvider()

  if (provider === "z_api") {
    if (input.mediaType === "image") {
      return sendZApiImageMessage({
        to: input.to,
        imageUrl: input.mediaUrl,
        caption: input.caption,
      })
    }

    if (input.mediaType === "document") {
      return sendZApiDocumentMessage({
        to: input.to,
        documentUrl: input.mediaUrl,
        fileName: input.fileName,
        caption: input.caption,
      })
    }

    return sendZApiAudioMessage({
      to: input.to,
      audioUrl: input.mediaUrl,
    })
  }

  return sendWhatsAppCloudMediaMessage({
    to: input.to,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl,
    caption: input.caption,
    fileName: input.fileName,
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
    isRestrictionAdmin: isWhatsAppRestrictionAdminRole(role),
  }
}

async function fetchConversationById(
  conversationId: string,
  accessContext?: Pick<WhatsAppAccessContext, "user" | "isRestrictionAdmin">
) {
  const supabaseAdmin = createSupabaseServiceClient()

  let { data, error } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select(
      "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at, is_restricted"
    )
    .eq("id", conversationId)
    .maybeSingle()

  if (error && isMissingColumnError(error, "is_restricted")) {
    const fallback = await supabaseAdmin
      .from("whatsapp_conversations")
      .select(
        "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at"
      )
      .eq("id", conversationId)
      .maybeSingle()

    data = fallback.data as typeof data
    error = fallback.error as typeof error
  }

  if (error) {
    throw new WhatsAppActionError(error.message)
  }

  if (!data) {
    throw new WhatsAppActionError("Conversa não encontrada.")
  }

  const conversation = toConversationRow(data as Record<string, unknown>)

  if (accessContext) {
    await ensureConversationVisible({
      supabaseAdmin,
      conversation,
      accessContext,
    })
  }

  return conversation
}

async function ensureConversationContactLink(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  conversation: ConversationRow
  preferredName?: string | null
}) {
  const { supabaseAdmin, conversation } = params
  const normalizedCustomerWa = normalizeWhatsAppIdentifier(conversation.customer_wa_id)
  const fallbackWhatsapp = normalizedCustomerWa || conversation.customer_wa_id.trim() || null
  const preferredName = params.preferredName ? normalizeContactFullName(params.preferredName) : null

  let contactRow: {
    id: string
    full_name: string | null
    whatsapp: string | null
    whatsapp_normalized: string | null
  } | null = null

  if (conversation.contact_id) {
    const { data: existingContactData, error: existingContactError } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, whatsapp, whatsapp_normalized")
      .eq("id", conversation.contact_id)
      .maybeSingle()

    if (existingContactError) {
      throw new WhatsAppActionError(existingContactError.message)
    }

    contactRow = (existingContactData as typeof contactRow) ?? null
  }

  if (!contactRow && normalizedCustomerWa) {
    const { data: matchedContactsData, error: matchedContactsError } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, whatsapp, whatsapp_normalized")
      .or(`whatsapp_normalized.eq.${normalizedCustomerWa},whatsapp.eq.${normalizedCustomerWa}`)
      .order("updated_at", { ascending: false })
      .limit(1)

    if (matchedContactsError) {
      throw new WhatsAppActionError(matchedContactsError.message)
    }

    contactRow = ((matchedContactsData ?? [])[0] as typeof contactRow) ?? null
  }

  const nextContactName =
    preferredName ||
    contactRow?.full_name?.trim() ||
    conversation.customer_name?.trim() ||
    `Contato ${fallbackWhatsapp || "WhatsApp"}`

  if (contactRow) {
    const updates: Record<string, unknown> = {}

    if (nextContactName && contactRow.full_name !== nextContactName) {
      updates.full_name = nextContactName
      updates.first_name = extractFirstName(nextContactName)
    }

    if (fallbackWhatsapp && !contactRow.whatsapp) {
      updates.whatsapp = fallbackWhatsapp
    }

    if (normalizedCustomerWa && contactRow.whatsapp_normalized !== normalizedCustomerWa) {
      updates.whatsapp_normalized = normalizedCustomerWa
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateContactError } = await supabaseAdmin
        .from("contacts")
        .update(updates)
        .eq("id", contactRow.id)

      if (updateContactError) {
        throw new WhatsAppActionError(updateContactError.message)
      }
    }
  } else {
    const contactPayload: Record<string, unknown> = {
      source: "whatsapp_inbox",
      full_name: nextContactName,
      first_name: extractFirstName(nextContactName),
    }

    if (fallbackWhatsapp) {
      contactPayload.whatsapp = fallbackWhatsapp
    }

    if (normalizedCustomerWa) {
      contactPayload.whatsapp_normalized = normalizedCustomerWa
    }

    const { data: insertedContactData, error: insertContactError } = await supabaseAdmin
      .from("contacts")
      .insert(contactPayload)
      .select("id, full_name, whatsapp, whatsapp_normalized")
      .single()

    if (insertContactError || !insertedContactData) {
      throw new WhatsAppActionError(
        insertContactError?.message ?? "Não foi possível criar o contato para esta conversa."
      )
    }

    contactRow = insertedContactData as typeof contactRow
  }

  const conversationUpdates: Record<string, unknown> = {}
  if (conversation.contact_id !== contactRow.id) {
    conversationUpdates.contact_id = contactRow.id
  }

  if (preferredName && conversation.customer_name !== preferredName) {
    conversationUpdates.customer_name = preferredName
  } else if (!conversation.customer_name && nextContactName) {
    conversationUpdates.customer_name = nextContactName
  }

  if (Object.keys(conversationUpdates).length > 0) {
    const { error: updateConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update(conversationUpdates)
      .eq("id", conversation.id)

    if (updateConversationError) {
      throw new WhatsAppActionError(updateConversationError.message)
    }
  }

  return {
    contactId: contactRow.id,
    contactName: nextContactName,
    contactWhatsapp: contactRow.whatsapp || contactRow.whatsapp_normalized || fallbackWhatsapp,
  } satisfies EnsuredConversationContact
}

async function removeConversationOutboundMedia(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
  conversationId: string
}) {
  const { supabaseAdmin, conversationId } = params
  const { data: messagesData, error: messagesError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("id, raw_payload")
    .eq("conversation_id", conversationId)
    .eq("direction", "OUTBOUND")
    .in("message_type", ["image", "document", "audio"])

  if (messagesError) {
    throw new WhatsAppActionError(messagesError.message)
  }

  const pathsByBucket = new Map<string, Set<string>>()

  for (const row of (messagesData ?? []) as Array<{ raw_payload?: Record<string, unknown> | null }>) {
    const rawPayload = toRecord(row.raw_payload)
    const storedMedia = extractOutboundStoredMedia(rawPayload)
    if (!storedMedia?.path) continue

    const bucket = storedMedia.bucket || WHATSAPP_OUTBOUND_MEDIA_BUCKET
    const bucketPaths = pathsByBucket.get(bucket) ?? new Set<string>()
    bucketPaths.add(storedMedia.path)
    pathsByBucket.set(bucket, bucketPaths)
  }

  for (const [bucket, pathsSet] of pathsByBucket.entries()) {
    const paths = Array.from(pathsSet)
    for (const chunk of chunkArray(paths, 100)) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk)

      if (error) {
        console.error("whatsapp_conversation_media_cleanup_failed", {
          conversation_id: conversationId,
          bucket,
          total_paths: chunk.length,
          error: error.message,
        })
      }
    }
  }
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

async function notifyWhatsAppConversationTransfer(input: {
  conversationId: string
  customerWaId: string
  customerName: string | null
  actorUserId: string
  actorName: string
  previousAssignedUserId: string | null
  nextAssignedUserId: string
}) {
  if (input.previousAssignedUserId === input.nextAssignedUserId) {
    return
  }

  const contactLabel = input.customerName?.trim() || input.customerWaId
  const message = `${input.actorName} transferiu o contato ${contactLabel} para o seu atendimento no WhatsApp.`

  await dispatchNotificationEvent({
    domain: "SYSTEM",
    eventKey: "SYSTEM_GENERIC",
    actorUserId: input.actorUserId,
    entityType: "CHAT_CONVERSATION",
    entityId: input.conversationId,
    title: "Conversa WhatsApp transferida para você",
    message,
    metadata: {
      conversation_id: input.conversationId,
      customer_wa_id: input.customerWaId,
      customer_name: input.customerName,
      previous_assigned_user_id: input.previousAssignedUserId,
      next_assigned_user_id: input.nextAssignedUserId,
      target_path: "/admin/whatsapp",
    },
    recipients: [
      {
        userId: input.nextAssignedUserId,
        responsibilityKind: "DIRECT",
        isMandatory: true,
      },
    ],
    dedupeKey: `whatsapp_transfer:${input.conversationId}:${input.previousAssignedUserId ?? "none"}:${input.nextAssignedUserId}`,
    isMandatory: true,
    targetPath: "/admin/whatsapp",
    revalidatePaths: ["/admin/whatsapp"],
  })
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
    const accessContext = await requireWhatsAppAccess()

    const supabaseAdmin = createSupabaseServiceClient()

    const buildConversationQuery = (includeRestrictedColumn: boolean) => {
      let query = supabaseAdmin
        .from("whatsapp_conversations")
        .select(
          includeRestrictedColumn
            ? "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at, is_restricted"
            : "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at"
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

      return query
    }

    let { data: conversationsData, error: conversationsError } = await buildConversationQuery(true)

    if (conversationsError && isMissingColumnError(conversationsError, "is_restricted")) {
      const fallback = await buildConversationQuery(false)
      conversationsData = fallback.data as typeof conversationsData
      conversationsError = fallback.error as typeof conversationsError
    }

    if (conversationsError) {
      throw new WhatsAppActionError(conversationsError.message)
    }

    const conversationRows = (conversationsData ?? []).map((row) =>
      toConversationRow(row as Record<string, unknown>)
    )
    const conversations = await filterConversationsByVisibility({
      supabaseAdmin,
      conversations: conversationRows,
      accessContext,
    })

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
      (
        (contactsResult.data ?? []) as Array<{
          id: string
          full_name: string | null
          whatsapp: string | null
          whatsapp_normalized: string | null
        }>
      ).map((row) => [
        row.id,
        {
          full_name: row.full_name,
          whatsapp: row.whatsapp || row.whatsapp_normalized,
        },
      ])
    )

    const usersById = new Map(
      ((usersResult.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
        row.id,
        row.name,
      ])
    )

    const accountsById = new Map(
      (
        (accountsResult.data ?? []) as Array<{
          id: string
          phone_number_id: string
          display_phone_number: string | null
        }>
      ).map((row) => [
        row.id,
        {
          phone_number_id: row.phone_number_id,
          display_phone_number: row.display_phone_number,
        },
      ])
    )

    const items = conversations.map((conversation) => {
      const contact = conversation.contact_id ? contactsById.get(conversation.contact_id) : null
      const account = accountsById.get(conversation.account_id)
      const hasContactLink = Boolean(conversation.contact_id && contact)

      return {
        id: conversation.id,
        account_id: conversation.account_id,
        account_phone_number_id: account?.phone_number_id ?? "",
        account_display_phone_number: account?.display_phone_number ?? null,
        contact_id: conversation.contact_id,
        has_contact_link: hasContactLink,
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
        is_restricted: conversation.is_restricted,
      } satisfies WhatsAppConversationListItem
    })

    const filteredItems = filters.missingContactOnly
      ? items.filter((item) => !item.has_contact_link)
      : items

    return { success: true, data: filteredItems }
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
    const accessContext = await requireWhatsAppAccess()

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)
    const requestedLimit = Number.isFinite(options.limit) ? Number(options.limit) : MESSAGE_PAGE_SIZE_DEFAULT
    const pageLimit = Math.min(MESSAGE_PAGE_SIZE_MAX, Math.max(1, Math.floor(requestedLimit)))
    const beforeCursor = options.before?.trim() || null

    let messageQuery = supabaseAdmin
      .from("whatsapp_messages")
      .select(
        "id, conversation_id, direction, wa_message_id, message_type, body_text, raw_payload, status, sender_user_id, error_message, created_at, sent_at, delivered_at, read_at, failed_at"
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

    const messages = await Promise.all(
      messageRows.map(async (row) => {
        const media = await resolveMessageMedia(row, supabaseAdmin)

        return {
          id: row.id,
          conversation_id: row.conversation_id,
          direction: row.direction,
          wa_message_id: row.wa_message_id,
          message_type: row.message_type,
          body_text: row.body_text,
          media_url: media?.url ?? null,
          media_file_name: media?.fileName ?? null,
          status: row.status,
          sender_user_id: row.sender_user_id,
          sender_user_name: row.sender_user_id ? sendersById.get(row.sender_user_id) ?? null : null,
          error_message: row.error_message,
          created_at: row.created_at,
          sent_at: row.sent_at,
          delivered_at: row.delivered_at,
          read_at: row.read_at,
          failed_at: row.failed_at,
        } satisfies WhatsAppMessage
      })
    )

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
      .select("id, contact_id, customer_name, brand, status")
      .eq("account_id", accountId)
      .eq("customer_wa_id", customerWaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingConversationError) {
      throw new WhatsAppActionError(existingConversationError.message)
    }

    if (existingConversationData) {
      const existingConversation = existingConversationData as {
        id: string
        contact_id: string | null
        customer_name: string | null
        brand: WhatsAppBrand | null
        status: WhatsAppConversationStatus
      }

      const updates: Record<string, unknown> = {}

      if (!existingConversation.contact_id || existingConversation.contact_id !== contact.id) {
        updates.contact_id = contact.id
      }

      if (contact.full_name && existingConversation.customer_name !== contact.full_name) {
        updates.customer_name = contact.full_name
      }

      if (existingConversation.status === "CLOSED") {
        updates.status = existingConversation.brand ? "OPEN" : "PENDING_BRAND"
        if (provider === "z_api") {
          updates.window_expires_at = new Date(Date.now() + WINDOW_DURATION_MS).toISOString()
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateExistingError } = await supabaseAdmin
          .from("whatsapp_conversations")
          .update(updates)
          .eq("id", existingConversation.id)

        if (updateExistingError) {
          throw new WhatsAppActionError(updateExistingError.message)
        }
      }

      revalidatePath("/admin/whatsapp")

      return {
        success: true,
        data: {
          conversation_id: existingConversation.id,
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

    if (insertConversationError && (insertConversationError as { code?: string }).code === "23505") {
      const { data: conflictConversationData, error: conflictConversationError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("account_id", accountId)
        .eq("customer_wa_id", customerWaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (conflictConversationError) {
        throw new WhatsAppActionError(conflictConversationError.message)
      }

      if (conflictConversationData) {
        revalidatePath("/admin/whatsapp")
        return {
          success: true,
          data: {
            conversation_id: (conflictConversationData as { id: string }).id,
          },
        }
      }
    }

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

export async function updateWhatsAppConversationContactName(
  conversationId: string,
  rawName: string
): Promise<
  ActionResult<{
    conversation_id: string
    contact_id: string | null
    customer_name: string
  }>
> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)
    const fullName = normalizeContactFullName(rawName)

    if (!fullName) {
      throw new WhatsAppActionError("Informe um nome válido para o contato.")
    }

    const ensuredContact = await ensureConversationContactLink({
      supabaseAdmin,
      conversation,
      preferredName: fullName,
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: {
        conversation_id: conversationId,
        contact_id: ensuredContact.contactId,
        customer_name: fullName,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao editar contato da conversa.",
    }
  }
}

export async function ensureWhatsAppConversationContact(
  conversationId: string
): Promise<
  ActionResult<{
    conversation_id: string
    contact_id: string
    contact_name: string
    contact_whatsapp: string | null
  }>
> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

    const ensuredContact = await ensureConversationContactLink({
      supabaseAdmin,
      conversation,
    })

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: {
        conversation_id: conversationId,
        contact_id: ensuredContact.contactId,
        contact_name: ensuredContact.contactName,
        contact_whatsapp: ensuredContact.contactWhatsapp,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao vincular contato da conversa.",
    }
  }
}

export async function syncWhatsAppConversationContacts(
  input: {
    onlyMissing?: boolean
    limit?: number
  } = {}
): Promise<
  ActionResult<{
    processed: number
    linked: number
    failed: number
  }>
> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const supabaseAdmin = createSupabaseServiceClient()
    const onlyMissing = input.onlyMissing !== false
    const requestedLimit = Number.isFinite(input.limit) ? Number(input.limit) : 250
    const queryLimit = Math.min(500, Math.max(1, Math.floor(requestedLimit)))

    const buildConversationQuery = (includeRestrictedColumn: boolean) => {
      let query = supabaseAdmin
        .from("whatsapp_conversations")
        .select(
          includeRestrictedColumn
            ? "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at, is_restricted"
            : "id, account_id, contact_id, customer_wa_id, customer_name, brand, assigned_user_id, status, window_expires_at, unread_count, last_message_at, updated_at"
        )
        .order("last_message_at", { ascending: false })
        .limit(queryLimit)

      if (onlyMissing) {
        query = query.is("contact_id", null)
      }

      return query
    }

    let { data, error } = await buildConversationQuery(true)

    if (error && isMissingColumnError(error, "is_restricted")) {
      const fallback = await buildConversationQuery(false)
      data = fallback.data as typeof data
      error = fallback.error as typeof error
    }

    if (error) {
      throw new WhatsAppActionError(error.message)
    }

    const conversationRows = (data ?? []).map((row) => toConversationRow(row as Record<string, unknown>))
    const visibleConversations = await filterConversationsByVisibility({
      supabaseAdmin,
      conversations: conversationRows,
      accessContext,
    })

    let processed = 0
    let linked = 0
    let failed = 0

    for (const conversation of visibleConversations) {
      processed += 1

      try {
        await ensureConversationContactLink({
          supabaseAdmin,
          conversation,
        })
        linked += 1
      } catch (error) {
        failed += 1
        console.error("whatsapp_conversation_contact_sync_failed", {
          conversation_id: conversation.id,
          error: error instanceof Error ? error.message : "unknown",
        })
      }
    }

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: {
        processed,
        linked,
        failed,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao sincronizar contatos das conversas.",
    }
  }
}

export async function assignWhatsAppConversation(
  conversationId: string,
  userId: string | null
): Promise<ActionResult<{ id: string; assigned_user_id: string | null }>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const { user } = accessContext
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

    if (conversation.assigned_user_id === userId) {
      return {
        success: true,
        data: { id: conversationId, assigned_user_id: userId },
      }
    }

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

    if (userId) {
      const actorName = buildWhatsAppAgentDisplayName({
        name: accessContext.profile?.name,
        email: user.email,
      })

      try {
        await notifyWhatsAppConversationTransfer({
          conversationId,
          customerWaId: conversation.customer_wa_id,
          customerName: conversation.customer_name,
          actorUserId: user.id,
          actorName,
          previousAssignedUserId: conversation.assigned_user_id,
          nextAssignedUserId: userId,
        })
      } catch (notificationError) {
        console.error("whatsapp_assignment_transfer_notification_failed", {
          conversation_id: conversationId,
          previous_assigned_user_id: conversation.assigned_user_id,
          next_assigned_user_id: userId,
          error:
            notificationError instanceof Error ? notificationError.message : "Erro desconhecido",
        })
      }
    }

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
    const accessContext = await requireWhatsAppAccess()
    const { user } = accessContext

    if (!ensureValidBrand(brand)) {
      throw new WhatsAppActionError("Marca inválida para a conversa.")
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

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
    const accessContext = await requireWhatsAppAccess()
    const { user } = accessContext
    const supabaseAdmin = createSupabaseServiceClient()
    await fetchConversationById(conversationId, accessContext)

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

export async function deleteWhatsAppConversation(
  conversationId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const accessContext = await requireWhatsAppAccess()

    if (!accessContext.isRestrictionAdmin) {
      throw new WhatsAppActionError(
        "Somente adm_mestre e adm_dorata podem excluir conversas do WhatsApp."
      )
    }

    const supabaseAdmin = createSupabaseServiceClient()
    await fetchConversationById(conversationId, accessContext)

    await removeConversationOutboundMedia({
      supabaseAdmin,
      conversationId,
    })

    const { error: deleteAccessError } = await supabaseAdmin
      .from("whatsapp_conversation_access")
      .delete()
      .eq("conversation_id", conversationId)

    if (
      deleteAccessError &&
      !isMissingRelationError(deleteAccessError, "whatsapp_conversation_access")
    ) {
      throw new WhatsAppActionError(deleteAccessError.message)
    }

    const { error: deleteConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .delete()
      .eq("id", conversationId)

    if (deleteConversationError) {
      throw new WhatsAppActionError(deleteConversationError.message)
    }

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: { id: conversationId },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao excluir conversa.",
    }
  }
}

export async function reopenWhatsAppConversation(
  conversationId: string
): Promise<ActionResult<{ id: string; status: "OPEN" | "PENDING_BRAND" }>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const { user } = accessContext
    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

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

export async function getWhatsAppConversationRestrictionSettings(
  conversationId: string
): Promise<ActionResult<WhatsAppConversationRestrictionSettings>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    if (!accessContext.isRestrictionAdmin) {
      throw new WhatsAppActionError(
        "Somente adm_mestre e adm_dorata podem gerenciar conversas restritas."
      )
    }

    const supabaseAdmin = createSupabaseServiceClient()
    await ensureRestrictionSchemaAvailable(supabaseAdmin)

    const conversation = await fetchConversationById(conversationId, accessContext)

    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from("whatsapp_conversation_access")
      .select("user_id")
      .eq("conversation_id", conversationId)

    if (accessError) {
      throw new WhatsAppActionError(accessError.message)
    }

    const allowedUserIds = (accessRows ?? [])
      .map((row) => (row as { user_id: string | null }).user_id)
      .filter((value): value is string => Boolean(value))

    return {
      success: true,
      data: {
        conversation_id: conversation.id,
        is_restricted: conversation.is_restricted,
        allowed_user_ids: allowedUserIds,
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao carregar permissões da conversa restrita.",
    }
  }
}

export async function setWhatsAppConversationRestriction(
  conversationId: string,
  input: {
    isRestricted: boolean
    allowedUserIds?: string[]
  }
): Promise<ActionResult<WhatsAppConversationRestrictionSettings>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    if (!accessContext.isRestrictionAdmin) {
      throw new WhatsAppActionError(
        "Somente adm_mestre e adm_dorata podem gerenciar conversas restritas."
      )
    }

    const supabaseAdmin = createSupabaseServiceClient()
    await ensureRestrictionSchemaAvailable(supabaseAdmin)
    const conversation = await fetchConversationById(conversationId, accessContext)

    const normalizedAllowedUserIds = Array.from(
      new Set(
        (input.allowedUserIds ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    )

    if (normalizedAllowedUserIds.length > 0) {
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id")
        .in("id", normalizedAllowedUserIds)

      if (usersError) {
        throw new WhatsAppActionError(usersError.message)
      }

      const existingIds = new Set((usersData ?? []).map((row: { id: string }) => row.id))
      const missingIds = normalizedAllowedUserIds.filter((id) => !existingIds.has(id))
      if (missingIds.length > 0) {
        throw new WhatsAppActionError("Um ou mais usuários selecionados não existem.")
      }
    }

    const { error: updateConversationError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ is_restricted: input.isRestricted })
      .eq("id", conversationId)

    if (updateConversationError) {
      throw new WhatsAppActionError(updateConversationError.message)
    }

    const { error: deleteAccessError } = await supabaseAdmin
      .from("whatsapp_conversation_access")
      .delete()
      .eq("conversation_id", conversationId)

    if (deleteAccessError) {
      throw new WhatsAppActionError(deleteAccessError.message)
    }

    if (input.isRestricted && normalizedAllowedUserIds.length > 0) {
      const accessRows = normalizedAllowedUserIds.map((allowedUserId) => ({
        conversation_id: conversationId,
        user_id: allowedUserId,
        granted_by_user_id: accessContext.user.id,
      }))

      const { error: insertAccessError } = await supabaseAdmin
        .from("whatsapp_conversation_access")
        .insert(accessRows)

      if (insertAccessError) {
        throw new WhatsAppActionError(insertAccessError.message)
      }
    }

    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      data: {
        conversation_id: conversation.id,
        is_restricted: input.isRestricted,
        allowed_user_ids: input.isRestricted ? normalizedAllowedUserIds : [],
      },
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao atualizar permissões da conversa restrita.",
    }
  }
}

export async function sendWhatsAppTextMessage(
  conversationId: string,
  text: string
): Promise<ActionResult<{ message: WhatsAppMessage; send_result: SendMessageResult }>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const { user, profile } = accessContext

    const messageText = text.trim()

    if (!messageText) {
      throw new WhatsAppActionError("Digite uma mensagem antes de enviar.")
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

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
        message: mapMessageRowToModel(inserted),
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

export async function sendWhatsAppMediaMessage(
  conversationId: string,
  input: {
    mediaType: WhatsAppOutboundMediaType
    storagePath: string
    fileName?: string | null
    caption?: string | null
  }
): Promise<ActionResult<{ message: WhatsAppMessage; send_result: SendMessageResult }>> {
  try {
    const accessContext = await requireWhatsAppAccess()
    const { user } = accessContext

    if (!isWhatsAppOutboundMediaType(input.mediaType)) {
      throw new WhatsAppActionError("Tipo de mídia inválido para envio.")
    }

    const storagePath = (input.storagePath || "").trim()
    if (!storagePath) {
      throw new WhatsAppActionError("Arquivo de mídia não informado.")
    }

    if (!storagePath.startsWith(`${conversationId}/`)) {
      throw new WhatsAppActionError("Arquivo inválido para esta conversa.")
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const conversation = await fetchConversationById(conversationId, accessContext)

    if (!conversation.brand) {
      throw new WhatsAppActionError("Defina a marca da conversa antes de enviar mensagens.")
    }

    if (conversation.status === "CLOSED") {
      throw new WhatsAppActionError("Conversa fechada. Reabra para enviar novas mensagens.")
    }

    const now = Date.now()
    if (!conversation.window_expires_at || new Date(conversation.window_expires_at).getTime() <= now) {
      throw new WhatsAppActionError(
        "Janela de 24h encerrada. O envio de mensagens foi bloqueado nesta fase."
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

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(WHATSAPP_OUTBOUND_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 60 * 30)

    if (signedError || !signedData?.signedUrl) {
      throw new WhatsAppActionError(signedError?.message ?? "Falha ao gerar link temporário do arquivo.")
    }

    const caption = input.caption?.trim() || null
    const fileName = input.fileName?.trim() || null

    const sendResult = await sendWhatsAppMediaByConfiguredProvider({
      to: conversation.customer_wa_id,
      mediaType: input.mediaType,
      mediaUrl: signedData.signedUrl,
      caption,
      fileName,
      phoneNumberId: (accountData as { phone_number_id: string }).phone_number_id,
    })

    if (!sendResult.success) {
      throw new WhatsAppActionError(sendResult.error || "Falha no envio de mídia para o WhatsApp.")
    }

    const nowIso = new Date().toISOString()
    const bodyText = formatOutboundMediaBodyText({
      mediaType: input.mediaType,
      caption,
      fileName,
    })

    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversationId,
        direction: "OUTBOUND",
        wa_message_id: sendResult.messageId ?? null,
        message_type: input.mediaType,
        body_text: bodyText,
        status: mapSendResultToMessageStatus(sendResult),
        sender_user_id: user.id,
        raw_payload: {
          provider_send_result: sendResult.raw ?? {},
          outbound_media: {
            media_type: input.mediaType,
            storage_bucket: WHATSAPP_OUTBOUND_MEDIA_BUCKET,
            storage_path: storagePath,
            file_name: fileName,
            caption,
          },
        },
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
        message: mapMessageRowToModel(inserted),
        send_result: sendResult,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao enviar mídia.",
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
