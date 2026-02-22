"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import { getSupervisorVisibleUserIds } from "@/lib/supervisor-scope"
import { createTask, type TaskStatus } from "@/services/task-service"

export type WorkCardStatus = "FECHADA" | "PARA_INICIAR" | "EM_ANDAMENTO"
export type WorkPhase = "PROJETO" | "EXECUCAO"
export type WorkImageType = "CAPA" | "PERFIL" | "ANTES" | "DEPOIS"
export type WorkCommentType = "GERAL" | "ENERGISA_RESPOSTA"
export type WorkProcessStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED"
export type WorkSourceMode = "simple" | "complete" | "legacy"

export type WorkTechnicalSnapshot = Record<string, unknown>

export interface WorkCard {
    id: string
    brand: "dorata" | "rental"
    installation_key: string
    codigo_instalacao: string | null
    title: string | null
    status: WorkCardStatus
    completed_at: string | null
    indicacao_id: string | null
    contact_id: string | null
    primary_proposal_id: string | null
    tasks_integration_enabled: boolean
    projeto_liberado_at: string | null
    projeto_liberado_by: string | null
    technical_snapshot: WorkTechnicalSnapshot
    latest_energisa_comment_id: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    indicacao?: {
        id: string
        nome: string | null
        codigo_instalacao: string | null
        user_id: string | null
    } | null
    contact?: {
        id: string
        full_name: string | null
        first_name: string | null
        last_name: string | null
        email: string | null
        whatsapp: string | null
        phone: string | null
        mobile: string | null
    } | null
    progress?: {
        projeto_total: number
        projeto_done: number
        execucao_total: number
        execucao_done: number
    }
    latest_energisa_comment?: WorkComment | null
    cover_image_url?: string | null
}

export interface WorkProposalLink {
    proposal_id: string
    linked_at: string
    is_primary: boolean
    proposal?: {
        id: string
        status: string | null
        source_mode: WorkSourceMode
        created_at: string
        total_power: number | null
    } | null
}

export interface WorkProcessItem {
    id: string
    obra_id: string
    phase: WorkPhase
    title: string
    description: string | null
    status: WorkProcessStatus
    sort_order: number
    due_date: string | null
    started_at: string | null
    completed_at: string | null
    completed_by: string | null
    linked_task_id: string | null
    created_at: string
    updated_at: string
}

export interface WorkComment {
    id: string
    obra_id: string
    user_id: string | null
    comment_type: WorkCommentType
    phase: WorkPhase | null
    content: string
    created_at: string
    user?: {
        id?: string
        name: string | null
        email: string | null
    } | null
}

export interface WorkImage {
    id: string
    obra_id: string
    image_type: WorkImageType
    storage_path: string
    caption: string | null
    sort_order: number
    created_by: string | null
    created_at: string
    signed_url: string | null
}

const INTERNAL_WORK_ROLES = new Set([
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
])

const WORK_IMAGES_BUCKET = "obra-images"
const WORK_IMAGE_PREVIEW_WIDTH = 720
const WORK_IMAGE_PREVIEW_QUALITY = 55
const WORK_IMAGE_PREVIEW_TTL_SECONDS = 60 * 60
const WORK_IMAGE_FULL_TTL_SECONDS = 60 * 10

const PROJECT_TEMPLATE = [
    { sort_order: 1, title: "Validar dados técnicos do orçamento" },
    { sort_order: 2, title: "Validar documentação técnica" },
    { sort_order: 3, title: "Registrar parecer Energisa" },
    { sort_order: 4, title: "Revisar projeto" },
] as const

const EXECUTION_TEMPLATE = [
    { sort_order: 1, title: "Planejar execução" },
    { sort_order: 2, title: "Execução em campo" },
    { sort_order: 3, title: "Upload foto antes" },
    { sort_order: 4, title: "Upload foto depois" },
    { sort_order: 5, title: "Vistoria e encerramento técnico" },
] as const

const FINANCIAL_KEY_TOKENS = [
    "valor",
    "price",
    "cost",
    "margin",
    "commission",
    "comissao",
    "finance",
    "juros",
    "entrada",
    "parcela",
    "balao",
    "lucro",
    "discount",
    "desconto",
    "payback",
    "roi",
    "receita",
    "imposto",
    "tax",
    "frete",
]

const FINANCIAL_EXACT_KEYS = new Set([
    "total_value",
    "total_a_vista",
    "total_financiado",
    "total_financing",
    "total_parcelado",
    "valor_total",
    "valor_final",
    "valor_financiado",
    "valor_entrada",
    "valor_parcela",
    "commission_value",
    "commission_percent",
    "comissao_valor",
    "comissao_percentual",
    "equipment_cost",
    "labor_cost",
    "unit_price",
    "sale_price",
    "final_price",
    "subtotal",
    "total_price",
])

function sanitizeSearchTerm(value?: string | null) {
    if (!value) return ""
    return value
        .replace(/[(),%]/g, " ")
        .replace(/'/g, "")
        .trim()
}

function parseMissingColumnError(message?: string | null) {
    if (!message) return null
    const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i)
    if (!match) return null
    return { column: match[1], table: match[2] }
}

function normalizeWorkCardsError(message?: string | null) {
    const raw = (message ?? "").trim()
    if (!raw) return "Falha ao processar card de obra."

    const normalized = raw.toLowerCase()
    if (
        normalized.includes("obra_cards") &&
        (normalized.includes("does not exist") || normalized.includes("schema cache") || normalized.includes("could not find"))
    ) {
        return "Banco desatualizado: execute a migração 087_work_cards_core.sql."
    }

    if (
        normalized.includes("obra_card_proposals") &&
        (normalized.includes("does not exist") || normalized.includes("schema cache") || normalized.includes("could not find"))
    ) {
        return "Banco desatualizado: execute a migração 087_work_cards_core.sql."
    }

    if (
        normalized.includes("permission denied for table obra_cards") ||
        normalized.includes("permission denied for table obra_card_proposals") ||
        normalized.includes("permission denied for table obra_process_items") ||
        normalized.includes("permission denied for table obra_comments") ||
        normalized.includes("permission denied for table obra_images")
    ) {
        return "Permissões do banco desatualizadas: execute a migração 088_work_cards_service_role_grants.sql."
    }

    return raw
}

