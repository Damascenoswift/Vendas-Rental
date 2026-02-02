"use server"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const allowedRoles = [
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
]

type ImportContactsPayload = {
    rawJson: string
    source?: string
}

export async function importContacts({ rawJson, source }: ImportContactsPayload) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: "Usuário não autenticado." }
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !allowedRoles.includes(role)) {
        return { success: false, error: "Você não tem permissão para importar contatos." }
    }

    const trimmed = rawJson?.trim()
    if (!trimmed) {
        return { success: false, error: "Cole ou envie um JSON válido para importar." }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(trimmed)
    } catch (error) {
        return { success: false, error: "JSON inválido. Verifique a formatação." }
    }

    const items = Array.isArray(parsed) ? parsed : [parsed]
    if (items.length === 0) {
        return { success: false, error: "Nenhum contato encontrado no JSON." }
    }

    const rows: Record<string, unknown>[] = []
    let skipped = 0

    items.forEach((item) => {
        if (!item || typeof item !== "object") {
            skipped += 1
            return
        }

        const normalized = normalizeContact(item as Record<string, unknown>, user.id, source)
        if (!normalized) {
            skipped += 1
            return
        }

        rows.push(normalized)
    })

    if (rows.length === 0) {
        return { success: false, error: "Nenhum contato válido para importar." }
    }

    const chunks = chunkArray(rows, 500)

    for (const chunk of chunks) {
        const { error } = await supabase
            .from("contacts")
            .upsert(chunk, { onConflict: "external_id" })

        if (error) {
            return { success: false, error: `Erro ao salvar contatos: ${error.message}` }
        }
    }

    revalidatePath("/admin/contatos")
    return { success: true, imported: rows.length, skipped, total: items.length }
}

function normalizeContact(
    contact: Record<string, unknown>,
    importedBy: string,
    source?: string
) {
    const firstName = getString(contact.firstname ?? contact.first_name)
    const lastName = getString(contact.lastname ?? contact.last_name)
    const nameFromPayload = getString(contact.name)
    const fullName = getString([firstName, lastName].filter(Boolean).join(" ")) ?? nameFromPayload

    const email = getString(contact.email)?.toLowerCase()
    const importSource =
        getString(source) ?? getString(contact.source) ?? "importacao_json"

    const normalized: Record<string, unknown> = {
        external_id: getString(contact.id),
        source: importSource,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
        phone: getString(contact.phone),
        mobile: getString(contact.mobile),
        whatsapp: getString(contact.whatsapp),
        whatsapp_remote_lid: getString(contact.whatsapp_remote_lid),
        address: getString(contact.address),
        city: getString(contact.city),
        state: getString(contact.state),
        zipcode: getString(contact.zipcode),
        country: getString(contact.country),
        timezone: getString(contact.timezone),
        preferred_locale: getString(contact.preferred_locale),
        cm: getString(contact.cm),
        uc: getString(contact.uc),
        sh_status: getString(contact.sh_status),
        star_score: toInt(contact.star_score) ?? 0,
        created_by: getString(contact.createdBy ?? contact.created_by),
        created_by_name: getString(contact.createdByName ?? contact.created_by_name),
        created_by_type: getString(contact.createdByType ?? contact.created_by_type),
        updated_by: getString(contact.updatedBy ?? contact.updated_by),
        updated_by_name: getString(contact.updatedByName ?? contact.updated_by_name),
        source_created_at: toIso(contact.createDate ?? contact.created_at ?? contact.createdAt),
        source_updated_at: toIso(contact.updatedDate ?? contact.updated_at ?? contact.updatedAt),
        imported_by: importedBy,
        raw_payload: contact,
    }

    const hasData = Object.entries(normalized).some(([key, value]) => {
        if (key === "raw_payload" || key === "imported_by") return false
        return value !== null && value !== undefined && value !== ""
    })

    return hasData ? normalized : null
}

function getString(value: unknown) {
    if (value === null || value === undefined) return null
    const str = String(value).trim()
    return str.length > 0 ? str : null
}

function toIso(value: unknown) {
    const str = getString(value)
    if (!str) return null
    const date = new Date(str)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
}

function toInt(value: unknown) {
    if (value === null || value === undefined || value === "") return null
    const parsed = Number.parseInt(String(value), 10)
    return Number.isNaN(parsed) ? null : parsed
}

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}
