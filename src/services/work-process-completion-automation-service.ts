"use server"

import { revalidatePath } from "next/cache"

import { getProfile } from "@/lib/auth"
import {
    getWhatsAppProvider,
    sendWhatsAppTextMessage as sendWhatsAppCloudTextMessage,
    type SendMessageResult,
} from "@/lib/integrations/whatsapp"
import { sendZApiTextMessage } from "@/lib/integrations/whatsapp-zapi"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { createWorkProcessStatusChangedNotifications } from "@/services/notification-service"
import {
    buildWorkProcessCompletionAutomationDedupeKey,
    buildWorkProcessCompletionAutomationMessage,
    isWorkProcessCompletionTransition,
    pickAutomationRecipient,
    type WorkProcessAutomationChannel,
    type WorkProcessAutomationStatus,
} from "@/services/work-process-completion-automation-utils"

type AutomationManagerRole = "adm_mestre" | "adm_dorata"

type AutomationSettingsRow = {
    id: number
    channel_internal_enabled: boolean
    channel_whatsapp_enabled: boolean
    allowed_brands: string[] | null
    updated_by: string | null
    updated_at: string
}

type AutomationLogRow = {
    id: string
    work_id: string
    process_item_id: string
    channel: WorkProcessAutomationChannel
    status: WorkProcessAutomationStatus
    target_user_id: string | null
    recipient_phone: string | null
    reason_code: string | null
    payload: Record<string, unknown> | null
    dedupe_key: string
    created_at: string
}

type WorkCardMinimalRow = {
    id: string
    title: string | null
    brand: string | null
    created_by: string | null
}

type AutomationUserRow = {
    id: string
    name: string | null
    email: string | null
    phone: string | null
}

export type WorkProcessCompletionAutomationSettings = {
    channelInternalEnabled: boolean
    channelWhatsAppEnabled: boolean
    allowedBrands: string[]
    updatedBy: string | null
    updatedAt: string
}

export type WorkProcessCompletionAutomationLogItem = {
    id: string
    createdAt: string
    channel: WorkProcessAutomationChannel
    status: WorkProcessAutomationStatus
    reasonCode: string | null
    workId: string
    workTitle: string | null
    processItemId: string
    processTitle: string | null
    targetUserId: string | null
    targetUserDisplay: string | null
    recipientPhone: string | null
    payload: Record<string, unknown>
}

const SETTINGS_TABLE = "work_process_completion_automation_settings"
const LOGS_TABLE = "work_process_completion_automation_logs"
const AUTOMATION_MANAGER_ROLES: AutomationManagerRole[] = ["adm_mestre", "adm_dorata"]
const DEFAULT_ALLOWED_BRANDS = ["dorata", "rental"]

function toSettingsModel(row: AutomationSettingsRow): WorkProcessCompletionAutomationSettings {
    return {
        channelInternalEnabled: row.channel_internal_enabled,
        channelWhatsAppEnabled: row.channel_whatsapp_enabled,
        allowedBrands: Array.from(new Set((row.allowed_brands ?? []).map((item) => item.trim()).filter(Boolean))),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
    }
}

function normalizeAllowedBrands(value: string[] | null | undefined) {
    const normalized = Array.from(
        new Set((value ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))
    )
    if (normalized.length === 0) {
        return [...DEFAULT_ALLOWED_BRANDS]
    }
    return normalized
}

function isAllowedBrand(allowedBrands: string[], brand?: string | null) {
    const normalizedBrand = (brand ?? "").trim().toLowerCase()
    if (!normalizedBrand) return true
    return allowedBrands.includes(normalizedBrand)
}

function getUserDisplayName(user: AutomationUserRow | null | undefined) {
    return user?.name?.trim() || user?.email?.trim() || "Alguém"
}

async function requireAutomationManager() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Unauthorized" as const }
    }

    const profile = await getProfile(supabase, user.id)
    if (!profile?.role || !AUTOMATION_MANAGER_ROLES.includes(profile.role as AutomationManagerRole)) {
        return { error: "Sem permissão para gerenciar automações." as const }
    }

    return {
        user,
        profile,
    }
}

