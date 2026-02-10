"use client"

import { supabase } from "@/lib/supabase"

export const TASK_ATTACHMENTS_BUCKET = "task-attachments"
const MAX_TASK_ATTACHMENT_BYTES = 10 * 1024 * 1024

export interface TaskAttachmentFile {
    path: string
    name: string
    size: number | null
    created_at: string | null
    updated_at: string | null
    signedUrl: string | null
}

function sanitizeFileName(name: string) {
    const normalized = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")

    if (!normalized.toLowerCase().endsWith(".pdf")) {
        return `${normalized}.pdf`
    }

    return normalized
}

export function formatTaskAttachmentSize(size: number | null | undefined) {
    if (!size || size <= 0) return "0 B"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function validateTaskPdfAttachment(file: File | null | undefined) {
    if (!file) return "Selecione um arquivo PDF."
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) return "Apenas arquivos PDF são permitidos."
    if (file.size > MAX_TASK_ATTACHMENT_BYTES) return "O PDF deve ter no máximo 10MB."
    return null
}

export async function uploadTaskPdfAttachment(taskId: string, file: File) {
    const validationError = validateTaskPdfAttachment(file)
    if (validationError) return { error: validationError }

    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const safeName = sanitizeFileName(file.name)
    const path = `${taskId}/${uniquePrefix}-${safeName}`

    const { error } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType: "application/pdf",
        })

    if (error) return { error: error.message }
    return { path }
}

export async function listTaskPdfAttachments(taskId: string) {
    const { data, error } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .list(taskId, {
            limit: 100,
            offset: 0,
            sortBy: { column: "created_at", order: "desc" },
        })

    if (error) return { data: [] as TaskAttachmentFile[], error: error.message }

    const attachments = await Promise.all(
        (data ?? []).map(async (item: any) => {
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
