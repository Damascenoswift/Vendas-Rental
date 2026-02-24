"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { assertSupervisorCanAssignInternalVendor } from "@/lib/supervisor-scope"
import { getProfile, type UserProfile } from "@/lib/auth"

const INDICACOES_BUCKET = "indicacoes"
const ROOT_SCAN_LIMIT = 200
const ROOT_SCAN_MAX_PAGES = 10
const STORAGE_BYPASS_RLS_ROLES = new Set([
    "adm_mestre",
    "adm_dorata",
    "funcionario_n1",
    "funcionario_n2",
    "suporte",
    "suporte_tecnico",
    "suporte_limitado",
])

const ALLOWED_FILE_KEYS = [
    "fatura_energia_pf",
    "documento_com_foto_pf",
    "fatura_energia_pj",
    "documento_com_foto_pj",
    "contrato_social",
    "cartao_cnpj",
    "doc_representante",
] as const

type AssetFile = {
    name: string
    url: string | null
}

function normalizeOwnerIds(values: Array<string | null | undefined>) {
    const seen = new Set<string>()
    const normalized: string[] = []

    for (const value of values) {
        const trimmed = value?.trim()
        if (!trimmed || seen.has(trimmed)) continue
        seen.add(trimmed)
        normalized.push(trimmed)
    }

    return normalized
}

function parseMetadata(raw: FormDataEntryValue | null) {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return null
    }

    try {
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null
        }
        return parsed as Record<string, unknown>
    } catch {
        return null
    }
}

function canManageOtherOwners(role?: string | null, department?: UserProfile["department"] | null) {
    if (!role) return false

    const hasFullAccess = role === "adm_mestre" || role === "adm_dorata" || department === "diretoria"
    if (hasFullAccess) return true

    return [
        "supervisor",
        "funcionario_n1",
        "funcionario_n2",
        "suporte",
        "suporte_tecnico",
        "suporte_limitado",
    ].includes(role)
}

type StorageReadResult = {
    ownerId: string | null
    metadata: Record<string, unknown> | null
    files: AssetFile[]
}

async function readOwnerAssets({
    storage,
    ownerId,
    indicationId,
}: {
    storage: ReturnType<ReturnType<typeof createSupabaseServiceClient>["storage"]["from"]>
    ownerId: string
    indicationId: string
}): Promise<StorageReadResult | null> {
    const { data: entries, error: listError } = await storage.list(`${ownerId}/${indicationId}`, {
        limit: 100,
    })

    if (listError || !entries || entries.length === 0) return null

    const hasMetadata = entries.some((entry) => entry.name === "metadata.json")
    let metadata: Record<string, unknown> | null = null

    if (hasMetadata) {
        const { data: metadataFile } = await storage.download(`${ownerId}/${indicationId}/metadata.json`)
        if (metadataFile) {
            try {
                const text = await metadataFile.text()
                const parsed = JSON.parse(text)
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    metadata = parsed as Record<string, unknown>
                }
            } catch {
                metadata = null
            }
        }
    }

    const files = await Promise.all(
        entries
            .filter((entry) => entry.name !== "metadata.json")
            .map(async (entry) => {
                const { data: signed } = await storage.createSignedUrl(
                    `${ownerId}/${indicationId}/${entry.name}`,
                    3600
                )

                return {
                    name: entry.name,
                    url: signed?.signedUrl ?? null,
                } satisfies AssetFile
            })
    )

    if (!metadata && files.length === 0) return null

    return {
        ownerId,
        metadata,
        files,
    }
}

async function readLegacyRootAssets({
    storage,
    indicationId,
}: {
    storage: ReturnType<ReturnType<typeof createSupabaseServiceClient>["storage"]["from"]>
    indicationId: string
}): Promise<StorageReadResult | null> {
    const { data: entries, error: listError } = await storage.list(indicationId, {
        limit: 100,
    })

    if (listError || !entries || entries.length === 0) return null

    const hasMetadata = entries.some((entry) => entry.name === "metadata.json")
    let metadata: Record<string, unknown> | null = null

    if (hasMetadata) {
        const { data: metadataFile } = await storage.download(`${indicationId}/metadata.json`)
        if (metadataFile) {
            try {
                const text = await metadataFile.text()
                const parsed = JSON.parse(text)
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    metadata = parsed as Record<string, unknown>
                }
            } catch {
                metadata = null
            }
        }
    }

    const files = await Promise.all(
        entries
            .filter((entry) => entry.name !== "metadata.json")
            .map(async (entry) => {
                const { data: signed } = await storage.createSignedUrl(
                    `${indicationId}/${entry.name}`,
                    3600
                )

                return {
                    name: entry.name,
                    url: signed?.signedUrl ?? null,
                } satisfies AssetFile
            })
    )

    if (!metadata && files.length === 0) return null

    return {
        ownerId: null,
        metadata,
        files,
    }
}

