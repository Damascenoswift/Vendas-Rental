import { createHmac, timingSafeEqual } from "node:crypto"
import { isWhatsAppOutboundMediaType, type WhatsAppOutboundMediaType } from "@/lib/whatsapp-media"

export type WhatsAppConversationStatus = "PENDING_BRAND" | "OPEN" | "CLOSED"
export type WhatsAppMessageDirection = "INBOUND" | "OUTBOUND"
export type WhatsAppBrand = "rental" | "dorata" | "funcionario" | "diversos"

export type WhatsAppMessageStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"

export type WhatsAppMessageType =
  | "text"
  | "unsupported"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "contacts"
  | "unknown"

export type SendMessageResult = {
  success: boolean
  messageId?: string
  statusCode: number
  error?: string
  raw?: unknown
}

export type SendWhatsAppTextInput = {
  to: string
  text: string
  phoneNumberId?: string
}

export type SendWhatsAppTemplateInput = {
  to: string
  templateName: string
  languageCode?: string
  bodyParameters?: string[]
  phoneNumberId?: string
}

export type SendWhatsAppMediaInput = {
  to: string
  mediaType: WhatsAppOutboundMediaType
  mediaUrl: string
  caption?: string | null
  fileName?: string | null
  phoneNumberId?: string
}

export type WhatsAppProvider = "meta_cloud_api" | "z_api"

type WhatsAppCloudSendResponse = {
  messages?: Array<{ id?: string }>
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

export type WhatsAppWebhookPayload = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          wa_id?: string
          profile?: {
            name?: string
          }
        }>
        messages?: Array<{
          from?: string
          id?: string
          timestamp?: string
          type?: string
          text?: {
            body?: string
          }
          image?: {
            caption?: string
          }
          document?: {
            caption?: string
            filename?: string
          }
          audio?: Record<string, unknown>
          video?: {
            caption?: string
          }
          sticker?: Record<string, unknown>
          location?: {
            address?: string
            name?: string
          }
          contacts?: Array<Record<string, unknown>>
        }>
        statuses?: Array<{
          id?: string
          status?: string
          timestamp?: string
          recipient_id?: string
          conversation?: {
            id?: string
            expiration_timestamp?: string
          }
          errors?: Array<{
            code?: number
            title?: string
            message?: string
            error_data?: Record<string, unknown>
          }>
        }>
      }
    }>
  }>
}

export type WhatsAppWebhookMessage = {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: {
    body?: string
  }
  image?: {
    caption?: string
  }
  document?: {
    caption?: string
    filename?: string
  }
  audio?: Record<string, unknown>
  video?: {
    caption?: string
  }
  sticker?: Record<string, unknown>
  location?: {
    address?: string
    name?: string
  }
  contacts?: Array<Record<string, unknown>>
}

const DEFAULT_GRAPH_API_VERSION = "v21.0"
const DEFAULT_WHATSAPP_PROVIDER: WhatsAppProvider = "meta_cloud_api"

function isEnabledFlag(value?: string | null) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

function getGraphVersion() {
  return process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION
}

function isSupportedProvider(value: string): value is WhatsAppProvider {
  return value === "meta_cloud_api" || value === "z_api"
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER || DEFAULT_WHATSAPP_PROVIDER).trim().toLowerCase()
  if (!provider) return DEFAULT_WHATSAPP_PROVIDER
  return isSupportedProvider(provider) ? provider : DEFAULT_WHATSAPP_PROVIDER
}

function getCloudApiToken() {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN
  if (!token) {
    throw new Error("WHATSAPP_CLOUD_API_TOKEN nao configurado")
  }
  return token
}

function getDefaultPhoneNumberId() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID nao configurado")
  }
  return phoneNumberId
}

export function isWhatsAppInboxEnabled() {
  return isEnabledFlag(process.env.WHATSAPP_INBOX_ENABLED)
}

export function isUnsafeOutsideWindowAllowedForZApi() {
  if (getWhatsAppProvider() !== "z_api") return false
  return isEnabledFlag(process.env.WHATSAPP_ZAPI_ALLOW_OUTSIDE_24H)
}

export function normalizeWhatsAppIdentifier(raw: string | null | undefined) {
  if (!raw) return ""
  return raw.replace(/\D/g, "")
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (!appSecret || !signatureHeader) {
    return false
  }

  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader

  if (!/^[0-9a-fA-F]+$/.test(signature)) {
    return false
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")

  try {
    const expectedBuffer = Buffer.from(expected, "hex")
    const providedBuffer = Buffer.from(signature, "hex")

    if (expectedBuffer.length !== providedBuffer.length) {
      return false
    }

    return timingSafeEqual(expectedBuffer, providedBuffer)
  } catch {
    return false
  }
}

function buildGraphApiUrl(phoneNumberId: string) {
  return `https://graph.facebook.com/${getGraphVersion()}/${phoneNumberId}/messages`
}

export async function sendWhatsAppTextMessage(input: SendWhatsAppTextInput): Promise<SendMessageResult> {
  const token = getCloudApiToken()
  const phoneNumberId = input.phoneNumberId || getDefaultPhoneNumberId()
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

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  }

  try {
    const response = await fetch(buildGraphApiUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const json = (await response.json().catch(() => ({}))) as WhatsAppCloudSendResponse

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: json?.error?.message || `Erro WhatsApp Cloud API (${response.status})`,
        raw: json,
      }
    }

    return {
      success: true,
      statusCode: response.status,
      messageId: json?.messages?.[0]?.id,
      raw: json,
    }
  } catch (error) {
    return {
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : "Falha ao conectar na WhatsApp Cloud API",
    }
  }
}

