export const INTERNAL_CHAT_ATTACHMENTS_BUCKET = "internal-chat-attachments"
export const MAX_INTERNAL_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024
export const MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE = 8

export const INTERNAL_CHAT_ATTACHMENT_RETENTION_POLICIES = [
    "manual",
    "download_24h",
    "download_30d",
] as const

export type InternalChatAttachmentRetentionPolicy = (typeof INTERNAL_CHAT_ATTACHMENT_RETENTION_POLICIES)[number]

export function isInternalChatAttachmentRetentionPolicy(
    value: unknown
): value is InternalChatAttachmentRetentionPolicy {
    return (
        typeof value === "string"
        && (INTERNAL_CHAT_ATTACHMENT_RETENTION_POLICIES as readonly string[]).includes(value)
    )
}
