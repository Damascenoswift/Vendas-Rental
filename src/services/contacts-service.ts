"use server"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import Papa from "papaparse"

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
    rawCsv: string
    source?: string
}

export async function importContacts({ rawCsv, source }: ImportContactsPayload) {
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

    const trimmed = rawCsv?.trim()
    if (!trimmed) {
        return { success: false, error: "Cole ou envie um CSV válido para importar." }
    }

    const delimiter = detectDelimiter(trimmed)
    const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
        header: true,
        skipEmptyLines: true,
        delimiter,
    })

    if (parsed.errors?.length) {
        return { success: false, error: `CSV inválido: ${parsed.errors[0]?.message}` }
    }

    const items = parsed.data ?? []
    if (items.length === 0) {
        return { success: false, error: "Nenhum contato encontrado no CSV." }
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
    const firstName = getString(getField(contact, ["firstname", "first_name", "firstName"]))
    const lastName = getString(getField(contact, ["lastname", "last_name", "lastName"]))
    const nameFromPayload = getString(getField(contact, ["name"]))
    const fullName = getString([firstName, lastName].filter(Boolean).join(" ")) ?? nameFromPayload

    const email = getString(getField(contact, ["email", "e-mail", "e_mail"]))?.toLowerCase()
    const importSource =
        getString(source) ?? getString(contact.source) ?? "importacao_csv"

    const normalized: Record<string, unknown> = {
        external_id: getString(getField(contact, ["id", "external_id", "externalId"])),
        source: importSource,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
        phone: getString(getField(contact, ["phone", "telefone"])),
        mobile: getString(getField(contact, ["mobile", "celular"])),
        whatsapp: getString(getField(contact, ["whatsapp", "whatsappNumber"])),
        whatsapp_remote_lid: getString(getField(contact, ["whatsapp_remote_lid"])),
        address: getString(getField(contact, ["address", "endereco"])),
        city: getString(getField(contact, ["city", "cidade"])),
        state: getString(getField(contact, ["state", "estado", "uf"])),
        zipcode: getString(getField(contact, ["zipcode", "cep"])),
        country: getString(getField(contact, ["country", "pais"])),
        timezone: getString(getField(contact, ["timezone"])),
        preferred_locale: getString(getField(contact, ["preferred_locale", "preferredLocale"])),
        cm: getString(getField(contact, ["cm"])),
        uc: getString(getField(contact, ["uc"])),
        sh_status: getString(getField(contact, ["sh_status"])),
        star_score: toInt(getField(contact, ["star_score"])) ?? 0,
        created_by: getString(getField(contact, ["createdBy", "created_by"])),
        created_by_name: getString(getField(contact, ["createdByName", "created_by_name"])),
        created_by_type: getString(getField(contact, ["createdByType", "created_by_type"])),
        updated_by: getString(getField(contact, ["updatedBy", "updated_by"])),
        updated_by_name: getString(getField(contact, ["updatedByName", "updated_by_name"])),
        source_created_at: toIso(getField(contact, ["createDate", "created_at", "createdAt"])),
        source_updated_at: toIso(getField(contact, ["updatedDate", "updated_at", "updatedAt"])),
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

function getField(contact: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        if (key in contact) {
            const value = contact[key]
            if (value !== undefined && value !== null && String(value).trim() !== "") {
                return value
            }
        }
    }
    return null
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

function detectDelimiter(content: string) {
    const firstLine = content.split(/\r?\n/, 1)[0] ?? ""
    const commaCount = (firstLine.match(/,/g) ?? []).length
    const semicolonCount = (firstLine.match(/;/g) ?? []).length
    if (semicolonCount > commaCount) return ";"
    return ","
}
