"use client"

import { supabase } from "@/lib/supabase"
import type { WorkImageType } from "@/services/work-cards-service"

export const WORK_IMAGES_BUCKET = "obra-images"
const MAX_WORK_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function sanitizeFileName(name: string) {
    const normalized = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")

    return normalized || "imagem"
}

export function validateWorkImageAttachment(file: File | null | undefined) {
    if (!file) return "Selecione uma imagem."

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return "Formato inválido. Use JPG, PNG ou WEBP."
    }

    if (file.size > MAX_WORK_IMAGE_BYTES) {
        return "A imagem deve ter no máximo 8MB."
    }

    return null
}

export async function uploadWorkImage(input: {
    workId: string
    imageType: WorkImageType
    file: File
}) {
    const validationError = validateWorkImageAttachment(input.file)
    if (validationError) return { error: validationError }

    const safeName = sanitizeFileName(input.file.name)
    const path = `${input.workId}/${input.imageType}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`

    const { error } = await supabase.storage
        .from(WORK_IMAGES_BUCKET)
        .upload(path, input.file, {
            upsert: false,
            cacheControl: "3600",
            contentType: input.file.type,
        })

    if (error) return { error: error.message }

    return { path }
}