function isFinancialKey(key: string) {
    const normalized = key.toLowerCase()
    if (FINANCIAL_EXACT_KEYS.has(normalized)) return true
    if (/^valor($|_)/.test(normalized)) return true
    if (/(^|_)(price|cost|margin|commission|comissao|finance|juros|entrada|parcela|balao|lucro|discount|desconto|payback|roi|receita|imposto|tax|frete)(_|$)/.test(normalized)) {
        return true
    }
    return FINANCIAL_KEY_TOKENS.some((token) => normalized.includes(token))
}

function stripFinancialData(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(stripFinancialData)
    }

    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
        const safeEntries = entries
            .filter(([key]) => !isFinancialKey(key))
            .map(([key, nested]) => [key, stripFinancialData(nested)] as const)

        return Object.fromEntries(safeEntries)
    }

    return value
}

function resolveInstallationKey(args: {
    codigoInstalacao?: string | null
    indicacaoId?: string | null
    proposalId?: string | null
}) {
    const normalizedCode = args.codigoInstalacao?.trim()
    if (normalizedCode) return normalizedCode
    if (args.indicacaoId) return `indicacao:${args.indicacaoId}`
    return `indicacao:${args.proposalId ?? crypto.randomUUID()}`
}

function toTaskStatusFromWorkStatus(status: WorkCardStatus): TaskStatus {
    if (status === "PARA_INICIAR") return "TODO"
    if (status === "EM_ANDAMENTO") return "IN_PROGRESS"
    return "DONE"
}

async function syncWorkTasksByCardStatus(params: {
    obraId: string
    status?: WorkCardStatus | null
}) {
    const supabaseAdmin = createSupabaseServiceClient()
    let workStatus = params.status ?? null

    if (!workStatus) {
        const { data: card, error: cardError } = await supabaseAdmin
            .from("obra_cards" as any)
            .select("status, tasks_integration_enabled")
            .eq("id", params.obraId)
            .maybeSingle()

        if (cardError || !card) {
            console.error("Erro ao carregar obra para sincronizar tarefas:", cardError)
            return
        }

        if (!card.tasks_integration_enabled) return
        workStatus = card.status as WorkCardStatus
    }

    const { data: rows, error: rowsError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("linked_task_id")
        .eq("obra_id", params.obraId)
        .eq("phase", "EXECUCAO")
        .not("linked_task_id", "is", null)

    if (rowsError) {
        console.error("Erro ao buscar tarefas vinculadas da obra:", rowsError)
        return
    }

    const taskIds = Array.from(
        new Set(
            ((rows ?? []) as Array<{ linked_task_id: string | null }>)
                .map((row) => row.linked_task_id)
                .filter((taskId): taskId is string => Boolean(taskId))
        )
    )

    if (taskIds.length === 0) return

    const taskStatus = toTaskStatusFromWorkStatus(workStatus)
    const { error: updateError } = await supabaseAdmin
        .from("tasks")
        .update({ status: taskStatus })
        .in("id", taskIds)

    if (updateError) {
        console.error("Erro ao sincronizar status das tarefas da obra:", updateError)
    }
}

type ProposalForWorkCard = {
    id: string
    status: string | null
    source_mode: WorkSourceMode
    contact_id: string | null
    client_id: string | null
    created_at: string
    updated_at: string
    total_power: number | null
    calculation: Record<string, unknown> | null
}

async function getProposalForWorkCard(params: {
    supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>
    proposalId: string
}) {
    const baseColumns = [
        "id",
        "status",
        "client_id",
        "created_at",
        "updated_at",
        "total_power",
        "calculation",
    ]

    let includeSourceMode = true
    let includeContactId = true

    while (true) {
        const columns = [...baseColumns]
        if (includeSourceMode) columns.push("source_mode")
        if (includeContactId) columns.push("contact_id")

        const { data, error } = await params.supabaseAdmin
            .from("proposals")
            .select(columns.join(", "))
            .eq("id", params.proposalId)
            .maybeSingle()

        if (!error && data) {
            const row = data as Record<string, unknown>
            return {
                proposal: {
                    id: String(row.id),
                    status: typeof row.status === "string" ? row.status : null,
                    source_mode: (typeof row.source_mode === "string" ? row.source_mode : "legacy") as WorkSourceMode,
                    contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
                    client_id: typeof row.client_id === "string" ? row.client_id : null,
                    created_at: String(row.created_at),
                    updated_at: String(row.updated_at),
                    total_power: typeof row.total_power === "number" ? row.total_power : null,
                    calculation: (row.calculation && typeof row.calculation === "object")
                        ? (row.calculation as Record<string, unknown>)
                        : null,
                } satisfies ProposalForWorkCard,
            } as const
        }

        if (!error) {
            return { error: "Orçamento não encontrado." } as const
        }

        const missingColumn = parseMissingColumnError(error.message)
        if (missingColumn?.table === "proposals" && missingColumn.column === "source_mode" && includeSourceMode) {
            includeSourceMode = false
            continue
        }
        if (missingColumn?.table === "proposals" && missingColumn.column === "contact_id" && includeContactId) {
            includeContactId = false
            continue
        }

        return { error: normalizeWorkCardsError(error.message) } as const
    }
}

function buildTechnicalSnapshotFromProposal(input: {
    proposal: {
        id: string
        source_mode: WorkSourceMode
        created_at: string
        updated_at: string
        total_power: number | null
        calculation: Record<string, unknown> | null
    }
    indicacao: {
        id: string | null
        nome: string | null
        codigo_instalacao: string | null
        codigo_cliente: string | null
        unidade_consumidora: string | null
    } | null
}) {
    const calculation = (input.proposal.calculation ?? null) as Record<string, any> | null
    const rawSnapshot = {
        meta: {
            source_mode: input.proposal.source_mode,
            proposal_id: input.proposal.id,
            proposal_created_at: input.proposal.created_at,
            proposal_updated_at: input.proposal.updated_at,
        },
        installation: {
            codigo_instalacao: input.indicacao?.codigo_instalacao ?? null,
            codigo_cliente: input.indicacao?.codigo_cliente ?? null,
            unidade_consumidora: input.indicacao?.unidade_consumidora ?? null,
        },
        customer: {
            indicacao_id: input.indicacao?.id ?? null,
            nome: input.indicacao?.nome ?? null,
        },
        dimensioning: {
            total_power: input.proposal.total_power,
            output_dimensioning: calculation?.output?.dimensioning ?? null,
            inverter: calculation?.output?.dimensioning?.inversor ?? null,
            input_dimensioning: calculation?.input?.dimensioning ?? null,
            structure_quantities: {
                qtd_placas_solo: calculation?.input?.structure?.qtd_placas_solo ?? null,
                qtd_placas_telhado: calculation?.input?.structure?.qtd_placas_telhado ?? null,
            },
        },
    }

    return stripFinancialData(rawSnapshot) as WorkTechnicalSnapshot
}

async function getScopedIndicacaoIdsForRole(params: {
    supabaseAdmin: any
    role: string
    userId: string
}) {
    if (params.role !== "supervisor") return null

    const visibleUserIds = await getSupervisorVisibleUserIds(params.userId)
    const { data, error } = await params.supabaseAdmin
        .from("indicacoes")
        .select("id")
        .in("user_id", visibleUserIds)

    if (error) {
        console.error("Erro ao carregar escopo de supervisor para obras:", error)
        return [] as string[]
    }

    return (data ?? []).map((item: { id: string }) => item.id)
}

async function createWorkImagePreviewSignedUrl(params: {
    storageClient: any
    storagePath: string
}) {
    const previewResult = await params.storageClient.storage
        .from(WORK_IMAGES_BUCKET)
        .createSignedUrl(params.storagePath, WORK_IMAGE_PREVIEW_TTL_SECONDS, {
            transform: {
                width: WORK_IMAGE_PREVIEW_WIDTH,
                quality: WORK_IMAGE_PREVIEW_QUALITY,
            },
        })

    if (!previewResult.error && previewResult.data?.signedUrl) {
        return previewResult.data.signedUrl
    }

    if (previewResult.error) {
        console.warn("Erro ao gerar preview transformado de imagem da obra:", previewResult.error)
    }

    const fallbackResult = await params.storageClient.storage
        .from(WORK_IMAGES_BUCKET)
        .createSignedUrl(params.storagePath, WORK_IMAGE_PREVIEW_TTL_SECONDS)

    if (fallbackResult.error) {
        console.error("Erro ao gerar preview fallback de imagem da obra:", fallbackResult.error)
        return null
    }

    return fallbackResult.data?.signedUrl ?? null
}

async function ensureUserCanAccessWorkModule() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { supabase, user: null, role: null, profile: null } as const
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role ?? null

    if (!role || !INTERNAL_WORK_ROLES.has(role)) {
        return { supabase, user, role: null, profile } as const
    }

    return { supabase, user, role, profile } as const
}

