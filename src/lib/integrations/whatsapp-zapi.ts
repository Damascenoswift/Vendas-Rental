import {
  mapInboundMessageType,
  normalizeWhatsAppIdentifier,
  type SendMessageResult,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
} from "@/lib/integrations/whatsapp"

type ZApiEventPayload = Record<string, unknown>

export type ZApiReceivedCallbackPayload = ZApiEventPayload & {
  type?: string
  instanceId?: string
  connectedPhone?: string
  phone?: string
  fromMe?: boolean
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
  momment?: number
  phone?: string
  isGroup?: boolean
}

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

function normalizeEventType(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase()
}

function extractTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

export function isZApiReceivedCallback(payload: unknown): payload is ZApiReceivedCallbackPayload {
  if (!isObject(payload)) return false
  return normalizeEventType(payload.type) === "receivedcallback"
}

export function isZApiMessageStatusCallback(payload: unknown): payload is ZApiMessageStatusCallbackPayload {
  if (!isObject(payload)) return false
  return normalizeEventType(payload.type) === "messagestatuscallback"
}

export function verifyZApiWebhookToken(request: Request) {
  const expectedToken = (process.env.WHATSAPP_ZAPI_WEBHOOK_TOKEN || "").trim()
  if (!expectedToken) return true

  const requestUrl = new URL(request.url)
  const tokenFromQuery =
    requestUrl.searchParams.get("zapi_token") || requestUrl.searchParams.get("token") || ""
  const tokenFromHeader =
    request.headers.get("x-zapi-webhook-token") ||
    request.headers.get("X-ZAPI-Webhook-Token") ||
    ""

  return tokenFromQuery === expectedToken || tokenFromHeader === expectedToken
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

export function extractZApiCustomer(payload: ZApiReceivedCallbackPayload) {
  const customerWaId = normalizeWhatsAppIdentifier(extractTrimmedString(payload.phone))
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
  if (!Array.isArray(payload.ids)) return []
  return payload.ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0)
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

  const instanceId = getRequiredEnv("WHATSAPP_ZAPI_INSTANCE_ID")
  const instanceToken = getRequiredEnv("WHATSAPP_ZAPI_INSTANCE_TOKEN")
  const clientToken = getRequiredEnv("WHATSAPP_ZAPI_CLIENT_TOKEN")

  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`
  const payload = {
    phone: to,
    message: body,
  }

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