async function ensureAutomationSettingsRow() {
    const supabaseAdmin = createSupabaseServiceClient()

    const selectColumns = "id, channel_internal_enabled, channel_whatsapp_enabled, allowed_brands, updated_by, updated_at"

    const { data, error } = await supabaseAdmin
        .from(SETTINGS_TABLE as string)
        .select(selectColumns)
        .eq("id", 1)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    if (data) {
        return data as AutomationSettingsRow
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
        .from(SETTINGS_TABLE as string)
        .upsert(
            {
                id: 1,
                channel_internal_enabled: true,
                channel_whatsapp_enabled: false,
                allowed_brands: [...DEFAULT_ALLOWED_BRANDS],
            },
            {
                onConflict: "id",
            }
        )
        .select(selectColumns)
        .maybeSingle()

    if (insertError || !inserted) {
        throw new Error(insertError?.message ?? "Falha ao inicializar configuração de automação.")
    }

    return inserted as AutomationSettingsRow
}

async function insertAutomationLog(input: {
    workId: string
    processItemId: string
    channel: WorkProcessAutomationChannel
    status: WorkProcessAutomationStatus
    dedupeKey: string
    targetUserId?: string | null
    recipientPhone?: string | null
    reasonCode?: string | null
    payload?: Record<string, unknown>
}) {
    const supabaseAdmin = createSupabaseServiceClient()

    const { error } = await supabaseAdmin
        .from(LOGS_TABLE as string)
        .upsert(
            {
                work_id: input.workId,
                process_item_id: input.processItemId,
                channel: input.channel,
                status: input.status,
                target_user_id: input.targetUserId ?? null,
                recipient_phone: input.recipientPhone ?? null,
                reason_code: input.reasonCode ?? null,
                payload: input.payload ?? {},
                dedupe_key: input.dedupeKey,
                created_at: new Date().toISOString(),
            },
            {
                onConflict: "channel,dedupe_key",
            }
        )

    if (error) {
        console.error("Erro ao registrar log de automação de conclusão de obra:", error)
    }
}

async function sendWhatsAppByConfiguredProvider(input: {
    to: string
    text: string
}): Promise<SendMessageResult> {
    const provider = getWhatsAppProvider()

    if (provider === "z_api") {
        return sendZApiTextMessage({
            to: input.to,
            text: input.text,
        })
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: accountData, error: accountError } = await supabaseAdmin
        .from("whatsapp_accounts")
        .select("id, phone_number_id, status")
        .eq("provider", provider)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

    if (accountError || !accountData) {
        return {
            success: false,
            statusCode: 400,
            error: accountError?.message ?? "Nenhuma conta WhatsApp ativa encontrada para o provedor configurado.",
        }
    }

    const phoneNumberId = (accountData as { phone_number_id: string }).phone_number_id

    return sendWhatsAppCloudTextMessage({
        to: input.to,
        text: input.text,
        phoneNumberId,
    })
}

export async function getWorkProcessCompletionAutomationSettingsForAdmin() {
    const auth = await requireAutomationManager()
    if ("error" in auth) return { error: auth.error }

    try {
        const row = await ensureAutomationSettingsRow()
        return {
            settings: toSettingsModel(row),
        }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "Falha ao carregar configuração da automação.",
        }
    }
}

