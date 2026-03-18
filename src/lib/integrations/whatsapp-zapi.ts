import {
  mapInboundMessageType,
  normalizeWhatsAppIdentifier,
  type SendMessageResult,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/lib/integrations/whatsapp"

type ZApiEventPayload = Record<string, unknown>

type ZApiChatSummary = {
  phone?: string | null
  lid?: string | null
}

export type ZApiReceivedCallbackPayload = ZApiEventPayload & {
  type?: string
  instanceId?: string
  connectedPhone?: string
  phone?: string
  lid?: string
  chatLid?: string
  participantLid?: string | null
  from?: string
  chatId?: string
  remoteJid?: string
  senderPhone?: string
  fromMe?: boolean | string | number
  isGroup?: boolean
  isNewsletter?: boolean
  messageId?: string
  status?: string
  momment?: number
  senderName?: string | null
  chatName?: string | null
  text?: {
    message?: string
  }
  image?: {
    caption?: string
    imageUrl?: string
  }
  document?: {
    caption?: string
    fileName?: string
    title?: string
    documentUrl?: string
  }
  audio?: {
    audioUrl?: string
  }
  video?: {
    caption?: string
    videoUrl?: string
  }
  sticker?: {
    stickerUrl?: string
  }
  location?: {
    name?: string
    address?: string
  }
  contact?: {
    displayName?: string
  }
}

export type ZApiMessageStatusCallbackPayload = ZApiEventPayload & {
  type?: string
  instanceId?: string
  connectedPhone?: string
  status?: string
  ids?: string[]
  id?: string
  messageId?: string
  zaapId?: string
  momment?: number
  phone?: string
  lid?: string
  chatLid?: string
  participantLid?: string | null
  from?: string
  chatId?: string
  remoteJid?: string
  senderPhone?: string
  fromMe?: boolean | string | number
  senderName?: string | null
  chatName?: string | null
  text?: {
    message?: string
  }
  isGroup?: boolean
}

export type ZApiDeliveryCallbackPayload = ZApiEventPayload & {
  type?: string
  instanceId?: string
  connectedPhone?: string
  phone?: string
  lid?: string
  chatLid?: string
  participantLid?: string | null
  from?: string
  chatId?: string
  remoteJid?: string
  senderPhone?: string
  fromMe?: boolean | string | number
  messageId?: string
  zaapId?: string
  momment?: number
}

export type ZApiWebhookTokenValidationOptions = {
  headerNames?: string[]
  allowQueryToken?: boolean
}

export type ZApiCustomerExtractionOptions = {
  selfWaId?: string | null
}

type ZApiIdentifierSource = "phone" | "from" | "chatId" | "remoteJid" | "senderPhone"

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} nao configurado`)
  }
  return value
}

function getOptionalEnv(name: string) {
  const value = process.env[name]
  if (!value) return ""
  return value.trim()
}

function normalizeEventType(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

function extractTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeLikelyPhone(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentifier(value || "")
  if (!normalized) return ""
  if (normalized.length < 10 || normalized.length > 13) return ""
  if (normalized.startsWith("0")) return ""
  return normalized
}

function normalizeLidCandidate(value: string | null | undefined) {
  const trimmed = (value || "").trim().toLowerCase()
  if (!trimmed) return ""

  const withDomain = trimmed.includes("@") ? trimmed : `${trimmed}@lid`
  return withDomain.endsWith("@lid") ? withDomain : ""
}

function normalizeZApiIdentifierCandidate(value: unknown, source: ZApiIdentifierSource) {
  const trimmed = extractTrimmedString(value)
  if (!trimmed) return ""

  let candidate = trimmed

  const atIndex = candidate.indexOf("@")
  if (atIndex > -1) {
    const domain = candidate.slice(atIndex + 1).toLowerCase()
    if (source === "chatId" || source === "remoteJid") {
      const isNumberChatDomain = domain === "c.us" || domain === "s.whatsapp.net"
      if (!isNumberChatDomain) {
        return ""
      }
    }
    candidate = candidate.slice(0, atIndex)
  }

  if (candidate.includes("-")) {
    return ""
  }

  const colonIndex = candidate.indexOf(":")
  if (colonIndex > -1) {
    candidate = candidate.slice(0, colonIndex)
  }

  const normalized = normalizeWhatsAppIdentifier(candidate)
  if (!normalized) return ""
  // Inbox usa números WhatsApp (telefone), então ignoramos identificadores longos de sessão.
  if (normalized.length < 10 || normalized.length > 13) return ""
  if (normalized.startsWith("0")) return ""

  return normalized
}

function extractPossibleCustomerIdentifier(
  payload: Record<string, unknown>,
  options: ZApiCustomerExtractionOptions = {}
) {
  const selfWaId = normalizeWhatsAppIdentifier(options.selfWaId || "")
  const fromMe = isZApiFromMe(payload.fromMe)

  const candidates = [
    { source: "phone", value: normalizeZApiIdentifierCandidate(payload.phone, "phone") },
    { source: "from", value: normalizeZApiIdentifierCandidate(payload.from, "from") },
    { source: "chatId", value: normalizeZApiIdentifierCandidate(payload.chatId, "chatId") },
    { source: "remoteJid", value: normalizeZApiIdentifierCandidate(payload.remoteJid, "remoteJid") },
    { source: "senderPhone", value: normalizeZApiIdentifierCandidate(payload.senderPhone, "senderPhone") },
  ].filter((candidate) => Boolean(candidate.value))

  const seen = new Set<string>()
  const orderedCandidates = candidates.filter((candidate) => {
    if (seen.has(candidate.value)) return false
    seen.add(candidate.value)
    return true
  })

  const isSelfCandidate = (value: string) => Boolean(selfWaId && value === selfWaId)

  if (fromMe) {
    const preferredRemoteCandidate = orderedCandidates.find(
      (candidate) =>
        (candidate.source === "chatId" || candidate.source === "remoteJid") &&
        !isSelfCandidate(candidate.value)
    )

    if (preferredRemoteCandidate) {
      return preferredRemoteCandidate.value
    }
  }

  const firstNonSelfCandidate = orderedCandidates.find((candidate) => !isSelfCandidate(candidate.value))
  return firstNonSelfCandidate?.value || ""
}

function hasInboundMessageContent(payload: Record<string, unknown>) {
  return Boolean(
    isObject(payload.text) ||
      isObject(payload.image) ||
      isObject(payload.document) ||
      isObject(payload.audio) ||
      isObject(payload.video) ||
      isObject(payload.sticker) ||
      isObject(payload.location) ||
      isObject(payload.contact)
  )
}

function isLikelyZApiInboundPayload(payload: Record<string, unknown>) {
  const customerId = extractPossibleCustomerIdentifier(payload)
  if (!customerId) return false

  const messageId = extractTrimmedString(payload.messageId)
  return Boolean(messageId || hasInboundMessageContent(payload))
}

function isLikelyZApiStatusPayload(payload: Record<string, unknown>) {
  const status = extractTrimmedString(payload.status)
  if (!status) return false

  if (Array.isArray(payload.ids)) {
    const hasStatusIds = payload.ids.some((id) => typeof id === "string" && id.trim().length > 0)
    if (hasStatusIds) return true
  }

  return (
    extractTrimmedString(payload.messageId) !== null ||
    extractTrimmedString(payload.zaapId) !== null ||
    extractTrimmedString(payload.id) !== null
  )
}

export function isZApiReceivedCallback(payload: unknown): payload is ZApiReceivedCallbackPayload {
  if (!isObject(payload)) return false

  const eventType = normalizeEventType(payload.type)
  if (eventType) {
    if (eventType === "receivedcallback") return true
    if (eventType.includes("status") || eventType.includes("delivery")) return false
    if (eventType.includes("received")) return true
    return isLikelyZApiInboundPayload(payload)
  }

  return isLikelyZApiInboundPayload(payload)
}

export function isZApiMessageStatusCallback(payload: unknown): payload is ZApiMessageStatusCallbackPayload {
  if (!isObject(payload)) return false

  const eventType = normalizeEventType(payload.type)
  if (eventType) {
    return eventType === "messagestatuscallback" || eventType.includes("status")
  }

  return isLikelyZApiStatusPayload(payload)
}

export function isZApiDeliveryCallback(payload: unknown): payload is ZApiDeliveryCallbackPayload {
  if (!isObject(payload)) return false

  const eventType = normalizeEventType(payload.type)
  if (eventType) {
    return eventType === "deliverycallback" || eventType.includes("delivery")
  }

  return false
}

export function isZApiFromMe(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value !== "string") return false

  const normalized = value.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim"
}

export function verifyZApiWebhookToken(
  request: Request,
  options: ZApiWebhookTokenValidationOptions = {}
) {
  const expectedToken = (process.env.WHATSAPP_ZAPI_WEBHOOK_TOKEN || "").trim()
  if (!expectedToken) return true

  const headerNames =
    options.headerNames && options.headerNames.length > 0
      ? options.headerNames
      : ["x-webhook-token", "x-zapi-webhook-token"]

  for (const headerName of headerNames) {
    const tokenFromHeader = request.headers.get(headerName) || ""
    if (tokenFromHeader === expectedToken) {
      return true
    }
  }

  if (options.allowQueryToken === false) {
    return false
  }

  const requestUrl = new URL(request.url)
  const tokenFromQuery = requestUrl.searchParams.get("zapi_token") || requestUrl.searchParams.get("token") || ""

  return tokenFromQuery === expectedToken
}

export function matchesConfiguredZApiInstance(rawInstanceId: unknown) {
  const configuredInstanceId = (process.env.WHATSAPP_ZAPI_INSTANCE_ID || "").trim()
  if (!configuredInstanceId) return true

  const incomingInstanceId = extractTrimmedString(rawInstanceId)
  if (!incomingInstanceId) return false

  return incomingInstanceId === configuredInstanceId
}

export function getZApiAccountData(payload: ZApiReceivedCallbackPayload | ZApiMessageStatusCallbackPayload) {
  const instanceId = extractTrimmedString(payload.instanceId)
  if (!instanceId) return null

  const connectedPhone = normalizeWhatsAppIdentifier(extractTrimmedString(payload.connectedPhone))

  return {
    providerPhoneNumberId: `zapi:${instanceId}`,
    providerAccountId: instanceId,
    displayPhoneNumber: connectedPhone || null,
  }
}

export function mapZApiStatusToMessageStatus(
  rawStatus: string | null | undefined
): WhatsAppMessageStatus | null {
  const status = (rawStatus || "").trim().toUpperCase()

  switch (status) {
    case "PENDING":
      return "queued"
    case "SENT":
      return "sent"
    case "RECEIVED":
      return "delivered"
    case "READ":
    case "READ_BY_ME":
    case "PLAYED":
      return "read"
    case "FAILED":
    case "ERROR":
      return "failed"
    default:
      return null
  }
}

function detectInboundType(payload: ZApiReceivedCallbackPayload): WhatsAppMessageType {
  if (payload.text?.message) return mapInboundMessageType("text")
  if (payload.image) return mapInboundMessageType("image")
  if (payload.document) return mapInboundMessageType("document")
  if (payload.audio) return mapInboundMessageType("audio")
  if (payload.video) return mapInboundMessageType("video")
  if (payload.sticker) return mapInboundMessageType("sticker")
  if (payload.location) return mapInboundMessageType("location")
  if (payload.contact) return mapInboundMessageType("contacts")
  return mapInboundMessageType(null)
}

function extractInboundBodyText(payload: ZApiReceivedCallbackPayload) {
  const text = payload.text?.message?.trim()
  if (text) return text

  if (payload.image) {
    return payload.image.caption?.trim() || "[Imagem recebida no WhatsApp]"
  }

  if (payload.document) {
    const caption = payload.document.caption?.trim()
    const fileName = payload.document.fileName?.trim()
    if (caption) return caption
    if (fileName) return `[Documento recebido: ${fileName}]`
    return "[Documento recebido no WhatsApp]"
  }

  if (payload.video) {
    return payload.video.caption?.trim() || "[Video recebido no WhatsApp]"
  }

  if (payload.audio) {
    return "[Audio recebido no WhatsApp]"
  }

  if (payload.sticker) {
    return "[Sticker recebido no WhatsApp]"
  }

  if (payload.location) {
    const locationName = payload.location.name?.trim()
    const address = payload.location.address?.trim()
    if (locationName && address) return `[Localizacao: ${locationName} - ${address}]`
    if (locationName) return `[Localizacao: ${locationName}]`
    if (address) return `[Localizacao: ${address}]`
    return "[Localizacao recebida no WhatsApp]"
  }

  if (payload.contact) {
    return "[Contato compartilhado no WhatsApp]"
  }

  return "[Mensagem recebida no WhatsApp]"
}

export function extractZApiInboundMessage(payload: ZApiReceivedCallbackPayload) {
  return {
    waMessageId: extractTrimmedString(payload.messageId),
    messageType: detectInboundType(payload),
    bodyText: extractInboundBodyText(payload),
  }
}

export function extractZApiCustomer(
  payload: ZApiReceivedCallbackPayload,
  options: ZApiCustomerExtractionOptions = {}
) {
  const customerWaId = extractPossibleCustomerIdentifier(payload, options)
  const customerName =
    extractTrimmedString(payload.senderName) ||
    extractTrimmedString(payload.chatName) ||
    null

  return {
    customerWaId,
    customerName,
  }
}

export function toIsoFromZApiMoment(rawMoment: unknown) {
  if (typeof rawMoment !== "number" || !Number.isFinite(rawMoment) || rawMoment <= 0) {
    return null
  }

  return new Date(rawMoment).toISOString()
}

export function getZApiStatusIds(payload: ZApiMessageStatusCallbackPayload) {
  const idsFromList = Array.isArray(payload.ids)
    ? payload.ids
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0)
    : []

  const idsFromSingle = [
    extractTrimmedString(payload.messageId),
    extractTrimmedString(payload.zaapId),
    extractTrimmedString(payload.id),
  ].filter((id): id is string => Boolean(id))

  return Array.from(new Set([...idsFromList, ...idsFromSingle]))
}

export async function resolveZApiPhoneByLid(rawLid: string | null | undefined): Promise<string | null> {
  const normalizedLid = normalizeLidCandidate(rawLid)
  if (!normalizedLid) return null

  const instanceId = getOptionalEnv("WHATSAPP_ZAPI_INSTANCE_ID")
  const instanceToken = getOptionalEnv("WHATSAPP_ZAPI_INSTANCE_TOKEN")
  const clientToken = getOptionalEnv("WHATSAPP_ZAPI_CLIENT_TOKEN")

  if (!instanceId || !instanceToken || !clientToken) {
    return null
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/chats?count=2000`

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Client-Token": clientToken,
      },
      cache: "no-store",
    })

    if (!response.ok) return null

    const json = (await response.json().catch(() => [])) as unknown
    if (!Array.isArray(json)) return null

    const chats = json as ZApiChatSummary[]
    const matchedChat = chats.find((chat) => normalizeLidCandidate(chat.lid) === normalizedLid)
    if (!matchedChat) return null

    const phone = normalizeLikelyPhone(matchedChat.phone)
    return phone || null
  } catch {
    return null
  }
}