export async function uploadIndicationAssets(formData: FormData) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: "Não autorizado." }
    }

    const indicationId = String(formData.get("indicationId") ?? "").trim()
    if (!indicationId) {
        return { success: false, error: "Indicação inválida para upload." }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const profile = await getProfile(supabase, user.id)
    if (!profile) {
        return { success: false, error: "Perfil de usuário não encontrado." }
    }

    const { data: indication, error: indicationError } = await supabaseAdmin
        .from("indicacoes")
        .select("id, user_id, marca")
        .eq("id", indicationId)
        .maybeSingle()

    if (indicationError || !indication) {
        return { success: false, error: indicationError?.message ?? "Indicação não encontrada." }
    }

    const ownerIdFromForm = String(formData.get("ownerId") ?? "").trim()
    const targetOwnerId = (indication.user_id ?? ownerIdFromForm).trim()
    if (!targetOwnerId) {
        return { success: false, error: "Não foi possível determinar o dono do arquivo." }
    }

    const canManageOthers = canManageOtherOwners(profile.role, profile.department ?? null)
    if (targetOwnerId !== user.id && !canManageOthers) {
        if (profile.role === "supervisor") {
            const permission = await assertSupervisorCanAssignInternalVendor(user.id, targetOwnerId)
            if (!permission.allowed) {
                return { success: false, error: permission.message }
            }
        } else {
            return { success: false, error: "Sem permissão para enviar arquivos para outro usuário." }
        }
    }

    const storage = supabaseAdmin.storage.from(INDICACOES_BUCKET)
    const metadata = parseMetadata(formData.get("metadata"))

    let metadataError: string | null = null
    if (metadata) {
        const metadataUpload = await storage.upload(
            `${targetOwnerId}/${indicationId}/metadata.json`,
            new Blob([JSON.stringify(metadata)], { type: "application/json" }),
            {
                upsert: true,
                cacheControl: "3600",
                contentType: "application/json",
            }
        )

        if (metadataUpload.error) {
            metadataError = metadataUpload.error.message
        }
    }

    const fileErrors: string[] = []
    const uploadedFiles: string[] = []
    for (const key of ALLOWED_FILE_KEYS) {
        const fileEntry = formData.get(key)
        if (!(fileEntry instanceof File) || fileEntry.size === 0) {
            continue
        }

        const uploadResult = await storage.upload(`${targetOwnerId}/${indicationId}/${key}`, fileEntry, {
            upsert: true,
            cacheControl: "3600",
            contentType: fileEntry.type || undefined,
        })

        if (uploadResult.error) {
            fileErrors.push(`${key}: ${uploadResult.error.message}`)
            continue
        }

        uploadedFiles.push(key)
    }

    return {
        success: !metadataError && fileErrors.length === 0,
        metadataError,
        fileErrors,
        uploadedFiles,
    }
}

export async function getIndicationStorageDetails(params: { indicationId: string; ownerIds?: string[] }) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false as const, error: "Não autorizado." }
    }

    const indicationId = String(params?.indicationId ?? "").trim()
    if (!indicationId) {
        return { success: false as const, error: "Indicação inválida." }
    }

    const profile = await getProfile(supabase, user.id)
    if (!profile) {
        return { success: false as const, error: "Perfil de usuário não encontrado." }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    // Validate access with RLS before using service role on storage.
    const { data: indicationByRls, error: indicationRlsError } = await supabase
        .from("indicacoes")
        .select("id, user_id, created_by_supervisor_id")
        .eq("id", indicationId)
        .maybeSingle()

    let indication = indicationByRls
    if (!indication && STORAGE_BYPASS_RLS_ROLES.has(String(profile.role ?? ""))) {
        const { data: indicationByAdmin, error: indicationAdminError } = await supabaseAdmin
            .from("indicacoes")
            .select("id, user_id, created_by_supervisor_id")
            .eq("id", indicationId)
            .maybeSingle()

        if (indicationAdminError) {
            return {
                success: false as const,
                error: indicationAdminError.message,
            }
        }

        indication = indicationByAdmin
    }

    if (indicationRlsError || !indication) {
        return { success: false as const, error: indicationRlsError?.message ?? "Sem acesso à indicação." }
    }

    const indicationRow = indication as {
        id: string
        user_id: string | null
        created_by_supervisor_id?: string | null
    }

    const storage = supabaseAdmin.storage.from(INDICACOES_BUCKET)

    const checkedOwners = new Set<string>()
    const ownerCandidates = normalizeOwnerIds([
        ...(params.ownerIds ?? []),
        indicationRow.user_id,
        indicationRow.created_by_supervisor_id ?? null,
        user.id,
    ])

    for (const ownerId of ownerCandidates) {
        checkedOwners.add(ownerId)
        const ownerData = await readOwnerAssets({ storage, ownerId, indicationId })
        if (ownerData) {
            return {
                success: true as const,
                ownerId: ownerData.ownerId,
                metadata: ownerData.metadata,
                files: ownerData.files,
            }
        }
    }

    const legacyData = await readLegacyRootAssets({ storage, indicationId })
    if (legacyData) {
        return {
            success: true as const,
            ownerId: legacyData.ownerId,
            metadata: legacyData.metadata,
            files: legacyData.files,
        }
    }

    // Fallback for legacy records with unexpected owner folder.
    for (let page = 0; page < ROOT_SCAN_MAX_PAGES; page += 1) {
        const offset = page * ROOT_SCAN_LIMIT
        const { data: rootItems, error: rootError } = await storage.list("", {
            limit: ROOT_SCAN_LIMIT,
            offset,
        })

        if (rootError || !rootItems || rootItems.length === 0) {
            break
        }

        for (const item of rootItems) {
            const ownerId = item.name?.trim()
            if (!ownerId || checkedOwners.has(ownerId)) continue

            checkedOwners.add(ownerId)
            const ownerData = await readOwnerAssets({ storage, ownerId, indicationId })
            if (ownerData) {
                return {
                    success: true as const,
                    ownerId: ownerData.ownerId,
                    metadata: ownerData.metadata,
                    files: ownerData.files,
                }
            }
        }

        if (rootItems.length < ROOT_SCAN_LIMIT) {
            break
        }
    }

    return {
        success: true as const,
        ownerId: null,
        metadata: null,
        files: [] as AssetFile[],
    }
}