export async function updateWorkProcessCompletionAutomationSettingsForAdmin(input: {
    channelInternalEnabled?: boolean
    channelWhatsAppEnabled?: boolean
}) {
    const auth = await requireAutomationManager()
    if ("error" in auth) return { error: auth.error }

    const shouldUpdateInternal = typeof input.channelInternalEnabled === "boolean"
    const shouldUpdateWhatsApp = typeof input.channelWhatsAppEnabled === "boolean"

    if (!shouldUpdateInternal && !shouldUpdateWhatsApp) {
        return { error: "Nenhuma alteração enviada." }
    }

    try {
        const current = await ensureAutomationSettingsRow()
        const nextInternal = shouldUpdateInternal
            ? Boolean(input.channelInternalEnabled)
            : current.channel_internal_enabled
        const nextWhatsApp = shouldUpdateWhatsApp
            ? Boolean(input.channelWhatsAppEnabled)
            : current.channel_whatsapp_enabled

        const supabaseAdmin = createSupabaseServiceClient()
        const selectColumns = "id, channel_internal_enabled, channel_whatsapp_enabled, allowed_brands, updated_by, updated_at"

        const { data, error } = await supabaseAdmin
            .from(SETTINGS_TABLE as string)
            .update({
                channel_internal_enabled: nextInternal,
                channel_whatsapp_enabled: nextWhatsApp,
                updated_by: auth.user.id,
            })
            .eq("id", 1)
            .select(selectColumns)
            .maybeSingle()

        if (error || !data) {
            return { error: error?.message ?? "Falha ao atualizar configuração da automação." }
        }

        revalidatePath("/admin/automacoes")

        return {
            success: true,
            settings: toSettingsModel(data as AutomationSettingsRow),
        }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "Falha ao atualizar configuração da automação.",
        }
    }
}

export async function getWorkProcessCompletionAutomationLogsForAdmin(limit = 40) {
    const auth = await requireAutomationManager()
    if ("error" in auth) return { error: auth.error }

    const safeLimit = Math.min(Math.max(limit, 1), 200)

    try {
        const supabaseAdmin = createSupabaseServiceClient()

        const { data, error } = await supabaseAdmin
            .from(LOGS_TABLE as string)
            .select("id, work_id, process_item_id, channel, status, target_user_id, recipient_phone, reason_code, payload, dedupe_key, created_at")
            .order("created_at", { ascending: false })
            .limit(safeLimit)

        if (error) {
            return { error: error.message }
        }

        const rows = (data ?? []) as AutomationLogRow[]
        if (rows.length === 0) {
            return { logs: [] as WorkProcessCompletionAutomationLogItem[] }
        }

        const workIds = Array.from(new Set(rows.map((row) => row.work_id).filter(Boolean)))
        const processIds = Array.from(new Set(rows.map((row) => row.process_item_id).filter(Boolean)))
        const targetUserIds = Array.from(new Set(rows.map((row) => row.target_user_id).filter((value): value is string => Boolean(value))))

        const [worksResult, processesResult, usersResult] = await Promise.all([
            workIds.length > 0
                ? supabaseAdmin
                    .from("obra_cards" as string)
                    .select("id, title")
                    .in("id", workIds)
                : Promise.resolve({ data: [], error: null }),
            processIds.length > 0
                ? supabaseAdmin
                    .from("obra_process_items" as string)
                    .select("id, title")
                    .in("id", processIds)
                : Promise.resolve({ data: [], error: null }),
            targetUserIds.length > 0
                ? supabaseAdmin
                    .from("users")
                    .select("id, name, email")
                    .in("id", targetUserIds)
                : Promise.resolve({ data: [], error: null }),
        ])

        if (worksResult.error) {
            console.error("Erro ao carregar títulos de obra para logs da automação:", worksResult.error)
        }

        if (processesResult.error) {
            console.error("Erro ao carregar títulos de etapa para logs da automação:", processesResult.error)
        }

        if (usersResult.error) {
            console.error("Erro ao carregar usuários alvo para logs da automação:", usersResult.error)
        }

        const workById = new Map<string, string | null>()
        ;((worksResult.data ?? []) as Array<{ id: string; title: string | null }>).forEach((row) => {
            workById.set(row.id, row.title)
        })

        const processById = new Map<string, string | null>()
        ;((processesResult.data ?? []) as Array<{ id: string; title: string | null }>).forEach((row) => {
            processById.set(row.id, row.title)
        })

        const targetUserById = new Map<string, string>()
        ;((usersResult.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).forEach((row) => {
            targetUserById.set(row.id, row.name?.trim() || row.email?.trim() || row.id)
        })

        const logs: WorkProcessCompletionAutomationLogItem[] = rows.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            channel: row.channel,
            status: row.status,
            reasonCode: row.reason_code,
            workId: row.work_id,
            workTitle: workById.get(row.work_id) ?? null,
            processItemId: row.process_item_id,
            processTitle: processById.get(row.process_item_id) ?? null,
            targetUserId: row.target_user_id,
            targetUserDisplay: row.target_user_id ? (targetUserById.get(row.target_user_id) ?? row.target_user_id) : null,
            recipientPhone: row.recipient_phone,
            payload: row.payload ?? {},
        }))

        return { logs }
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : "Falha ao carregar logs da automação.",
        }
    }
}