export async function sendZApiTextMessage(input: {
  to: string
  text: string
}): Promise<SendMessageResult> {
  const to = normalizeWhatsAppIdentifier(input.to)
  const body = input.text?.trim() || ""

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!body) {
    return {
      success: false,
      statusCode: 400,
      error: "Mensagem vazia nao pode ser enviada.",
    }
  }

  return sendZApiRequest("send-text", {
    phone: to,
    message: body,
  })
}

async function sendZApiRequest(path: string, payload: Record<string, unknown>): Promise<SendMessageResult> {
  const instanceId = getRequiredEnv("WHATSAPP_ZAPI_INSTANCE_ID")
  const instanceToken = getRequiredEnv("WHATSAPP_ZAPI_INSTANCE_TOKEN")
  const clientToken = getRequiredEnv("WHATSAPP_ZAPI_CLIENT_TOKEN")

  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/${path}`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify(payload),
    })

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      const errorMessage =
        (typeof json.error === "string" && json.error) ||
        (typeof json.message === "string" && json.message) ||
        `Erro Z-API (${response.status})`

      return {
        success: false,
        statusCode: response.status,
        error: errorMessage,
        raw: json,
      }
    }

    const messageId =
      (typeof json.messageId === "string" && json.messageId) ||
      (typeof json.zaapId === "string" ? json.zaapId : undefined)

    return {
      success: true,
      statusCode: response.status,
      messageId,
      raw: json,
    }
  } catch (error) {
    return {
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : "Falha ao conectar na Z-API",
    }
  }
}

function getDocumentExtensionFromUrlOrName(value: string) {
  const lastSegment = value.split("?")[0]?.split("#")[0] || value
  const extension = lastSegment.split(".").pop()?.toLowerCase() || ""
  if (!extension) return null
  return extension.replace(/[^a-z0-9]/g, "") || null
}

export async function sendZApiImageMessage(input: {
  to: string
  imageUrl: string
  caption?: string | null
}): Promise<SendMessageResult> {
  const to = normalizeWhatsAppIdentifier(input.to)
  const imageUrl = input.imageUrl?.trim() || ""
  const caption = input.caption?.trim() || ""

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!imageUrl) {
    return {
      success: false,
      statusCode: 400,
      error: "URL da imagem inválida.",
    }
  }

  return sendZApiRequest("send-image", {
    phone: to,
    image: imageUrl,
    ...(caption ? { caption } : {}),
  })
}

export async function sendZApiDocumentMessage(input: {
  to: string
  documentUrl: string
  fileName?: string | null
  caption?: string | null
}): Promise<SendMessageResult> {
  const to = normalizeWhatsAppIdentifier(input.to)
  const documentUrl = input.documentUrl?.trim() || ""
  const fileName = input.fileName?.trim() || ""
  const caption = input.caption?.trim() || ""

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!documentUrl) {
    return {
      success: false,
      statusCode: 400,
      error: "URL do documento inválida.",
    }
  }

  const extensionSource = fileName || documentUrl
  const extension = getDocumentExtensionFromUrlOrName(extensionSource)
  const path = extension ? `send-document/${extension}` : "send-document"

  return sendZApiRequest(path, {
    phone: to,
    document: documentUrl,
    ...(fileName ? { fileName } : {}),
    ...(caption ? { caption } : {}),
  })
}

export async function sendZApiAudioMessage(input: {
  to: string
  audioUrl: string
}): Promise<SendMessageResult> {
  const to = normalizeWhatsAppIdentifier(input.to)
  const audioUrl = input.audioUrl?.trim() || ""

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!audioUrl) {
    return {
      success: false,
      statusCode: 400,
      error: "URL do áudio inválida.",
    }
  }

  return sendZApiRequest("send-audio", {
    phone: to,
    audio: audioUrl,
  })
}
