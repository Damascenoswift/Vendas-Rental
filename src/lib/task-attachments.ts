"use client"

import { supabase } from "@/lib/supabase"

export const TASK_ATTACHMENTS_BUCKET = "task-attachments"
export const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_TASK_ATTACHMENTS_PER_TASK = 5

const TASK_ATTACHMENT_ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png"])
const TASK_ATTACHMENT_ALLOWED_EXTENSIONS = new Set(["pdf", "png"])

export interface TaskAttachmentFile {
    path: string
    name: string
    size: number | null
    created_at: string | null
    updated_at: string | null
    signedUrl: string | null
}

export interface TaskAttachmentUploadFailure {
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
    if (TASK_ATTACHMENT_ALLOWED_EXTENSIONS.has(fromName)) return fromName

    if (file.type === "application/pdf") return "pdf"
    if (file.type === "image/png") return "png"
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
    if (TASK_ATTACHMENT_ALLOWED_MIME_TYPES.has(file.type)) return true
    const extension = getFileExtension(file.name)
    return TASK_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension)
}

export function formatTaskAttachmentSize(size: number | null | undefined) {
    if (!size || size <= 0) return "0 B"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function validateTaskAttachment(file: File | null | undefined) {
    if (!file) return "Selecione um arquivo PDF ou PNG."
    if (!isAllowedAttachmentType(file)) return "Apenas arquivos PDF ou PNG são permitidos."
    if (file.size > MAX_TASK_ATTACHMENT_BYTES) return "Cada arquivo deve ter no máximo 10MB."
    return null
}

export function validateTaskAttachmentFiles(
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    if (files.length === 0) return "Selecione ao menos um arquivo PDF ou PNG."

    const maxCount = options?.maxCount ?? MAX_TASK_ATTACHMENTS_PER_TASK
    if (files.length > maxCount) return `Selecione no máximo ${maxCount} arquivo(s).`

    const firstError = files
        .map((file) => validateTaskAttachment(file))
        .find((error) => Boolean(error))

    if (firstError) return firstError
    return null
}

export async function uploadTaskAttachment(taskId: string, file: File) {
    const validationError = validateTaskAttachment(file)
    if (validationError) return { error: validationError }

    const extension = resolveAttachmentExtension(file)
    if (!extension) return { error: "Extensão de arquivo inválida para anexo." }

    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const safeName = sanitizeAttachmentFileName(file.name, extension)
    const path = `${taskId}/${uniquePrefix}-${safeName}`
    const contentType = extension === "pdf" ? "application/pdf" : "image/png"

    const { error } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType,
        })

    if (error) return { error: error.message }
    return { path }
}

export async function uploadTaskAttachments(
    taskId: string,
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) {
    const files = Array.from(filesInput ?? [])
    const validationError = validateTaskAttachmentFiles(files, { maxCount: options?.maxCount })
    if (validationError) {
        return {
            uploaded: [] as string[],
            failed: [{ name: "validação", error: validationError }] as TaskAttachmentUploadFailure[],
            error: validationError,
        }
    }

    const uploaded: string[] = []
    const failed: TaskAttachmentUploadFailure[] = []

    for (const file of files) {
        const result = await uploadTaskAttachment(taskId, file)
        if (result.error) {
            failed.push({ name: file.name, error: result.error })
        } else if (result.path) {
            uploaded.push(result.path)
        }
    }

    return { uploaded, failed, error: null as string | null }
}

export async function listTaskAttachments(taskId: string) {
    const { data, error } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .list(taskId, {
            limit: 100,
            offset: 0,
            sortBy: { column: "created_at", order: "desc" },
        })

    if (error) return { data: [] as TaskAttachmentFile[], error: error.message }

    const attachments = await Promise.all(
        (data ?? []).map(async (item: {
            name: string
            metadata?: { size?: number } | null
            created_at?: string | null
            updated_at?: string | null
        }) => {
            const path = `${taskId}/${item.name}`
            const signed = await supabase.storage
                .from(TASK_ATTACHMENTS_BUCKET)
                .createSignedUrl(path, 60 * 60)

            return {
                path,
                name: item.name,
                size: typeof item.metadata?.size === "number" ? item.metadata.size : null,
                created_at: item.created_at ?? null,
                updated_at: item.updated_at ?? null,
                signedUrl: signed.data?.signedUrl ?? null,
            } satisfies TaskAttachmentFile
        })
    )

    return { data: attachments, error: null as string | null }
}

// Backward compatibility aliases (legacy names used in older components).
export function validateTaskPdfAttachment(file: File | null | undefined) {
    return validateTaskAttachment(file)
}

export async function uploadTaskPdfAttachment(taskId: string, file: File) {
    return uploadTaskAttachment(taskId, file)
}

export async function listTaskPdfAttachments(taskId: string) {
    return listTaskAttachments(taskId)
}
