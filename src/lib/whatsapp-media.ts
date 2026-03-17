export type WhatsAppOutboundMediaType = "image" | "document" | "audio"

export const WHATSAPP_OUTBOUND_MEDIA_BUCKET = "whatsapp-outbound-media"
export const WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES = 20 * 1024 * 1024

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"])

const DOCUMENT_MIME_TYPES = new Set(["application/pdf"])
const DOCUMENT_EXTENSIONS = new Set(["pdf"])

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/webm",
])
const AUDIO_EXTENSIONS = new Set(["mp3", "ogg", "wav", "m4a", "aac", "webm"])

function getFileExtension(name: string) {
  const parts = name.split(".")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

function sanitizeFileBaseName(name: string) {
  const baseName = name.replace(/\.[^/.]+$/, "")
  const normalized = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "")

  return normalized || "arquivo"
}

function defaultExtensionByType(type: WhatsAppOutboundMediaType) {
  if (type === "image") return "jpg"
  if (type === "document") return "pdf"
  return "mp3"
}

export function resolveWhatsAppOutboundMediaType(input: {
  fileName: string
  mimeType?: string | null
}): WhatsAppOutboundMediaType | null {
  const mimeType = (input.mimeType || "").trim().toLowerCase()
  const extension = getFileExtension(input.fileName)

  if (IMAGE_MIME_TYPES.has(mimeType) || IMAGE_EXTENSIONS.has(extension)) {
    return "image"
  }

  if (DOCUMENT_MIME_TYPES.has(mimeType) || DOCUMENT_EXTENSIONS.has(extension)) {
    return "document"
  }

  if (AUDIO_MIME_TYPES.has(mimeType) || AUDIO_EXTENSIONS.has(extension)) {
    return "audio"
  }

  return null
}

export function sanitizeWhatsAppOutboundMediaFileName(input: {
  fileName: string
  mediaType: WhatsAppOutboundMediaType
}) {
  const extension = getFileExtension(input.fileName)
  const safeBase = sanitizeFileBaseName(input.fileName)
  const finalExtension = extension || defaultExtensionByType(input.mediaType)
  return `${safeBase}.${finalExtension}`
}

export function validateWhatsAppOutboundMediaFile(input: {
  fileName: string
  sizeBytes: number
  mimeType?: string | null
}) {
  if (!input.fileName.trim()) {
    return "Arquivo inválido."
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "Arquivo vazio."
  }

  if (input.sizeBytes > WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES) {
    const maxMb = Math.round(WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES / (1024 * 1024))
    return `Arquivo acima do limite de ${maxMb}MB.`
  }

  const mediaType = resolveWhatsAppOutboundMediaType({
    fileName: input.fileName,
    mimeType: input.mimeType,
  })

  if (!mediaType) {
    return "Formato não suportado. Use foto (JPG/PNG/WEBP), PDF ou áudio (MP3/OGG/WAV/M4A/AAC/WEBM)."
  }

  return null
}

export function buildWhatsAppOutboundMediaStoragePath(input: {
  conversationId: string
  safeFileName: string
}) {
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${input.conversationId}/${uniquePart}-${input.safeFileName}`
}

export function isWhatsAppOutboundMediaType(value: string): value is WhatsAppOutboundMediaType {
  return value === "image" || value === "document" || value === "audio"
}

export function formatOutboundMediaBodyText(input: {
  mediaType: WhatsAppOutboundMediaType
  caption?: string | null
  fileName?: string | null
}) {
  const caption = input.caption?.trim()
  if (caption) return caption

  if (input.mediaType === "image") {
    return "[Imagem enviada no WhatsApp]"
  }

  if (input.mediaType === "document") {
    const fileName = input.fileName?.trim()
    return fileName ? `[Documento enviado: ${fileName}]` : "[Documento enviado no WhatsApp]"
  }

  return "[Audio enviado no WhatsApp]"
}