export async function executeWorkProcessCompletionAutomation(input: {
    workId: string
    processItemId: string
    processTitle: string
    oldStatus?: string | null
    newStatus: string
    linkedTaskId?: string | null
    actorUserId: string
    responsibleUserId?: string | null
    dedupeToken?: string | null
}) {
    if (!isWorkProcessCompletionTransition(input.oldStatus, input.newStatus)) {
        return { skipped: true }
    }

    let settingsRow: AutomationSettingsRow

    try {
        settingsRow = await ensureAutomationSettingsRow()
    } catch (error) {
        console.error("Erro ao carregar configuração da automação de conclusão de obra:", error)
        return { skipped: true }
    }

    const dedupeToken = input.dedupeToken?.trim() || new Date().toISOString()
    const internalDedupeKey = buildWorkProcessCompletionAutomationDedupeKey({
        channel: "INTERNAL",
        processItemId: input.processItemId,
        dedupeToken,
    })
    const whatsappDedupeKey = buildWorkProcessCompletionAutomationDedupeKey({
        channel: "WHATSAPP",
        processItemId: input.processItemId,
        dedupeToken,
    })

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: workData, error: workError } = await supabaseAdmin
        .from("obra_cards" as string)
        .select("id, title, brand, created_by")
        .eq("id", input.workId)
        .maybeSingle()

    if (workError || !workData) {
        const reasonCode = "WORK_NOT_FOUND"

        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "INTERNAL",
            status: "FAILED",
            dedupeKey: internalDedupeKey,
            reasonCode,
            payload: {
                error: workError?.message ?? "Obra não encontrada para automação.",
            },
        })

        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "WHATSAPP",
            status: "FAILED",
            dedupeKey: whatsappDedupeKey,
            reasonCode,
            payload: {
                error: workError?.message ?? "Obra não encontrada para automação.",
            },
        })

        return { skipped: true }
    }

    const work = workData as WorkCardMinimalRow
    const allowedBrands = normalizeAllowedBrands(settingsRow.allowed_brands)
    const brandAllowed = isAllowedBrand(allowedBrands, work.brand)

    const userIds = Array.from(new Set([
        input.actorUserId,
        input.responsibleUserId?.trim() || null,
        work.created_by?.trim() || null,
    ].filter((value): value is string => Boolean(value))))

    const usersMap = new Map<string, AutomationUserRow>()

    if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabaseAdmin
            .from("users")
            .select("id, name, email, phone")
            .in("id", userIds)

        if (usersError) {
            console.error("Erro ao carregar usuários para automação de conclusão de obra:", usersError)
        }

        ;((usersData ?? []) as AutomationUserRow[]).forEach((userRow) => {
            usersMap.set(userRow.id, userRow)
        })
    }

    const actor = usersMap.get(input.actorUserId)
    const actorDisplay = getUserDisplayName(actor)

    if (settingsRow.channel_internal_enabled) {
        if (!brandAllowed) {
            await insertAutomationLog({
                workId: input.workId,
                processItemId: input.processItemId,
                channel: "INTERNAL",
                status: "SKIPPED",
                dedupeKey: internalDedupeKey,
                reasonCode: "BRAND_NOT_ALLOWED",
                payload: {
                    work_brand: work.brand,
                    allowed_brands: allowedBrands,
                },
            })
        } else {
            try {
                await createWorkProcessStatusChangedNotifications({
                    workId: input.workId,
                    processItemId: input.processItemId,
                    actorUserId: input.actorUserId,
                    processTitle: input.processTitle,
                    oldStatus: input.oldStatus,
                    newStatus: input.newStatus,
                    linkedTaskId: input.linkedTaskId ?? null,
                    dedupeToken,
                })

                await insertAutomationLog({
                    workId: input.workId,
                    processItemId: input.processItemId,
                    channel: "INTERNAL",
                    status: "SENT",
                    dedupeKey: internalDedupeKey,
                    payload: {
                        event_key: "WORK_PROCESS_STATUS_CHANGED",
                        old_status: input.oldStatus ?? null,
                        new_status: input.newStatus,
                    },
                })
            } catch (error) {
                await insertAutomationLog({
                    workId: input.workId,
                    processItemId: input.processItemId,
                    channel: "INTERNAL",
                    status: "FAILED",
                    dedupeKey: internalDedupeKey,
                    reasonCode: "INTERNAL_DISPATCH_FAILED",
                    payload: {
                        error: error instanceof Error ? error.message : "Erro desconhecido.",
                    },
                })
            }
        }
    } else {
        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "INTERNAL",
            status: "SKIPPED",
            dedupeKey: internalDedupeKey,
            reasonCode: "CHANNEL_DISABLED",
        })
    }

    if (!settingsRow.channel_whatsapp_enabled) {
        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "WHATSAPP",
            status: "SKIPPED",
            dedupeKey: whatsappDedupeKey,
            reasonCode: "CHANNEL_DISABLED",
        })

        return { success: true }
    }

    if (!brandAllowed) {
        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "WHATSAPP",
            status: "SKIPPED",
            dedupeKey: whatsappDedupeKey,
            reasonCode: "BRAND_NOT_ALLOWED",
            payload: {
                work_brand: work.brand,
                allowed_brands: allowedBrands,
            },
        })

        return { success: true }
    }

    const responsibleUser = input.responsibleUserId ? usersMap.get(input.responsibleUserId) : null
    const creatorUser = work.created_by ? usersMap.get(work.created_by) : null

    const recipient = pickAutomationRecipient({
        responsible: input.responsibleUserId
            ? {
                userId: input.responsibleUserId,
                phone: responsibleUser?.phone ?? null,
            }
            : null,
        creator: work.created_by
            ? {
                userId: work.created_by,
                phone: creatorUser?.phone ?? null,
            }
            : null,
    })

    if (!recipient) {
        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "WHATSAPP",
            status: "FAILED",
            dedupeKey: whatsappDedupeKey,
            reasonCode: "NO_VALID_PHONE",
            payload: {
                responsible_user_id: input.responsibleUserId ?? null,
                work_creator_user_id: work.created_by ?? null,
            },
        })

        return { success: true }
    }

    const message = buildWorkProcessCompletionAutomationMessage({
        workTitle: (work.title ?? "").trim() || "Obra sem título",
        processTitle: input.processTitle,
        actorDisplay,
        completedAt: new Date(),
    })

    const sendResult = await sendWhatsAppByConfiguredProvider({
        to: recipient.phone,
        text: message,
    })

    if (!sendResult.success) {
        await insertAutomationLog({
            workId: input.workId,
            processItemId: input.processItemId,
            channel: "WHATSAPP",
            status: "FAILED",
            dedupeKey: whatsappDedupeKey,
            targetUserId: recipient.userId,
            recipientPhone: recipient.phone,
            reasonCode: "WHATSAPP_SEND_FAILED",
            payload: {
                recipient_source: recipient.source,
                provider: getWhatsAppProvider(),
                status_code: sendResult.statusCode,
                error: sendResult.error ?? null,
                raw: sendResult.raw ?? null,
            },
        })

        return { success: true }
    }

    await insertAutomationLog({
        workId: input.workId,
        processItemId: input.processItemId,
        channel: "WHATSAPP",
        status: "SENT",
        dedupeKey: whatsappDedupeKey,
        targetUserId: recipient.userId,
        recipientPhone: recipient.phone,
        payload: {
            recipient_source: recipient.source,
            provider: getWhatsAppProvider(),
            status_code: sendResult.statusCode,
            message_id: sendResult.messageId ?? null,
            old_status: input.oldStatus ?? null,
            new_status: input.newStatus,
        },
    })

    return { success: true }
}