async function ensureProjectTemplate(obraId: string) {
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: existing, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("id")
        .eq("obra_id", obraId)
        .eq("phase", "PROJETO")
        .limit(1)

    if (error) {
        console.error("Erro ao verificar template de projeto:", error)
        return
    }

    if ((existing?.length ?? 0) > 0) return

    const payload = PROJECT_TEMPLATE.map((item) => ({
        obra_id: obraId,
        phase: "PROJETO",
        title: item.title,
        sort_order: item.sort_order,
        status: "TODO",
    }))

    const { error: insertError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .insert(payload)

    if (insertError) {
        console.error("Erro ao inserir template de projeto:", insertError)
    }
}

async function ensureExecutionTemplate(obraId: string) {
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: existing, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("id")
        .eq("obra_id", obraId)
        .eq("phase", "EXECUCAO")
        .limit(1)

    if (error) {
        console.error("Erro ao verificar template de execução:", error)
        return
    }

    if ((existing?.length ?? 0) > 0) return

    const payload = EXECUTION_TEMPLATE.map((item) => ({
        obra_id: obraId,
        phase: "EXECUCAO",
        title: item.title,
        sort_order: item.sort_order,
        status: "TODO",
    }))

    const { error: insertError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .insert(payload)

    if (insertError) {
        console.error("Erro ao inserir template de execução:", insertError)
    }
}

async function refreshWorkStatusFromExecution(obraId: string) {
    const supabaseAdmin = createSupabaseServiceClient()

    const [{ data: card, error: cardError }, { data: executionItems, error: itemsError }] = await Promise.all([
        supabaseAdmin
            .from("obra_cards" as any)
            .select("id, status, completed_at, tasks_integration_enabled")
            .eq("id", obraId)
            .maybeSingle(),
        supabaseAdmin
            .from("obra_process_items" as any)
            .select("status")
            .eq("obra_id", obraId)
            .eq("phase", "EXECUCAO"),
    ])

    if (cardError || !card) {
        console.error("Erro ao atualizar status da obra (card):", cardError)
        return
    }

    if (itemsError) {
        console.error("Erro ao atualizar status da obra (itens):", itemsError)
        return
    }

    const items = (executionItems ?? []) as { status: WorkProcessStatus }[]
    if (items.length === 0) return

    const doneCount = items.filter((item) => item.status === "DONE").length
    const started = items.some((item) => item.status === "IN_PROGRESS" || item.status === "DONE")
    const allDone = doneCount === items.length

    let nextStatus: WorkCardStatus | null = null
    let completedAt: string | null | undefined

    if (allDone) {
        nextStatus = "FECHADA"
        completedAt = new Date().toISOString()
    } else if (started) {
        nextStatus = "EM_ANDAMENTO"
        completedAt = null
    } else {
        nextStatus = "PARA_INICIAR"
        completedAt = null
    }

    if (!nextStatus) return
    const needsCompletedAtUpdate = nextStatus === "FECHADA" && !card.completed_at
    if (nextStatus === card.status && !needsCompletedAtUpdate) return

    const { error: updateError } = await supabaseAdmin
        .from("obra_cards" as any)
        .update({
            status: nextStatus,
            completed_at: completedAt,
        })
        .eq("id", obraId)

    if (updateError) {
        console.error("Erro ao atualizar status calculado da obra:", updateError)
        return
    }

    if (card.tasks_integration_enabled) {
        await syncWorkTasksByCardStatus({
            obraId,
            status: nextStatus,
        })
    }
}

async function ensureExecutionTasksForWork(obraId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { success: false, error: "Sem permissão para sincronizar tarefas." as const }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: card, error: cardError } = await supabaseAdmin
        .from("obra_cards" as any)
        .select("id, title, status, brand, indicacao_id, contact_id, primary_proposal_id")
        .eq("id", obraId)
        .maybeSingle()

    if (cardError || !card) {
        return { success: false, error: cardError?.message ?? "Obra não encontrada." as const }
    }

    const { data: executionItems, error: itemsError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("id, title, description, status, linked_task_id")
        .eq("obra_id", obraId)
        .eq("phase", "EXECUCAO")
        .order("sort_order", { ascending: true })

    if (itemsError) {
        return { success: false, error: itemsError.message as const }
    }

    const items = (executionItems ?? []) as Array<{
        id: string
        title: string
        description: string | null
        status: WorkProcessStatus
        linked_task_id: string | null
    }>

    let created = 0

    for (const item of items) {
        if (item.linked_task_id) continue

        const taskTitle = `[Obra] ${card.title ?? "Sem título"} - ${item.title}`
        const marker = `[obra_process:${item.id}]`
        const taskDescription = [item.description, `Origem: módulo de obras`, marker]
            .filter(Boolean)
            .join("\n")

        const result = await createTask({
            title: taskTitle,
            description: taskDescription,
            priority: "MEDIUM",
            status: toTaskStatusFromWorkStatus(card.status as WorkCardStatus),
            department: "energia",
            brand: card.brand,
            visibility_scope: "TEAM",
            indicacao_id: card.indicacao_id ?? undefined,
            contact_id: card.contact_id ?? undefined,
            proposal_id: card.primary_proposal_id ?? undefined,
            client_name: card.title ?? undefined,
        })

        if (result.error) {
            return { success: false, error: result.error as const }
        }

        const taskId = (result as { taskId?: string | null }).taskId ?? null
        if (!taskId) continue

        const { error: linkError } = await supabaseAdmin
            .from("obra_process_items" as any)
            .update({ linked_task_id: taskId })
            .eq("id", item.id)

        if (linkError) {
            console.error("Erro ao vincular tarefa ao processo de obra:", linkError)
        } else {
            created += 1
        }
    }

    await syncWorkTasksByCardStatus({
        obraId,
        status: card.status as WorkCardStatus,
    })

    revalidatePath("/admin/obras")
    revalidatePath("/admin/tarefas")

    return { success: true, created }
}

export async function upsertWorkCardFromProposal(params: {
    proposalId: string
    actorId?: string | null
    allowNonAccepted?: boolean
}) {
    const supabaseAdmin = createSupabaseServiceClient()

    const proposalResult = await getProposalForWorkCard({
        supabaseAdmin,
        proposalId: params.proposalId,
    })

    if ("error" in proposalResult) {
        return { error: proposalResult.error }
    }

    const proposal = proposalResult.proposal

    const allowNonAccepted = Boolean(params.allowNonAccepted)
    if (!allowNonAccepted && proposal.status !== "accepted") {
        return { skipped: true }
    }

    let indicacao: {
        id: string
        nome: string | null
        marca: "dorata" | "rental" | null
        codigo_instalacao: string | null
        codigo_cliente: string | null
        unidade_consumidora: string | null
    } | null = null

    if (proposal.client_id) {
        const { data: indicacaoData, error: indicacaoError } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, marca, codigo_instalacao, codigo_cliente, unidade_consumidora")
            .eq("id", proposal.client_id)
            .maybeSingle()

        if (indicacaoError) {
            console.error("Erro ao buscar indicação para card de obra:", indicacaoError)
        } else if (indicacaoData) {
            indicacao = indicacaoData as typeof indicacao
        }
    }

    const brand = (indicacao?.marca ?? "dorata") as "dorata" | "rental"
    if (brand !== "dorata") {
        return { skipped: true }
    }

    const installationKey = resolveInstallationKey({
        codigoInstalacao: indicacao?.codigo_instalacao,
        indicacaoId: indicacao?.id ?? proposal.client_id,
        proposalId: proposal.id,
    })

    const technicalSnapshot = buildTechnicalSnapshotFromProposal({
        proposal: {
            id: proposal.id,
            source_mode: proposal.source_mode ?? "legacy",
            created_at: proposal.created_at,
            updated_at: proposal.updated_at,
            total_power: proposal.total_power,
            calculation: proposal.calculation,
        },
        indicacao: indicacao
            ? {
                id: indicacao.id,
                nome: indicacao.nome,
                codigo_instalacao: indicacao.codigo_instalacao,
                codigo_cliente: indicacao.codigo_cliente,
                unidade_consumidora: indicacao.unidade_consumidora,
            }
            : null,
    })

    const { data: existingCardRaw, error: existingCardError } = await supabaseAdmin
        .from("obra_cards" as any)
        .select("id, contact_id")
        .eq("brand", brand)
        .eq("installation_key", installationKey)
        .maybeSingle()

    if (existingCardError) {
        return { error: normalizeWorkCardsError(existingCardError.message) }
    }

    const actorId = params.actorId ?? null
    const cardPayload = {
        brand,
        installation_key: installationKey,
        codigo_instalacao: indicacao?.codigo_instalacao ?? null,
        title: indicacao?.nome ?? "Obra sem nome",
        status: "FECHADA",
        indicacao_id: indicacao?.id ?? proposal.client_id ?? null,
        contact_id: proposal.contact_id ?? null,
        primary_proposal_id: proposal.id,
        technical_snapshot: technicalSnapshot,
        created_by: actorId,
    }

    const existingCard = (existingCardRaw as { id?: string; contact_id?: string | null } | null) ?? null
    let workId = existingCard?.id ?? null

    if (!workId) {
        const { data: inserted, error: insertError } = await supabaseAdmin
            .from("obra_cards" as any)
            .insert(cardPayload)
            .select("id")
            .single()

        if (insertError || !inserted?.id) {
            return { error: normalizeWorkCardsError(insertError?.message ?? "Falha ao criar card de obra.") }
        }

        workId = inserted.id as string
    } else {
        const { error: updateError } = await supabaseAdmin
            .from("obra_cards" as any)
            .update({
                codigo_instalacao: cardPayload.codigo_instalacao,
                title: cardPayload.title,
                indicacao_id: cardPayload.indicacao_id,
                contact_id: cardPayload.contact_id ?? existingCard?.contact_id ?? null,
                primary_proposal_id: cardPayload.primary_proposal_id,
                technical_snapshot: cardPayload.technical_snapshot,
                updated_at: new Date().toISOString(),
            })
            .eq("id", workId)

        if (updateError) {
            return { error: normalizeWorkCardsError(updateError.message) }
        }
    }

    if (!workId) {
        return { error: "Falha ao resolver card de obra." }
    }

    await ensureProjectTemplate(workId)

    const { error: demoteError } = await supabaseAdmin
        .from("obra_card_proposals" as any)
        .update({ is_primary: false })
        .eq("obra_id", workId)

    if (demoteError) {
        console.error("Erro ao rebaixar propostas primárias da obra:", demoteError)
    }

    const { error: linkError } = await supabaseAdmin
        .from("obra_card_proposals" as any)
        .upsert(
            {
                obra_id: workId,
                proposal_id: proposal.id,
                is_primary: true,
                linked_at: new Date().toISOString(),
            },
            { onConflict: "obra_id,proposal_id" }
        )

    if (linkError) {
        return { error: normalizeWorkCardsError(linkError.message) }
    }

    revalidatePath("/admin/obras")
    revalidatePath("/admin/orcamentos")

    return { success: true, workId }
}

export async function backfillWorkCardsFromAcceptedProposals() {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: proposals, error } = await supabaseAdmin
        .from("proposals")
        .select("id")
        .eq("status", "accepted")
        .order("created_at", { ascending: true })

    if (error) {
        return { error: error.message }
    }

    let createdOrUpdated = 0
    for (const proposal of (proposals ?? []) as { id: string }[]) {
        const result = await upsertWorkCardFromProposal({
            proposalId: proposal.id,
            actorId: user.id,
        })

        if (result?.success) createdOrUpdated += 1
    }

    revalidatePath("/admin/obras")
    return { success: true, total: createdOrUpdated }
}

export async function getWorkCards(filters?: {
    status?: WorkCardStatus
    search?: string
    brand?: "dorata" | "rental"
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return [] as WorkCard[]

    const supabaseAdmin = createSupabaseServiceClient()
    const scopedIndicacaoIds = await getScopedIndicacaoIdsForRole({
        supabaseAdmin,
        role,
        userId: user.id,
    })

    if (role === "supervisor" && scopedIndicacaoIds && scopedIndicacaoIds.length === 0) {
        return [] as WorkCard[]
    }

    let query = supabaseAdmin
        .from("obra_cards" as any)
        .select(`
            id,
            brand,
            installation_key,
            codigo_instalacao,
            title,
            status,
            completed_at,
            indicacao_id,
            contact_id,
            primary_proposal_id,
            tasks_integration_enabled,
            projeto_liberado_at,
            projeto_liberado_by,
            technical_snapshot,
            latest_energisa_comment_id,
            created_by,
            created_at,
            updated_at,
            indicacao:indicacoes(id, nome, codigo_instalacao, user_id),
            contact:contacts(id, full_name, first_name, last_name, email, whatsapp, phone, mobile)
        `)
        .order("updated_at", { ascending: false })

    const brand = filters?.brand ?? "dorata"
    query = query.eq("brand", brand)

    if (role === "supervisor" && scopedIndicacaoIds) {
        query = query.in("indicacao_id", scopedIndicacaoIds)
    }

    if (filters?.status) {
        query = query.eq("status", filters.status)
    }

    const sanitizedSearch = sanitizeSearchTerm(filters?.search)
    if (sanitizedSearch) {
        query = query.or(`title.ilike.%${sanitizedSearch}%,codigo_instalacao.ilike.%${sanitizedSearch}%,installation_key.ilike.%${sanitizedSearch}%`)
    }

    const { data, error } = await query

    if (error) {
        console.error("Erro ao buscar cards de obra:", error)
        return [] as WorkCard[]
    }

    const rows = (data ?? []) as WorkCard[]
    if (rows.length === 0) return rows

    const workIds = rows.map((row) => row.id)
    const { data: processRows, error: processError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("obra_id, phase, status")
        .in("obra_id", workIds)

    if (processError) {
        console.error("Erro ao buscar progresso dos processos de obra:", processError)
        return rows
    }

    const { data: coverRows, error: coverError } = await supabaseAdmin
        .from("obra_images" as any)
        .select("obra_id, storage_path, created_at")
        .in("obra_id", workIds)
        .eq("image_type", "CAPA")
        .order("created_at", { ascending: false })

    const coverPathByWorkId = new Map<string, string>()
    if (coverError) {
        console.error("Erro ao buscar capas das obras:", coverError)
    } else {
        for (const row of (coverRows ?? []) as Array<{ obra_id: string; storage_path: string; created_at: string }>) {
            if (!coverPathByWorkId.has(row.obra_id)) {
                coverPathByWorkId.set(row.obra_id, row.storage_path)
            }
        }
    }

    const progressByWorkId = new Map<string, WorkCard["progress"]>()

    for (const row of (processRows ?? []) as { obra_id: string; phase: WorkPhase; status: WorkProcessStatus }[]) {
        const current = progressByWorkId.get(row.obra_id) ?? {
            projeto_total: 0,
            projeto_done: 0,
            execucao_total: 0,
            execucao_done: 0,
        }

        if (row.phase === "PROJETO") {
            current.projeto_total += 1
            if (row.status === "DONE") current.projeto_done += 1
        }

        if (row.phase === "EXECUCAO") {
            current.execucao_total += 1
            if (row.status === "DONE") current.execucao_done += 1
        }

        progressByWorkId.set(row.obra_id, current)
    }

    return Promise.all(rows.map(async (row) => {
        const coverPath = coverPathByWorkId.get(row.id)
        let coverImageUrl: string | null = null

        if (coverPath) {
            coverImageUrl = await createWorkImagePreviewSignedUrl({
                storageClient: supabaseAdmin,
                storagePath: coverPath,
            })
        }

        return {
            ...row,
            cover_image_url: coverImageUrl,
            progress: progressByWorkId.get(row.id) ?? {
                projeto_total: 0,
                projeto_done: 0,
                execucao_total: 0,
                execucao_done: 0,
            },
        } satisfies WorkCard
    }))
}

export async function getWorkCardById(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return null

    const cards = await getWorkCards()
    const found = cards.find((card) => card.id === workId)
    if (!found) return null

    const comments = await getWorkComments(workId)
    const latestEnergisa = comments
        .filter((comment) => comment.comment_type === "ENERGISA_RESPOSTA")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null

    return {
        ...found,
        latest_energisa_comment: latestEnergisa,
    } satisfies WorkCard
}

export async function getWorkProposalLinks(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return [] as WorkProposalLink[]

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_card_proposals" as any)
        .select(`
            proposal_id,
            linked_at,
            is_primary,
            proposal:proposals(id, status, source_mode, created_at, total_power)
        `)
        .eq("obra_id", workId)
        .order("linked_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar vínculos de proposta da obra:", error)
        return [] as WorkProposalLink[]
    }

    return (data ?? []) as WorkProposalLink[]
}

export async function getWorkProcessItems(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return [] as WorkProcessItem[]

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("*")
        .eq("obra_id", workId)
        .order("phase", { ascending: true })
        .order("sort_order", { ascending: true })

    if (error) {
        console.error("Erro ao buscar processos da obra:", error)
        return [] as WorkProcessItem[]
    }

    return (data ?? []) as WorkProcessItem[]
}

export async function addWorkProcessItem(input: {
    workId: string
    phase: WorkPhase
    title: string
    description?: string
    dueDate?: string
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const title = input.title.trim()
    if (!title) return { error: "Título obrigatório." }

    const supabaseAdmin = createSupabaseServiceClient()

    if (input.phase === "EXECUCAO") {
        const { data: card, error: cardError } = await supabaseAdmin
            .from("obra_cards" as any)
            .select("id, projeto_liberado_at")
            .eq("id", input.workId)
            .maybeSingle()

        if (cardError || !card) {
            return { error: cardError?.message ?? "Obra não encontrada." }
        }

        if (!card.projeto_liberado_at) {
            return { error: "Libere o projeto antes de criar processos de execução." }
        }
    }

    const { data: maxOrderRows, error: maxOrderError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("sort_order")
        .eq("obra_id", input.workId)
        .eq("phase", input.phase)
        .order("sort_order", { ascending: false })
        .limit(1)

    if (maxOrderError) {
        return { error: maxOrderError.message }
    }

    const maxOrder = (maxOrderRows?.[0]?.sort_order as number | undefined) ?? 0

    const { data, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .insert({
            obra_id: input.workId,
            phase: input.phase,
            title,
            description: input.description?.trim() || null,
            due_date: input.dueDate || null,
            status: "TODO",
            sort_order: maxOrder + 1,
        })
        .select("*")
        .single()

    if (error || !data) {
        return { error: error?.message ?? "Falha ao criar processo." }
    }

    revalidatePath("/admin/obras")
    return { success: true, item: data as WorkProcessItem }
}

export async function updateWorkProcessItem(input: {
    itemId: string
    updates: Partial<Pick<WorkProcessItem, "title" | "description" | "due_date" | "sort_order">>
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const payload: Record<string, unknown> = {}

    if (typeof input.updates.title === "string") {
        payload.title = input.updates.title.trim()
    }

    if (typeof input.updates.description === "string") {
        payload.description = input.updates.description.trim() || null
    }

    if (typeof input.updates.due_date === "string") {
        payload.due_date = input.updates.due_date || null
    }

    if (typeof input.updates.sort_order === "number") {
        payload.sort_order = input.updates.sort_order
    }

    if (Object.keys(payload).length === 0) {
        return { error: "Nenhuma atualização enviada." }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .update(payload)
        .eq("id", input.itemId)
        .select("*")
        .single()

    if (error || !data) {
        return { error: error?.message ?? "Falha ao atualizar processo." }
    }

    revalidatePath("/admin/obras")
    return { success: true, item: data as WorkProcessItem }
}

export async function setWorkProcessItemStatus(input: {
    itemId: string
    status: WorkProcessStatus
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: current, error: currentError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("id, obra_id, status, phase, linked_task_id, started_at")
        .eq("id", input.itemId)
        .maybeSingle()

    if (currentError || !current) {
        return { error: currentError?.message ?? "Processo não encontrado." }
    }

    const { data: card, error: cardError } = await supabaseAdmin
        .from("obra_cards" as any)
        .select("id, projeto_liberado_at")
        .eq("id", current.obra_id)
        .maybeSingle()

    if (cardError || !card) {
        return { error: cardError?.message ?? "Obra não encontrada." }
    }

    if (current.phase === "EXECUCAO" && !card.projeto_liberado_at) {
        return { error: "Libere o projeto antes de iniciar a execução." }
    }

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
        status: input.status,
    }

    if (input.status === "IN_PROGRESS" && !current.started_at) {
        payload.started_at = now
    }

    if (input.status === "DONE") {
        payload.completed_at = now
        payload.completed_by = user.id
    } else {
        payload.completed_at = null
        payload.completed_by = null
    }

    const { data, error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .update(payload)
        .eq("id", input.itemId)
        .select("*")
        .single()

    if (error || !data) {
        return { error: error?.message ?? "Falha ao atualizar status do processo." }
    }

    await refreshWorkStatusFromExecution(current.obra_id)

    revalidatePath("/admin/obras")
    revalidatePath("/admin/tarefas")

    return { success: true, item: data as WorkProcessItem }
}

export async function deleteWorkProcessItem(itemId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: current, error: currentError } = await supabaseAdmin
        .from("obra_process_items" as any)
        .select("id, obra_id")
        .eq("id", itemId)
        .maybeSingle()

    if (currentError || !current) {
        return { error: currentError?.message ?? "Processo não encontrado." }
    }

    const { error } = await supabaseAdmin
        .from("obra_process_items" as any)
        .delete()
        .eq("id", itemId)

    if (error) {
        return { error: error.message }
    }

    await refreshWorkStatusFromExecution(current.obra_id)

    revalidatePath("/admin/obras")
    return { success: true }
}

export async function toggleWorkTasksIntegration(workId: string, enabled: boolean) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabaseAdmin = createSupabaseServiceClient()
    const { error } = await supabaseAdmin
        .from("obra_cards" as any)
        .update({ tasks_integration_enabled: enabled })
        .eq("id", workId)

    if (error) {
        return { error: error.message }
    }

    if (enabled) {
        const syncResult = await ensureExecutionTasksForWork(workId)
        if (!syncResult.success) {
            return { error: syncResult.error }
        }
    }

    revalidatePath("/admin/obras")
    revalidatePath("/admin/tarefas")

    return { success: true }
}

export async function releaseProjectForExecution(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabaseAdmin = createSupabaseServiceClient()

    const [{ data: card, error: cardError }, { data: projectItems, error: projectError }] = await Promise.all([
        supabaseAdmin
            .from("obra_cards" as any)
            .select("id, status, tasks_integration_enabled")
            .eq("id", workId)
            .maybeSingle(),
        supabaseAdmin
            .from("obra_process_items" as any)
            .select("id, status")
            .eq("obra_id", workId)
            .eq("phase", "PROJETO"),
    ])

    if (cardError || !card) {
        return { error: cardError?.message ?? "Obra não encontrada." }
    }

    if (projectError) {
        return { error: projectError.message }
    }

    const items = (projectItems ?? []) as Array<{ id: string; status: WorkProcessStatus }>
    if (items.length === 0) {
        return { error: "A obra não possui processos de projeto cadastrados." }
    }

    const pending = items.filter((item) => item.status !== "DONE")
    if (pending.length > 0) {
        return { error: "Conclua todos os processos de projeto antes de liberar a obra." }
    }

    const now = new Date().toISOString()

    const { error: updateError } = await supabaseAdmin
        .from("obra_cards" as any)
        .update({
            status: "PARA_INICIAR",
            projeto_liberado_at: now,
            projeto_liberado_by: user.id,
            completed_at: null,
        })
        .eq("id", workId)

    if (updateError) {
        return { error: updateError.message }
    }

    await ensureExecutionTemplate(workId)

    if (card.tasks_integration_enabled) {
        const syncResult = await ensureExecutionTasksForWork(workId)
        if (!syncResult.success) {
            return { error: syncResult.error }
        }

        await syncWorkTasksByCardStatus({
            obraId: workId,
            status: "PARA_INICIAR",
        })
    }

    revalidatePath("/admin/obras")
    revalidatePath("/admin/tarefas")

    return { success: true }
}

export async function getWorkComments(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return [] as WorkComment[]

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_comments" as any)
        .select(`
            id,
            obra_id,
            user_id,
            comment_type,
            phase,
            content,
            created_at,
            user:users(name, email)
        `)
        .eq("obra_id", workId)
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar comentários da obra:", error)
        return [] as WorkComment[]
    }

    return ((data ?? []) as any[]).map((row) => {
        const joinedUser = Array.isArray(row.user) ? (row.user[0] ?? null) : (row.user ?? null)

        return {
            id: row.id,
            obra_id: row.obra_id,
            user_id: row.user_id ?? null,
            comment_type: row.comment_type,
            phase: row.phase ?? null,
            content: row.content,
            created_at: row.created_at,
            user: joinedUser
                ? {
                    name: joinedUser.name ?? null,
                    email: joinedUser.email ?? null,
                }
                : null,
        } satisfies WorkComment
    })
}

export async function addWorkComment(input: {
    workId: string
    content: string
    commentType?: WorkCommentType
    phase?: WorkPhase | null
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const content = input.content.trim()
    if (!content) return { error: "Comentário obrigatório." }

    const commentType = input.commentType ?? "GERAL"

    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_comments" as any)
        .insert({
            obra_id: input.workId,
            user_id: user.id,
            comment_type: commentType,
            phase: input.phase ?? null,
            content,
        })
        .select(`
            id,
            obra_id,
            user_id,
            comment_type,
            phase,
            content,
            created_at,
            user:users(name, email)
        `)
        .single()

    if (error || !data) {
        return { error: error?.message ?? "Falha ao criar comentário." }
    }

    if (commentType === "ENERGISA_RESPOSTA") {
        const { error: updateError } = await supabaseAdmin
            .from("obra_cards" as any)
            .update({ latest_energisa_comment_id: data.id })
            .eq("id", input.workId)

        if (updateError) {
            console.error("Erro ao atualizar comentário Energisa em destaque:", updateError)
        }
    }

    revalidatePath("/admin/obras")

    const joinedUser = Array.isArray((data as any).user)
        ? ((data as any).user[0] ?? null)
        : ((data as any).user ?? null)

    return {
        success: true,
        comment: {
            id: data.id,
            obra_id: data.obra_id,
            user_id: data.user_id ?? null,
            comment_type: data.comment_type,
            phase: data.phase ?? null,
            content: data.content,
            created_at: data.created_at,
            user: joinedUser
                ? {
                    name: joinedUser.name ?? null,
                    email: joinedUser.email ?? null,
                }
                : null,
        } satisfies WorkComment,
    }
}

export async function getWorkImages(workId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return [] as WorkImage[]

    const supabaseAdmin = createSupabaseServiceClient()

    const { data, error } = await supabaseAdmin
        .from("obra_images" as any)
        .select("*")
        .eq("obra_id", workId)
        .order("image_type", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })

    if (error) {
        console.error("Erro ao buscar imagens da obra:", error)
        return [] as WorkImage[]
    }

    const rows = (data ?? []) as Array<{
        id: string
        obra_id: string
        image_type: WorkImageType
        storage_path: string
        caption: string | null
        sort_order: number
        created_by: string | null
        created_at: string
    }>

    const results = await Promise.all(
        rows.map(async (row) => {
            return {
                ...row,
                signed_url: await createWorkImagePreviewSignedUrl({
                    storageClient: supabaseAdmin,
                    storagePath: row.storage_path,
                }),
            } satisfies WorkImage
        })
    )

    return results
}

async function canSupervisorAccessWorkCard(params: {
    supabaseAdmin: any
    userId: string
    obraId: string
}) {
    const scopedIndicacaoIds = await getScopedIndicacaoIdsForRole({
        supabaseAdmin: params.supabaseAdmin,
        role: "supervisor",
        userId: params.userId,
    })

    if (!scopedIndicacaoIds || scopedIndicacaoIds.length === 0) {
        return false
    }

    const { data: cardRow, error } = await params.supabaseAdmin
        .from("obra_cards" as any)
        .select("indicacao_id")
        .eq("id", params.obraId)
        .maybeSingle()

    if (error || !cardRow) {
        console.error("Erro ao validar escopo do supervisor para obra:", error)
        return false
    }

    const indicacaoId = (cardRow as { indicacao_id?: string | null }).indicacao_id
    if (!indicacaoId) {
        return false
    }

    return scopedIndicacaoIds.includes(indicacaoId)
}

export async function getWorkImageOriginalAssetUrls(imageId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const normalizedImageId = imageId.trim()
    if (!normalizedImageId) return { error: "Imagem inválida." }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: row, error: rowError } = await supabaseAdmin
        .from("obra_images" as any)
        .select("id, obra_id, storage_path")
        .eq("id", normalizedImageId)
        .maybeSingle()

    if (rowError || !row) {
        return { error: rowError?.message ?? "Imagem não encontrada." }
    }

    const obraId = (row as { obra_id?: string | null }).obra_id
    const storagePath = (row as { storage_path?: string | null }).storage_path

    if (!obraId || !storagePath) {
        return { error: "Imagem sem arquivo vinculado." }
    }

    if (role === "supervisor") {
        const isAllowed = await canSupervisorAccessWorkCard({
            supabaseAdmin,
            userId: user.id,
            obraId,
        })

        if (!isAllowed) {
            return { error: "Sem permissão para acessar esta imagem." }
        }
    }

    const [viewResult, downloadResult] = await Promise.all([
        supabaseAdmin.storage
            .from(WORK_IMAGES_BUCKET)
            .createSignedUrl(storagePath, WORK_IMAGE_FULL_TTL_SECONDS),
        supabaseAdmin.storage
            .from(WORK_IMAGES_BUCKET)
            .createSignedUrl(storagePath, WORK_IMAGE_FULL_TTL_SECONDS, { download: true }),
    ])

    if (viewResult.error || !viewResult.data?.signedUrl) {
        return { error: viewResult.error?.message ?? "Falha ao gerar URL da imagem." }
    }

    if (downloadResult.error) {
        console.error("Erro ao gerar URL de download da imagem da obra:", downloadResult.error)
    }

    return {
        success: true as const,
        viewUrl: viewResult.data.signedUrl,
        downloadUrl: downloadResult.data?.signedUrl ?? null,
    }
}

export async function addWorkImage(input: {
    workId: string
    imageType: WorkImageType
    storagePath: string
    caption?: string
    sortOrder?: number
}) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    if (!input.storagePath.trim()) return { error: "Caminho da imagem obrigatório." }

    const supabaseAdmin = createSupabaseServiceClient()

    if (input.imageType === "CAPA" || input.imageType === "PERFIL") {
        const { data: existingRows, error: existingRowsError } = await supabaseAdmin
            .from("obra_images" as any)
            .select("id, storage_path")
            .eq("obra_id", input.workId)
            .eq("image_type", input.imageType)

        if (existingRowsError) {
            return { error: existingRowsError.message }
        }

        const storagePaths = ((existingRows ?? []) as Array<{ storage_path: string }>)
            .map((row) => row.storage_path)
            .filter(Boolean)

        if (storagePaths.length > 0) {
            const { error: storageCleanupError } = await supabaseAdmin.storage
                .from(WORK_IMAGES_BUCKET)
                .remove(storagePaths)

            if (storageCleanupError) {
                console.error("Erro ao limpar imagem anterior de capa/perfil:", storageCleanupError)
            }
        }

        const { error: cleanupError } = await supabaseAdmin
            .from("obra_images" as any)
            .delete()
            .eq("obra_id", input.workId)
            .eq("image_type", input.imageType)

        if (cleanupError) {
            return { error: cleanupError.message }
        }
    }

    const { data, error } = await supabaseAdmin
        .from("obra_images" as any)
        .insert({
            obra_id: input.workId,
            image_type: input.imageType,
            storage_path: input.storagePath.trim(),
            caption: input.caption?.trim() || null,
            sort_order: typeof input.sortOrder === "number" ? input.sortOrder : 0,
            created_by: user.id,
        })
        .select("*")
        .single()

    if (error || !data) {
        return { error: error?.message ?? "Falha ao registrar imagem." }
    }

    revalidatePath("/admin/obras")

    return {
        success: true,
        image: data as WorkImage,
    }
}

export async function deleteWorkImage(imageId: string) {
    const { user, role } = await ensureUserCanAccessWorkModule()
    if (!user || !role) return { error: "Sem permissão." }

    const supabase = await createClient()
    const supabaseAdmin = createSupabaseServiceClient()

    const { data: row, error: rowError } = await supabaseAdmin
        .from("obra_images" as any)
        .select("id, storage_path")
        .eq("id", imageId)
        .maybeSingle()

    if (rowError || !row) {
        return { error: rowError?.message ?? "Imagem não encontrada." }
    }

    const storagePath = (row as { storage_path: string }).storage_path

    const { error: deleteStorageError } = await supabase.storage
        .from(WORK_IMAGES_BUCKET)
        .remove([storagePath])

    if (deleteStorageError) {
        console.error("Erro ao remover arquivo da imagem da obra:", deleteStorageError)
    }

    const { error: deleteRowError } = await supabaseAdmin
        .from("obra_images" as any)
        .delete()
        .eq("id", imageId)

    if (deleteRowError) {
        return { error: deleteRowError.message }
    }

    revalidatePath("/admin/obras")
    return { success: true }
}