export async function sendWhatsAppTemplateMessage(
  input: SendWhatsAppTemplateInput
): Promise<SendMessageResult> {
  const to = normalizeWhatsAppIdentifier(input.to)
  const templateName = input.templateName?.trim() || ""
  const languageCode = (input.languageCode?.trim() || "pt_BR").replace("-", "_")
  const bodyParameters = (input.bodyParameters ?? [])
    .map((value) => value.trim())
    .filter(Boolean)

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!templateName) {
    return {
      success: false,
      statusCode: 400,
      error: "Template WhatsApp inválido para envio.",
    }
  }

  const token = getCloudApiToken()
  const phoneNumberId = input.phoneNumberId || getDefaultPhoneNumberId()

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      ...(bodyParameters.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          }
        : {}),
    },
  }

  try {
    const response = await fetch(buildGraphApiUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const json = (await response.json().catch(() => ({}))) as WhatsAppCloudSendResponse

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: json?.error?.message || `Erro WhatsApp Cloud API (${response.status})`,
        raw: json,
      }
    }

    return {
      success: true,
      statusCode: response.status,
      messageId: json?.messages?.[0]?.id,
      raw: json,
    }
  } catch (error) {
    return {
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : "Falha ao conectar na WhatsApp Cloud API",
    }
  }
}

export async function sendWhatsAppMediaMessage(input: SendWhatsAppMediaInput): Promise<SendMessageResult> {
  const token = getCloudApiToken()
  const phoneNumberId = input.phoneNumberId || getDefaultPhoneNumberId()
  const to = normalizeWhatsAppIdentifier(input.to)
  const mediaUrl = input.mediaUrl?.trim() || ""
  const caption = input.caption?.trim() || ""
  const fileName = input.fileName?.trim() || ""

  if (!to) {
    return {
      success: false,
      statusCode: 400,
      error: "Destino invalido para envio WhatsApp.",
    }
  }

  if (!isWhatsAppOutboundMediaType(input.mediaType)) {
    return {
      success: false,
      statusCode: 400,
      error: "Tipo de mídia inválido para envio.",
    }
  }

  if (!mediaUrl) {
    return {
      success: false,
      statusCode: 400,
      error: "URL de mídia inválida para envio WhatsApp.",
    }
  }

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: input.mediaType,
  }

  if (input.mediaType === "image") {
    payload.image = {
      link: mediaUrl,
      ...(caption ? { caption } : {}),
    }
  } else if (input.mediaType === "document") {
    payload.document = {
      link: mediaUrl,
      ...(caption ? { caption } : {}),
      ...(fileName ? { filename: fileName } : {}),
    }
  } else {
    payload.audio = {
      link: mediaUrl,
    }
  }

  try {
    const response = await fetch(buildGraphApiUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const json = (await response.json().catch(() => ({}))) as WhatsAppCloudSendResponse

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: json?.error?.message || `Erro WhatsApp Cloud API (${response.status})`,
        raw: json,
      }
    }

    return {
      success: true,
      statusCode: response.status,
      messageId: json?.messages?.[0]?.id,
      raw: json,
    }
  } catch (error) {
    return {
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : "Falha ao conectar na WhatsApp Cloud API",
    }
  }
}

export function mapInboundMessageType(type: string | null | undefined): WhatsAppMessageType {
  switch (type) {
    case "text":
      return "text"
    case "image":
      return "image"
    case "document":
      return "document"
    case "audio":
      return "audio"
    case "video":
      return "video"
    case "sticker":
      return "sticker"
    case "location":
      return "location"
    case "contacts":
      return "contacts"
    case "interactive":
    case "button":
      return "unsupported"
    default:
      return "unknown"
  }
}

export function extractInboundMessageText(
  message: WhatsAppWebhookMessage
) {
  const type = message.type

  if (type === "text") {
    return (message.text?.body || "").trim()
  }

  if (type === "image") {
    const caption = message.image?.caption?.trim()
    return caption || "[Imagem recebida no WhatsApp]"
  }

  if (type === "document") {
    const caption = message.document?.caption?.trim()
    const fileName = message.document?.filename?.trim()
    if (caption) return caption
    if (fileName) return `[Documento recebido: ${fileName}]`
    return "[Documento recebido no WhatsApp]"
  }

  if (type === "video") {
    const caption = message.video?.caption?.trim()
    return caption || "[Video recebido no WhatsApp]"
  }

  if (type === "audio") {
    return "[Audio recebido no WhatsApp]"
  }

  if (type === "sticker") {
    return "[Sticker recebido no WhatsApp]"
  }

  if (type === "location") {
    const locationName = message.location?.name?.trim()
    const address = message.location?.address?.trim()
    if (locationName && address) return `[Localizacao: ${locationName} - ${address}]`
    if (locationName) return `[Localizacao: ${locationName}]`
    if (address) return `[Localizacao: ${address}]`
    return "[Localizacao recebida no WhatsApp]"
  }

  if (type === "contacts") {
    return "[Contato compartilhado no WhatsApp]"
  }

  return `[Mensagem ${type || "desconhecida"} recebida no WhatsApp]`
}
