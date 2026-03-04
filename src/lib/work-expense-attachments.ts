"use client"

import { supabase } from "@/lib/supabase"

export const WORK_EXPENSE_ATTACHMENTS_BUCKET = "obra-expense-attachments"
export const MAX_WORK_EXPENSE_ATTACHMENT_BYTES = 10 * 1024 * 1024

const WORK_EXPENSE_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

const WORK_EXPENSE_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
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

function getFileExtension(name: string) {
    const parts = name.split(".")
    if (parts.length < 2) return ""
    return parts[parts.length - 1].toLowerCase()
}

function resolveAttachmentExtension(file: File) {
    const fromName = getFileExtension(file.name)
    if (WORK_EXPENSE_ATTACHMENT_ALLOWED_EXTENSIONS.has(fromName)) return fromName

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
    if (WORK_EXPENSE_ATTACHMENT_ALLOWED_MIME_TYPES.has(file.type)) return true
    const extension = getFileExtension(file.name)
    return WORK_EXPENSE_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension)
}

export function validateWorkExpenseAttachment(file: File | null | undefined) {
    if (!file) return "Selecione um arquivo para a despesa."
    if (!isAllowedAttachmentType(file)) return "Formato inválido. Use PDF, imagem, DOC/DOCX ou XLS/XLSX."
    if (file.size > MAX_WORK_EXPENSE_ATTACHMENT_BYTES) return "O anexo deve ter no máximo 10MB."
    return null
}

export async function uploadWorkExpenseAttachment(workId: string, file: File) {
    const validationError = validateWorkExpenseAttachment(file)
    if (validationError) return { error: validationError }

    const extension = resolveAttachmentExtension(file)
    if (!extension) return { error: "Extensão de arquivo inválida para anexo." }

    const safeName = sanitizeAttachmentFileName(file.name, extension)
    const path = `${workId}/expenses/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`
    const contentType = file.type || null

    const { error } = await supabase.storage
        .from(WORK_EXPENSE_ATTACHMENTS_BUCKET)
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
        },
    }
}
