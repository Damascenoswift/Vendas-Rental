"use client"

import { supabase } from "@/lib/supabase"

export const WORK_COMMENT_ATTACHMENTS_BUCKET = "obra-comment-attachments"
export const MAX_WORK_COMMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT = 5

const WORK_COMMENT_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

const WORK_COMMENT_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
    "pdf",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "doc",
    "docx",
    "xls",
    "xlsx",
])

export interface WorkCommentAttachmentUploadItem {
    path: string
    name: string
    size: number | null
    content_type: string | null
}

export interface WorkCommentAttachmentUploadFailure {
    name: string
    error: string
}

function getFileExtension(name: string) {
    const parts = name.split(".")
    if (parts.length < 2) return ""
    return parts[parts.length - 1].toLowerCase()
}

function resolveAttachmentExtension(file: File) {
    const fromName = getFileExtension(file.name)
    if (WORK_COMMENT_ATTACHMENT_ALLOWED_EXTENSIONS.has(fromName)) return fromName

    if (file.type === "application/pdf") return "pdf"
    if (file.type === "image/jpeg") return "jpg"
    if (file.type === "image/png") return "png"
    if (file.type === "image/webp") return "webp"
    if (file.type === "application/msword") return "doc"
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
    if (file.type === "application/vnd.ms-excel") return "xls"
    if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx"
    return null
}

function sanitizeAttachmentFileName(name: string, extension: string) {
    const baseName = name.replace(/\.[^/.]+$/, "")
    const normalizedBase = baseName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^_+|_+$/g, "")

    const safeBase = normalizedBase || "anexo"
    return `${safeBase}.${extension}`
}

function isAllowedAttachmentType(file: File) {
    if (WORK_COMMENT_ATTACHMENT_ALLOWED_MIME_TYPES.has(file.type)) return true
    const extension = getFileExtension(file.name)
    return WORK_COMMENT_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension)
}

export function validateWorkCommentAttachment(file: File | null | undefined) {
    if (!file) return "Selecione um documento para anexar."
    if (!isAllowedAttachmentType(file)) return "Formato inválido. Use PDF, imagem, DOC/DOCX ou XLS/XLSX."
    if (file.size > MAX_WORK_COMMENT_ATTACHMENT_BYTES) return "Cada anexo deve ter no máximo 10MB."
    return null
}

export function validateWorkCommentAttachmentFiles(
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    const maxCount = options?.maxCount ?? MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT
    if (files.length > maxCount) return `Selecione no máximo ${maxCount} anexo(s).`

    const firstError = files
        .map((file) => validateWorkCommentAttachment(file))
        .find((error) => Boolean(error))

    if (firstError) return firstError
    return null
}

export async function uploadWorkCommentAttachment(workId: string, file: File) {
    const validationError = validateWorkCommentAttachment(file)
    if (validationError) return { error: validationError }

    const extension = resolveAttachmentExtension(file)
    if (!extension) return { error: "Extensão de arquivo inválida para anexo." }

    const safeName = sanitizeAttachmentFileName(file.name, extension)
    const path = `${workId}/comments/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`
    const contentType = file.type || null

    const { error } = await supabase.storage
        .from(WORK_COMMENT_ATTACHMENTS_BUCKET)
        .upload(path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType: contentType ?? undefined,
        })

    if (error) return { error: error.message }

    return {
        attachment: {
            path,
            name: file.name,
            size: Number.isFinite(file.size) ? file.size : null,
            content_type: contentType,
        } satisfies WorkCommentAttachmentUploadItem
    }
}

export async function uploadWorkCommentAttachments(
    workId: string,
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    const validationError = validateWorkCommentAttachmentFiles(files, { maxCount: options?.maxCount })
    if (validationError) {
        return {
            uploaded: [] as WorkCommentAttachmentUploadItem[],
            failed: [{ name: "validação", error: validationError }] as WorkCommentAttachmentUploadFailure[],
            error: validationError,
        }
    }

    const uploaded: WorkCommentAttachmentUploadItem[] = []
    const failed: WorkCommentAttachmentUploadFailure[] = []

    for (const file of files) {
        const result = await uploadWorkCommentAttachment(workId, file)
        if (result.error) {
            failed.push({ name: file.name, error: result.error })
        } else if (result.attachment) {
            uploaded.push(result.attachment)
        }
    }

    return { uploaded, failed, error: null as string | null }
}
