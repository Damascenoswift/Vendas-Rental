"use client"

import {
    INTERNAL_CHAT_ATTACHMENTS_BUCKET,
    MAX_INTERNAL_CHAT_ATTACHMENT_BYTES,
    MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE,
    type InternalChatAttachmentRetentionPolicy,
    isInternalChatAttachmentRetentionPolicy,
} from "@/lib/internal-chat-attachment-config"
import { supabase } from "@/lib/supabase"

export { INTERNAL_CHAT_ATTACHMENTS_BUCKET, MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE }

export interface InternalChatPendingAttachmentInput {
    path: string
    original_name: string
    content_type: string | null
    size_bytes: number
    retention_policy: InternalChatAttachmentRetentionPolicy
}

export interface InternalChatAttachmentUploadFailure {
    name: string
    error: string
}

function sanitizeAttachmentFileName(name: string) {
    const trimmed = name.trim()
    const fallbackName = "anexo"

    if (!trimmed) {
        return fallbackName
    }

    const normalized = trimmed
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^_+|_+$/g, "")

    return normalized || fallbackName
}

export function formatInternalChatAttachmentSize(size: number | null | undefined) {
    if (!size || size <= 0) return "0 B"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function maxAttachmentSizeLabel() {
    return `${Math.round(MAX_INTERNAL_CHAT_ATTACHMENT_BYTES / (1024 * 1024))}MB`
}

export function validateInternalChatAttachment(file: File | null | undefined) {
    if (!file) return "Selecione um arquivo para anexar."
    if (!Number.isFinite(file.size) || file.size <= 0) return "Arquivo inválido."
    if (file.size > MAX_INTERNAL_CHAT_ATTACHMENT_BYTES) {
        return `Cada anexo deve ter no máximo ${maxAttachmentSizeLabel()}.`
    }

    return null
}

export function validateInternalChatAttachmentFiles(
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    const maxCount = options?.maxCount ?? MAX_INTERNAL_CHAT_ATTACHMENTS_PER_MESSAGE

    if (files.length > maxCount) {
        return `Selecione no máximo ${maxCount} anexo(s).`
    }

    const firstError = files
        .map((file) => validateInternalChatAttachment(file))
        .find((error) => Boolean(error))

    if (firstError) return firstError
    return null
}

export async function uploadInternalChatAttachment(
    conversationId: string,
    file: File,
    retentionPolicy: InternalChatAttachmentRetentionPolicy
) {
    const sanitizedConversationId = conversationId.trim()
    if (!sanitizedConversationId) {
        return { error: "Conversa inválida para upload." }
    }

    if (!isInternalChatAttachmentRetentionPolicy(retentionPolicy)) {
        return { error: "Política de retenção inválida." }
    }

    const validationError = validateInternalChatAttachment(file)
    if (validationError) {
        return { error: validationError }
    }

    const safeFileName = sanitizeAttachmentFileName(file.name)
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const path = `${sanitizedConversationId}/${uniquePrefix}-${safeFileName}`
    const contentType = file.type?.trim() || null

    const { error } = await supabase.storage
        .from(INTERNAL_CHAT_ATTACHMENTS_BUCKET)
        .upload(path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType: contentType ?? undefined,
        })

    if (error) {
        return { error: error.message }
    }

    return {
        attachment: {
            path,
            original_name: file.name?.trim() || safeFileName,
            content_type: contentType,
            size_bytes: file.size,
            retention_policy: retentionPolicy,
        } satisfies InternalChatPendingAttachmentInput
    }
}

export async function uploadInternalChatAttachments(
    conversationId: string,
    filesInput: File[] | FileList | null | undefined,
    retentionPolicy: InternalChatAttachmentRetentionPolicy,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    const validationError = validateInternalChatAttachmentFiles(files, { maxCount: options?.maxCount })

    if (validationError) {
        return {
            uploaded: [] as InternalChatPendingAttachmentInput[],
            failed: [{ name: "validação", error: validationError }] as InternalChatAttachmentUploadFailure[],
            error: validationError,
        }
    }

    const uploaded: InternalChatPendingAttachmentInput[] = []
    const failed: InternalChatAttachmentUploadFailure[] = []

    for (const file of files) {
        const result = await uploadInternalChatAttachment(conversationId, file, retentionPolicy)
        if (result.error) {
            failed.push({ name: file.name, error: result.error })
        } else if (result.attachment) {
            uploaded.push(result.attachment)
        }
    }

    if (failed.length > 0) {
        if (uploaded.length > 0) {
            const uploadedPaths = uploaded.map((item) => item.path)
            const { error: cleanupError } = await supabase.storage
                .from(INTERNAL_CHAT_ATTACHMENTS_BUCKET)
                .remove(uploadedPaths)

            if (cleanupError) {
                console.error("Error cleaning partial internal chat attachment uploads:", cleanupError)
            }
        }

        return {
            uploaded: [] as InternalChatPendingAttachmentInput[],
            failed,
            error: failed[0]?.error ?? "Falha ao enviar anexos.",
        }
    }

    return {
        uploaded,
        failed,
        error: null as string | null,
    }
}
