"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Loader2, MessageCircle, Paperclip, Trash2 } from "lucide-react"
import {
    addWorkComment,
    addWorkExpense,
    addWorkImage,
    addWorkProcessItem,
    deleteWorkComment,
    deleteWorkImage,
    deleteWorkProcessItem,
    getWorkCardById,
    getWorkComments,
    getWorkExpenses,
    getWorkImageOriginalAssetUrls,
    getWorkImages,
    getWorkProcessItems,
    getWorkProposalLinks,
    getWorkResponsibleUsers,
    reprocessWorkTechnicalSnapshot,
    releaseProjectForExecution,
    setWorkCardStatus,
    setWorkProcessItemStatus,
    toggleWorkTasksIntegration,
    updateWorkCardLocation,
    updateWorkProcessItem,
    type WorkCard,
    type WorkComment,
    type WorkExpense,
    type WorkImage,
    type WorkImageType,
    type WorkProcessItem,
    type WorkProcessStatus,
    type WorkProposalLink,
    type WorkResponsibleUserOption,
} from "@/services/work-cards-service"
import { uploadWorkImage, validateWorkImageAttachment } from "@/lib/work-images"
import {
    MAX_WORK_COMMENT_ATTACHMENT_BYTES,
    MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
    uploadWorkCommentAttachments,
    validateWorkCommentAttachmentFiles
} from "@/lib/work-comment-attachments"
import {
    uploadWorkExpenseAttachment,
    validateWorkExpenseAttachment,
} from "@/lib/work-expense-attachments"
import { useToast } from "@/hooks/use-toast"
import { useAuthSession } from "@/hooks/use-auth-session"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { getProductRealtimeInfo, type ProductRealtimeInfo } from "@/services/product-service"
import { formatManualContractProductionEstimateInput } from "@/lib/proposal-contract-estimate"
import { getProposalStakeholderContacts } from "@/lib/proposal-stakeholders"
import { resolveWorkCardStatusLabel, type WorkCardCompletionMode } from "@/lib/work-card-status"
import {
    canonicalWorkProjectProcessBaseTitle,
    formatWorkProjectProcessTitle,
    isWorkProjectProtocolProcess,
    normalizeWorkProjectProcessBaseTitle,
    parseWorkProjectProcessTitle,
    WORK_PROJECT_PROCESS_LINKED_LABEL,
    WORK_PROJECT_PROCESS_PRIMARY_LABEL,
    type WorkProjectProcessScope,
} from "@/lib/work-project-process"

function processStatusLabel(status: WorkProcessStatus) {
    if (status === "TODO") return "A Fazer"
    if (status === "IN_PROGRESS") return "Em Andamento"
    if (status === "DONE") return "Concluído"
    return "Bloqueado"
}

function protocolStatusLabel(status: WorkProcessStatus) {
    if (status === "DONE") return "Aprovado com obra"
    if (status === "BLOCKED") return "Indeferido"
    return "Em andamento"
}

function normalizeProtocolStatusForSelect(status: WorkProcessStatus): WorkProcessStatus {
    if (status === "DONE") return "DONE"
    if (status === "BLOCKED") return "BLOCKED"
    return "IN_PROGRESS"
}

function formatDateTime(value?: string | null) {
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed)
}

function normalizeLikelyWhatsAppPhone(value: string | null | undefined) {
    const digits = (value || "").replace(/\D/g, "")
    if (!digits) return ""
    if (digits.length < 10 || digits.length > 13) return ""
    if (digits.startsWith("0")) return ""
    return digits
}

function formatWhatsAppNumber(value: string | null | undefined) {
    const digits = normalizeLikelyWhatsAppPhone(value)
    if (!digits) return "-"
    if (digits.length <= 4) return digits
    if (digits.length <= 10) return `+${digits}`

    const ddi = digits.slice(0, 2)
    const ddd = digits.slice(2, 4)
    const number = digits.slice(4)

    if (number.length === 9) {
        return `+${ddi} (${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
    }

    if (number.length === 8) {
        return `+${ddi} (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`
    }

    return `+${digits}`
}

function buildWhatsAppStartPath(params: {
    contactId?: string | null
    phone?: string | null
    name?: string | null
}) {
    const query = new URLSearchParams()

    const normalizedPhone = normalizeLikelyWhatsAppPhone(params.phone)
    const normalizedName = (params.name || "").trim()
    const normalizedContactId = (params.contactId || "").trim()

    if (normalizedPhone) {
        query.set("startPhone", normalizedPhone)
    } else if (normalizedContactId) {
        query.set("startContact", normalizedContactId)
    }

    if (normalizedName) {
        query.set("startName", normalizedName)
    }

    const queryString = query.toString()
    return queryString ? `/admin/whatsapp?${queryString}` : null
}

function formatAttachmentSize(size: number | null | undefined) {
    if (!size || size <= 0) return "0 B"
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

function parseCurrencyInput(value: string) {
    const cleaned = value
        .replace(/\s/g, "")
        .replace(/[R$]/gi, "")

    const normalized = cleaned.includes(",") && cleaned.includes(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.includes(",")
            ? cleaned.replace(",", ".")
            : cleaned

    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return null
    return parsed
}

const WORK_COMMENT_ATTACHMENT_MAX_MB = Math.round(MAX_WORK_COMMENT_ATTACHMENT_BYTES / (1024 * 1024))

function getSnapshotValue(snapshot: unknown, path: string): unknown {
    if (!snapshot || typeof snapshot !== "object") return null
    const keys = path.split(".")
    let current: unknown = snapshot

    for (const key of keys) {
        if (!current || typeof current !== "object" || Array.isArray(current)) return null
        current = (current as Record<string, unknown>)[key]
    }

    return current ?? null
}

function formatSnapshotValue(value: unknown, format?: "number" | "integer" | "datetime", unit?: string) {
    if (value === null || value === undefined || value === "") return "-"

    if (format === "datetime") {
        return formatDateTime(String(value))
    }

    if (format === "number" || format === "integer") {
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) return "-"
        const valueText =
            format === "integer"
                ? parsed.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                : parsed.toLocaleString("pt-BR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                })
        return unit ? `${valueText} ${unit}` : valueText
    }

    return String(value)
}

function formatManualContractEstimateDisplay(snapshot: unknown) {
    const rawEstimate = getSnapshotValue(snapshot, "contract.manual_production_estimate")
    const formatted = formatManualContractProductionEstimateInput(rawEstimate)
    return formatted || "-"
}

function getSnapshotNumber(snapshot: unknown, path: string) {
    const raw = getSnapshotValue(snapshot, path)
    if (raw === null || raw === undefined || raw === "") return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeSnapshotInverterType(value: unknown) {
    if (typeof value !== "string") return null
    const normalized = value.trim().toUpperCase()
    if (normalized === "STRING") return "STRING"
    if (normalized === "MICRO") return "MICRO"
    if (normalized === "AMPLIACAO") return "AMPLIACAO"
    return null
}

function normalizeSnapshotInverterKind(value: string | null) {
    if (!value) return null
    const normalized = value.trim().toUpperCase()
    if (normalized.includes("MICRO")) return "MICRO"
    if (normalized.includes("STRING")) return "STRING"
    return null
}

function getSnapshotTechnicalPowerKwp(snapshot: unknown) {
    const qtdModulos = getSnapshotNumber(snapshot, "dimensioning.input_dimensioning.qtd_modulos")
    const potenciaModuloW = getSnapshotNumber(snapshot, "dimensioning.input_dimensioning.potencia_modulo_w")
    if (!qtdModulos || !potenciaModuloW) return null
    const computed = (qtdModulos * potenciaModuloW) / 1000
    return Number.isFinite(computed) && computed > 0 ? computed : null
}

function getSnapshotStringInvertersByProduct(snapshot: unknown) {
    const raw = getSnapshotValue(snapshot, "dimensioning.input_dimensioning.string_inverters")
    const byProductId = new Map<string, number>()
    if (!Array.isArray(raw)) return byProductId

    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue
        const row = entry as Record<string, unknown>
        const productId = typeof row.product_id === "string" ? row.product_id.trim() : ""
        if (!productId) continue
        const quantityRaw = Number(row.quantity)
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1
        byProductId.set(productId, (byProductId.get(productId) ?? 0) + quantity)
    }

    return byProductId
}

function formatInverterModels(snapshot: unknown) {
    const labels = getSnapshotInverters(snapshot)
        .map((item) => {
            const modelOrName = typeof item.model === "string" && item.model.trim()
                ? item.model.trim()
                : typeof item.name === "string" && item.name.trim()
                    ? item.name.trim()
                    : null
            if (!modelOrName) return null

            const kind = typeof item.inverter_type === "string" && item.inverter_type.trim()
                ? ` (${item.inverter_type.trim().toUpperCase()})`
                : ""
            const quantity = Number(item.quantity)
            const quantityLabel = Number.isFinite(quantity) && quantity > 0 ? ` x${quantity}` : ""

            return `${modelOrName}${kind}${quantityLabel}`
        })
        .filter((value): value is string => Boolean(value))

    if (labels.length === 0) return "-"
    return labels.join(" | ")
}

function formatTotalInverterQuantity(snapshot: unknown) {
    const total = getSnapshotInverters(snapshot)
        .reduce((acc, item) => (
            item.quantity && Number.isFinite(item.quantity) ? acc + item.quantity : acc
        ), 0)

    return total > 0 ? total.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "-"
}

type SnapshotModule = {
    product_id: string | null
    name: string | null
    model: string | null
    manufacturer: string | null
    power_w: number | null
}

type SnapshotInverter = {
    product_id: string | null
    name: string | null
    model: string | null
    manufacturer: string | null
    inverter_type: string | null
    quantity: number | null
    power_kw: number | null
    power_w: number | null
    purchase_required: boolean
}

type TechnicalProductTarget = {
    product_id: string
    title: string
    subtitle: string
    purchase_required?: boolean
}

function getSnapshotModule(snapshot: unknown): SnapshotModule | null {
    const raw = getSnapshotValue(snapshot, "equipment.module")
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const row = raw as Record<string, unknown>
    const powerRaw = Number(row.power ?? row.power_w)
    return {
        product_id: typeof row.product_id === "string" ? row.product_id : null,
        name: typeof row.name === "string" ? row.name : null,
        model: typeof row.model === "string" ? row.model : null,
        manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
        power_w: Number.isFinite(powerRaw) ? powerRaw : null,
    }
}

function getSnapshotInverters(snapshot: unknown): SnapshotInverter[] {
    const raw = getSnapshotValue(snapshot, "equipment.inverters")
    if (!Array.isArray(raw)) return []

    const parsed = raw
        .map((item) => {
            if (!item || typeof item !== "object") return null
            const row = item as Record<string, unknown>
            const quantityRaw = Number(row.quantity)
            const powerKwRaw = Number(row.power_kw)
            const powerWRaw = Number(row.power_w ?? row.power)
            return {
                product_id: typeof row.product_id === "string" ? row.product_id : null,
                name: typeof row.name === "string" ? row.name : null,
                model: typeof row.model === "string" ? row.model : null,
                manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
                inverter_type: typeof row.inverter_type === "string" ? row.inverter_type : null,
                quantity: Number.isFinite(quantityRaw) ? quantityRaw : null,
                power_kw: Number.isFinite(powerKwRaw) && powerKwRaw > 0 ? powerKwRaw : null,
                power_w: Number.isFinite(powerWRaw) && powerWRaw > 0 ? powerWRaw : null,
                purchase_required: row.purchase_required === true,
            } satisfies SnapshotInverter
        })
        .filter((item): item is SnapshotInverter => Boolean(item))

    if (parsed.length === 0) return []

    const inputInverterType = normalizeSnapshotInverterType(
        getSnapshotValue(snapshot, "dimensioning.input_dimensioning.tipo_inversor")
    )

    if (inputInverterType === "AMPLIACAO") {
        return []
    }

    const expectedByProductId = getSnapshotStringInvertersByProduct(snapshot)
    if (expectedByProductId.size > 0) {
        const filtered: SnapshotInverter[] = []

        for (const item of parsed) {
            const productId = item.product_id
            if (!productId) continue

            const remaining = expectedByProductId.get(productId) ?? 0
            if (remaining <= 0) continue

            const sourceQuantity = item.quantity && item.quantity > 0 ? item.quantity : 0
            const selectedQuantity = sourceQuantity > 0 ? Math.min(sourceQuantity, remaining) : remaining
            if (selectedQuantity <= 0) continue

            filtered.push({
                ...item,
                quantity: selectedQuantity,
            })
            expectedByProductId.set(productId, remaining - selectedQuantity)
        }

        if (filtered.length > 0) {
            return filtered
        }
    }

    if (inputInverterType === "MICRO") {
        const microOnly = parsed.filter((item) => normalizeSnapshotInverterKind(item.inverter_type) === "MICRO")
        if (microOnly.length > 0) return microOnly
    }

    if (inputInverterType === "STRING") {
        const nonMicro = parsed.filter((item) => normalizeSnapshotInverterKind(item.inverter_type) !== "MICRO")
        if (nonMicro.length > 0) return nonMicro
    }

    return parsed
}

function formatInverterManufacturers(snapshot: unknown) {
    const manufacturers = getSnapshotInverters(snapshot)
        .map((row) => row.manufacturer?.trim())
        .filter((value): value is string => Boolean(value))

    const unique = Array.from(new Set(manufacturers))
    if (unique.length === 0) return "-"
    return unique.join(" | ")
}

function formatInverterPowers(snapshot: unknown) {
    const labels = getSnapshotInverters(snapshot)
        .map((row) => {
            const powerKw = row.power_kw ?? (row.power_w && row.power_w > 0 ? row.power_w / 1000 : null)
            if (!powerKw || !Number.isFinite(powerKw)) return null
            const quantity = row.quantity && row.quantity > 0 ? ` x${row.quantity}` : ""
            const powerLabel = powerKw.toLocaleString("pt-BR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
            })
            return `${powerLabel} kW${quantity}`
        })
        .filter((value): value is string => Boolean(value))

    if (labels.length === 0) return "-"
    return labels.join(" | ")
}

function formatModuleSelectionLabel(item: SnapshotModule) {
    const name = item.model || item.name || "Placa sem nome"
    const manufacturer = item.manufacturer ? ` • ${item.manufacturer}` : ""
    const power = item.power_w && item.power_w > 0
        ? ` • ${Number(item.power_w).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} W`
        : ""
    return `${name}${manufacturer}${power}`
}

function formatInverterSelectionLabel(item: SnapshotInverter) {
    const modelOrName = item.model || item.name || "Inversor"
    const manufacturer = item.manufacturer ? ` • ${item.manufacturer}` : ""
    const powerKw = item.power_kw ?? (item.power_w && item.power_w > 0 ? item.power_w / 1000 : null)
    const power = powerKw
        ? ` • ${powerKw.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kW`
        : ""
    const quantity = item.quantity && item.quantity > 0 ? ` x${item.quantity}` : ""
    return `${modelOrName}${manufacturer}${power}${quantity}`
}

function buildTechnicalSnapshotRows(snapshot: unknown) {
    const moduleFromSnapshot = getSnapshotModule(snapshot)
    const technicalPowerKwp = getSnapshotTechnicalPowerKwp(snapshot)
    const inputInverterType = getSnapshotValue(snapshot, "dimensioning.input_dimensioning.tipo_inversor")
    const outputInverterType = getSnapshotValue(snapshot, "dimensioning.inverter.tipo")
    const inputQtdString = getSnapshotNumber(snapshot, "dimensioning.input_dimensioning.qtd_inversor_string")
    const outputQtdString = getSnapshotNumber(snapshot, "dimensioning.inverter.qtd_string")
    const inputQtdMicro = getSnapshotNumber(snapshot, "dimensioning.input_dimensioning.qtd_inversor_micro")
    const outputQtdMicro = getSnapshotNumber(snapshot, "dimensioning.inverter.qtd_micro")
    const inputPotStringKw = getSnapshotNumber(snapshot, "dimensioning.input_dimensioning.potencia_inversor_string_kw")
    const outputPotStringKw = getSnapshotNumber(snapshot, "dimensioning.inverter.pot_string_kw")
    const outputPotMicroTotalKw = getSnapshotNumber(snapshot, "dimensioning.inverter.pot_micro_total_kw")

    let manualPotMicroTotalKw: number | null = null
    if (inputQtdMicro !== null) {
        if (inputQtdMicro <= 0) {
            manualPotMicroTotalKw = 0
        } else if (outputPotMicroTotalKw !== null && outputQtdMicro !== null && outputQtdMicro > 0) {
            manualPotMicroTotalKw = outputPotMicroTotalKw * (inputQtdMicro / outputQtdMicro)
        }
    }

    const inverterType = inputInverterType ?? outputInverterType
    const qtdInversorString = inputQtdString ?? outputQtdString
    const qtdMicroInversor = inputQtdMicro ?? outputQtdMicro
    const potenciaInversorStringKw = inputPotStringKw ?? outputPotStringKw
    const potenciaMicroTotalKw = manualPotMicroTotalKw ?? outputPotMicroTotalKw

    const rows = [
        {
            label: "Origem do orçamento",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.source_mode")),
        },
        {
            label: "Orçamento",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.proposal_id")),
        },
        {
            label: "Atualizado em",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "meta.proposal_updated_at"), "datetime"),
        },
        {
            label: "Código da instalação",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.codigo_instalacao")),
        },
        {
            label: "Código do cliente",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.codigo_cliente")),
        },
        {
            label: "Unidade consumidora",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "installation.unidade_consumidora")),
        },
        {
            label: "Quantidade de módulos",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.qtd_modulos"), "integer"),
        },
        {
            label: "Potência do módulo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.potencia_modulo_w"), "number", "W"),
        },
        {
            label: "Potência da placa selecionada",
            value: formatSnapshotValue(moduleFromSnapshot?.power_w, "number", "W"),
        },
        {
            label: "Modelo do módulo",
            value: formatSnapshotValue(
                getSnapshotValue(snapshot, "equipment.module.model") ??
                    getSnapshotValue(snapshot, "equipment.module.name")
            ),
        },
        {
            label: "Fabricante do módulo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "equipment.module.manufacturer")),
        },
        {
            label: "Potência total",
            value: formatSnapshotValue(
                technicalPowerKwp ??
                    getSnapshotValue(snapshot, "dimensioning.output_dimensioning.kWp") ??
                    getSnapshotValue(snapshot, "dimensioning.total_power"),
                "number",
                "kWp"
            ),
        },
        {
            label: "Produção estimada",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.output_dimensioning.kWh_estimado"), "number", "kWh"),
        },
        {
            label: "Tipo de inversor",
            value: formatSnapshotValue(inverterType),
        },
        {
            label: "Modelo(s) de inversor(es)",
            value: formatInverterModels(snapshot),
        },
        {
            label: "Marca(s) de inversor(es)",
            value: formatInverterManufacturers(snapshot),
        },
        {
            label: "Potência(s) de inversor(es)",
            value: formatInverterPowers(snapshot),
        },
        {
            label: "Qtd. inversor(es)",
            value: formatTotalInverterQuantity(snapshot),
        },
        {
            label: "Qtd. inversor string",
            value: formatSnapshotValue(qtdInversorString, "integer"),
        },
        {
            label: "Qtd. micro inversor",
            value: formatSnapshotValue(qtdMicroInversor, "integer"),
        },
        {
            label: "Potência inversor string",
            value: formatSnapshotValue(potenciaInversorStringKw, "number", "kW"),
        },
        {
            label: "Potência micro total",
            value: formatSnapshotValue(potenciaMicroTotalKw, "number", "kW"),
        },
        {
            label: "Índice de produção",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.indice_producao"), "number"),
        },
        {
            label: "Fator de oversizing",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.input_dimensioning.fator_oversizing"), "number"),
        },
        {
            label: "Placas em solo",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.structure_quantities.qtd_placas_solo"), "integer"),
        },
        {
            label: "Placas em telhado",
            value: formatSnapshotValue(getSnapshotValue(snapshot, "dimensioning.structure_quantities.qtd_placas_telhado"), "integer"),
        },
    ]

    return rows.filter((row) => row.value !== "-")
}

type TechnicalSnapshotSection = {
    key: string
    proposalId: string | null
    isPrimary: boolean
    module: SnapshotModule | null
    inverters: SnapshotInverter[]
    manualContractEstimate: string
    rows: Array<{ label: string; value: string }>
}

type ProjectProcessListEntry = {
    item: WorkProcessItem
    baseTitle: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function buildTechnicalSnapshotSections(snapshot: unknown): TechnicalSnapshotSection[] {
    const rootSnapshot = asRecord(snapshot)
    if (!rootSnapshot) return []

    const rootPrimaryProposalId = getSnapshotValue(snapshot, "meta.primary_proposal_id")
    const primaryProposalId =
        typeof rootPrimaryProposalId === "string" && rootPrimaryProposalId.trim().length > 0
            ? rootPrimaryProposalId.trim()
            : null

    const proposalSnapshots = Array.isArray(rootSnapshot.proposals) && rootSnapshot.proposals.length > 0
        ? rootSnapshot.proposals
        : [snapshot]

    return proposalSnapshots
        .map((entry, index) => {
            const entryRecord = asRecord(entry)
            if (!entryRecord) return null

            const proposalIdFromMeta = getSnapshotValue(entry, "meta.proposal_id")
            const proposalId =
                typeof proposalIdFromMeta === "string" && proposalIdFromMeta.trim().length > 0
                    ? proposalIdFromMeta.trim()
                    : null

            const isPrimaryByEntry = entryRecord.is_primary === true
            const isPrimary = primaryProposalId
                ? proposalId === primaryProposalId
                : isPrimaryByEntry || index === 0

            return {
                key: proposalId ?? `snapshot-${index}`,
                proposalId,
                isPrimary,
                module: getSnapshotModule(entry),
                inverters: getSnapshotInverters(entry),
                manualContractEstimate: formatManualContractEstimateDisplay(entry),
                rows: buildTechnicalSnapshotRows(entry),
            } satisfies TechnicalSnapshotSection
        })
        .filter((entry): entry is TechnicalSnapshotSection => Boolean(entry))
}

function ImageGallery({
    label,
    items,
    onOpenImage,
    onDelete,
}: {
    label: string
    items: WorkImage[]
    onOpenImage: (image: WorkImage) => void
    onDelete: (imageId: string) => Promise<void>
}) {
    return (
        <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-semibold">{label}</p>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma imagem.</p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {items.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-md border">
                            {image.signed_url ? (
                                <button
                                    type="button"
                                    className="block w-full"
                                    onClick={() => onOpenImage(image)}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={image.signed_url}
                                        alt={image.caption || "Imagem da obra"}
                                        className="h-32 w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            ) : (
                                <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-muted-foreground">
                                    Sem preview
                                </div>
                            )}
                            <div className="space-y-2 p-2">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {image.caption || "Sem descrição"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Toque na imagem para abrir em alta.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => onDelete(image.id)}
                                >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Excluir
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function WorkDetailsDialog({
    workId,
    open,
    onOpenChange,
    onChanged,
}: {
    workId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged?: () => void
}) {
    const { showToast } = useToast()
    const { session } = useAuthSession()
    const currentUserId = session?.user?.id ?? null

    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const [work, setWork] = useState<WorkCard | null>(null)
    const [processItems, setProcessItems] = useState<WorkProcessItem[]>([])
    const [responsibleUsers, setResponsibleUsers] = useState<WorkResponsibleUserOption[]>([])
    const [comments, setComments] = useState<WorkComment[]>([])
    const [images, setImages] = useState<WorkImage[]>([])
    const [workExpenses, setWorkExpenses] = useState<WorkExpense[]>([])
    const [proposalLinks, setProposalLinks] = useState<WorkProposalLink[]>([])
    const [workAddress, setWorkAddress] = useState("")
    const [statusDraft, setStatusDraft] = useState<WorkCard["status"]>("FECHADA")

    const [newProjectItem, setNewProjectItem] = useState("")
    const [newExecutionItem, setNewExecutionItem] = useState("")
    const [newExecutionResponsibleId, setNewExecutionResponsibleId] = useState("")
    const [newEnergisaComment, setNewEnergisaComment] = useState("")
    const [newGeneralComment, setNewGeneralComment] = useState("")
    const [replyTargetCommentId, setReplyTargetCommentId] = useState<string | null>(null)
    const [newExpenseDescription, setNewExpenseDescription] = useState("")
    const [newExpenseAmount, setNewExpenseAmount] = useState("")
    const [newExpenseFile, setNewExpenseFile] = useState<File | null>(null)
    const [commentAttachmentFiles, setCommentAttachmentFiles] = useState<File[]>([])

    const [uploadType, setUploadType] = useState<WorkImageType>("ANTES")
    const [uploadCaption, setUploadCaption] = useState("")
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const generalCommentInputRef = useRef<HTMLTextAreaElement>(null)
    const commentAttachmentInputRef = useRef<HTMLInputElement>(null)
    const expenseAttachmentInputRef = useRef<HTMLInputElement>(null)

    const [viewerOpen, setViewerOpen] = useState(false)
    const [viewerLoading, setViewerLoading] = useState(false)
    const [viewerImage, setViewerImage] = useState<WorkImage | null>(null)
    const [viewerViewUrl, setViewerViewUrl] = useState<string | null>(null)
    const [viewerDownloadUrl, setViewerDownloadUrl] = useState<string | null>(null)
    const [viewerError, setViewerError] = useState<string | null>(null)
    const [productDialogOpen, setProductDialogOpen] = useState(false)
    const [productDialogLoading, setProductDialogLoading] = useState(false)
    const [selectedTechnicalProduct, setSelectedTechnicalProduct] = useState<TechnicalProductTarget | null>(null)
    const [selectedProductInfo, setSelectedProductInfo] = useState<ProductRealtimeInfo | null>(null)
    const [productDialogError, setProductDialogError] = useState<string | null>(null)

    const projectItems = useMemo(
        () => processItems.filter((item) => item.phase === "PROJETO"),
        [processItems]
    )
    const projectItemsByScope = useMemo(() => {
        const grouped = {
            PRIMARY: [] as ProjectProcessListEntry[],
            LINKED: [] as ProjectProcessListEntry[],
            unscoped: [] as ProjectProcessListEntry[],
        }

        for (const item of projectItems) {
            const parsed = parseWorkProjectProcessTitle(item.title)
            const entry = {
                item,
                baseTitle: canonicalWorkProjectProcessBaseTitle(parsed.baseTitle),
            } satisfies ProjectProcessListEntry

            if (parsed.scope === "PRIMARY") {
                grouped.PRIMARY.push(entry)
                continue
            }

            if (parsed.scope === "LINKED") {
                grouped.LINKED.push(entry)
                continue
            }

            grouped.unscoped.push(entry)
        }

        return grouped
    }, [projectItems])
    const projectStartItemByScope = useMemo(() => {
        const result: Record<WorkProjectProcessScope, WorkProcessItem | null> = {
            PRIMARY: null,
            LINKED: null,
        }

        for (const item of projectItems) {
            const parsed = parseWorkProjectProcessTitle(item.title)
            if (!parsed.scope) continue
            if (normalizeWorkProjectProcessBaseTitle(parsed.baseTitle) !== "projeto iniciado") continue

            if (!result[parsed.scope]) {
                result[parsed.scope] = item
            }
        }

        return result
    }, [projectItems])

    const executionItems = useMemo(
        () => processItems.filter((item) => item.phase === "EXECUCAO"),
        [processItems]
    )
    const executionItemsByScope = useMemo(() => {
        const grouped = {
            PRIMARY: [] as ProjectProcessListEntry[],
            LINKED: [] as ProjectProcessListEntry[],
            unscoped: [] as ProjectProcessListEntry[],
        }

        for (const item of executionItems) {
            const parsed = parseWorkProjectProcessTitle(item.title)
            const entry = {
                item,
                baseTitle: canonicalWorkProjectProcessBaseTitle(parsed.baseTitle),
            } satisfies ProjectProcessListEntry

            if (parsed.scope === "PRIMARY") {
                grouped.PRIMARY.push(entry)
                continue
            }

            if (parsed.scope === "LINKED") {
                grouped.LINKED.push(entry)
                continue
            }

            grouped.unscoped.push(entry)
        }

        return grouped
    }, [executionItems])
    const stakeholderContacts = useMemo(
        () => getProposalStakeholderContacts(work?.technical_snapshot ?? null),
        [work?.technical_snapshot]
    )
    const ownerName = stakeholderContacts.owner.name
    const ownerWhatsapp = stakeholderContacts.owner.whatsapp
    const billingSource = stakeholderContacts.billingSource
    const linkedFinancialContactName = useMemo(() => {
        const fullName = work?.contact?.full_name?.trim()
        if (fullName) return fullName

        const firstName = work?.contact?.first_name?.trim() || ""
        const lastName = work?.contact?.last_name?.trim() || ""
        return [firstName, lastName].filter(Boolean).join(" ").trim()
    }, [work?.contact?.first_name, work?.contact?.full_name, work?.contact?.last_name])
    const linkedFinancialWhatsapp = useMemo(
        () => normalizeLikelyWhatsAppPhone(work?.contact?.whatsapp || work?.contact?.phone || work?.contact?.mobile),
        [work?.contact?.mobile, work?.contact?.phone, work?.contact?.whatsapp]
    )
    const financialContactName = useMemo(() => {
        if (billingSource === "owner") {
            return ownerName
        }

        if (billingSource === "custom") {
            return stakeholderContacts.billing.name || linkedFinancialContactName
        }

        return linkedFinancialContactName
    }, [billingSource, linkedFinancialContactName, ownerName, stakeholderContacts.billing.name])
    const financialWhatsapp = useMemo(() => {
        if (billingSource === "owner") {
            return ownerWhatsapp
        }

        if (billingSource === "custom") {
            return stakeholderContacts.billing.whatsapp || linkedFinancialWhatsapp
        }

        return linkedFinancialWhatsapp
    }, [
        billingSource,
        linkedFinancialWhatsapp,
        ownerWhatsapp,
        stakeholderContacts.billing.whatsapp,
    ])
    const financialSourceLabel = useMemo(() => {
        if (billingSource === "owner") return "Mesmo do dono da obra"
        if (billingSource === "custom") return "Contato financeiro manual"
        return "Contato vinculado do orçamento"
    }, [billingSource])
    const ownerWhatsAppHref = useMemo(
        () => buildWhatsAppStartPath({ phone: ownerWhatsapp, name: ownerName }),
        [ownerName, ownerWhatsapp]
    )
    const financialWhatsAppHref = useMemo(
        () =>
            buildWhatsAppStartPath({
                phone: financialWhatsapp || null,
                contactId: financialWhatsapp ? null : work?.contact_id,
                name: financialContactName,
            }),
        [financialContactName, financialWhatsapp, work?.contact_id]
    )

    const canReleaseProject = useMemo(() => {
        if (!work) return false
        return !work.projeto_liberado_at
    }, [work])

    const latestEnergisaComment = useMemo(
        () => comments.find((item) => item.comment_type === "ENERGISA_RESPOSTA") ?? null,
        [comments]
    )

    const energisaHistory = useMemo(
        () => comments.filter((item) => item.comment_type === "ENERGISA_RESPOSTA"),
        [comments]
    )

    const generalComments = useMemo(
        () => comments.filter((item) => item.comment_type === "GERAL"),
        [comments]
    )
    const generalCommentThreads = useMemo(() => {
        const byId = new Map<string, WorkComment>()
        generalComments.forEach((comment) => {
            byId.set(comment.id, comment)
        })

        const topLevel: WorkComment[] = []
        const repliesByParent = new Map<string, WorkComment[]>()

        generalComments.forEach((comment) => {
            const parentId = comment.parent_comment_id
            if (parentId && byId.has(parentId)) {
                const current = repliesByParent.get(parentId) ?? []
                current.push(comment)
                repliesByParent.set(parentId, current)
                return
            }
            topLevel.push(comment)
        })

        const sortByDateAsc = (left: WorkComment, right: WorkComment) =>
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime()

        const sortByDateDesc = (left: WorkComment, right: WorkComment) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime()

        topLevel.sort(sortByDateDesc)

        return topLevel.map((comment) => ({
            comment,
            replies: (repliesByParent.get(comment.id) ?? []).sort(sortByDateAsc),
        }))
    }, [generalComments])
    const replyTargetComment = useMemo(
        () => generalComments.find((comment) => comment.id === replyTargetCommentId) ?? null,
        [generalComments, replyTargetCommentId]
    )

    const responsibleUserById = useMemo(
        () => new Map(responsibleUsers.map((user) => [user.id, user] as const)),
        [responsibleUsers]
    )

    const totalExpenses = useMemo(
        () => workExpenses.reduce((sum, item) => sum + item.amount, 0),
        [workExpenses]
    )

    const loadData = useCallback(async () => {
        if (!workId) return

        setIsLoading(true)
        try {
            const [card, items, commentsData, imagesData, expensesData, links, users] = await Promise.all([
                getWorkCardById(workId),
                getWorkProcessItems(workId),
                getWorkComments(workId),
                getWorkImages(workId),
                getWorkExpenses(workId),
                getWorkProposalLinks(workId),
                getWorkResponsibleUsers(),
            ])

            setWork(card)
            setWorkAddress(card?.work_address ?? "")
            setStatusDraft(card?.status ?? "FECHADA")
            setProcessItems(items)
            setComments(commentsData)
            setImages(imagesData)
            setWorkExpenses(expensesData)
            setProposalLinks(links)
            setResponsibleUsers(users)
        } finally {
            setIsLoading(false)
        }
    }, [workId])

    useEffect(() => {
        if (!open || !workId) return
        void loadData()
    }, [open, workId, loadData])

    useEffect(() => {
        if (!replyTargetCommentId) return
        if (replyTargetComment) return
        setReplyTargetCommentId(null)
    }, [replyTargetComment, replyTargetCommentId])

    async function handleReleaseProject() {
        if (!workId) return
        setIsSaving(true)
        try {
            const result = await releaseProjectForExecution(workId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Projeto liberado", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleSaveWorkAddress() {
        if (!workId) return
        const normalized = workAddress.trim()
        if (!normalized) {
            showToast({ title: "Endereço obrigatório", description: "Informe o endereço da obra.", variant: "error" })
            return
        }

        setIsSaving(true)
        try {
            const result = await updateWorkCardLocation({
                workId,
                workAddress: normalized,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Endereço salvo", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleReprocessTechnicalSnapshot() {
        if (!workId) return

        setIsSaving(true)
        try {
            const result = await reprocessWorkTechnicalSnapshot(workId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({
                title: "Dados técnicos reprocessados",
                description: result.warning ?? "Snapshot técnico da obra atualizado com os orçamentos vinculados.",
                variant: "success",
            })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleUpdateWorkStatus(
        status?: WorkCard["status"],
        completionMode?: WorkCardCompletionMode
    ) {
        if (!workId || !work) return
        const nextStatus = status ?? statusDraft
        if (nextStatus === work.status && !completionMode) return

        setIsSaving(true)
        try {
            const result = await setWorkCardStatus({
                workId,
                status: nextStatus,
                completionMode,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Status da obra atualizado", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    function handleExpenseAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null
        setNewExpenseFile(file)
    }

    async function handleAddWorkExpense() {
        if (!workId) return
        const description = newExpenseDescription.trim()
        if (!description) {
            showToast({ title: "Descrição obrigatória", description: "Descreva a despesa da obra.", variant: "error" })
            return
        }

        const parsedAmount = parseCurrencyInput(newExpenseAmount)
        if (!parsedAmount || parsedAmount <= 0) {
            showToast({ title: "Valor inválido", description: "Informe um valor de despesa válido.", variant: "error" })
            return
        }

        if (newExpenseFile) {
            const attachmentError = validateWorkExpenseAttachment(newExpenseFile)
            if (attachmentError) {
                showToast({ title: "Anexo inválido", description: attachmentError, variant: "error" })
                return
            }
        }

        setIsSaving(true)
        try {
            let uploadedAttachment: {
                path: string
                name: string
                size: number | null
                content_type: string | null
            } | null = null

            if (newExpenseFile) {
                const uploadResult = await uploadWorkExpenseAttachment(workId, newExpenseFile)
                if (uploadResult.error || !uploadResult.attachment) {
                    showToast({ title: "Erro no upload", description: uploadResult.error ?? "Falha ao anexar arquivo.", variant: "error" })
                    return
                }
                uploadedAttachment = uploadResult.attachment
            }

            const result = await addWorkExpense({
                workId,
                description,
                amount: parsedAmount,
                attachment: uploadedAttachment,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            setNewExpenseDescription("")
            setNewExpenseAmount("")
            setNewExpenseFile(null)
            if (expenseAttachmentInputRef.current) {
                expenseAttachmentInputRef.current.value = ""
            }

            showToast({ title: "Despesa registrada", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleToggleTaskIntegration(checked: boolean) {
        if (!workId) return

        setIsSaving(true)
        try {
            const result = await toggleWorkTasksIntegration(workId, checked)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Integração atualizada", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleProcessStatusChange(itemId: string, status: WorkProcessStatus) {
        setIsSaving(true)
        try {
            const result = await setWorkProcessItemStatus({ itemId, status })
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleAddProcessItem(phase: "PROJETO" | "EXECUCAO") {
        if (!workId) return

        const title = phase === "PROJETO" ? newProjectItem : newExecutionItem
        if (!title.trim()) return

        setIsSaving(true)
        try {
            const result = await addWorkProcessItem({
                workId,
                phase,
                title,
                responsibleUserId: phase === "EXECUCAO" && newExecutionResponsibleId
                    ? newExecutionResponsibleId
                    : null,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            if (phase === "PROJETO") setNewProjectItem("")
            if (phase === "EXECUCAO") {
                setNewExecutionItem("")
                setNewExecutionResponsibleId("")
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleProcessResponsibleChange(itemId: string, responsibleUserId: string) {
        setIsSaving(true)
        try {
            const result = await updateWorkProcessItem({
                itemId,
                updates: {
                    responsible_user_id: responsibleUserId || null,
                },
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteProcessItem(itemId: string) {
        setIsSaving(true)
        try {
            const result = await deleteWorkProcessItem(itemId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleAddEnergisaComment() {
        if (!workId || !newEnergisaComment.trim()) return

        setIsSaving(true)
        try {
            const result = await addWorkComment({
                workId,
                content: newEnergisaComment,
                commentType: "ENERGISA_RESPOSTA",
                phase: "PROJETO",
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            setNewEnergisaComment("")
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    function handleGeneralCommentAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
        setCommentAttachmentFiles(Array.from(event.target.files ?? []))
    }

    function getCommentAuthorLabel(comment: WorkComment) {
        return comment.user?.name || comment.user?.email || "Usuário interno"
    }

    function getCommentPreview(comment: WorkComment) {
        const normalized = comment.content.replace(/\s+/g, " ").trim()
        if (!normalized) return "Sem conteúdo"
        if (normalized.length <= 120) return normalized
        return `${normalized.slice(0, 120)}...`
    }

    function handleStartReply(comment: WorkComment) {
        setReplyTargetCommentId(comment.id)
        generalCommentInputRef.current?.focus()
    }

    function clearReplyTarget() {
        setReplyTargetCommentId(null)
    }

    async function handleAddGeneralComment() {
        if (!workId) return
        if (!newGeneralComment.trim()) return

        const validationError = validateWorkCommentAttachmentFiles(commentAttachmentFiles, {
            maxCount: MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
        })
        if (validationError) {
            showToast({ title: "Anexo inválido", description: validationError, variant: "error" })
            return
        }

        setIsSaving(true)
        try {
            let uploadedAttachments: Array<{
                path: string
                name: string
                size: number | null
                content_type: string | null
            }> = []
            let uploadFailedCount = 0

            if (commentAttachmentFiles.length > 0) {
                const uploadResult = await uploadWorkCommentAttachments(workId, commentAttachmentFiles, {
                    maxCount: MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT,
                })
                uploadFailedCount = uploadResult.failed.length

                if (uploadResult.error && uploadResult.uploaded.length === 0) {
                    showToast({ title: "Erro no upload", description: uploadResult.error, variant: "error" })
                    return
                }

                uploadedAttachments = uploadResult.uploaded
            }

            const result = await addWorkComment({
                workId,
                content: newGeneralComment,
                commentType: "GERAL",
                phase: work?.projeto_liberado_at ? "EXECUCAO" : "PROJETO",
                parentCommentId: replyTargetCommentId,
                attachments: uploadedAttachments,
            })

            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            setNewGeneralComment("")
            setReplyTargetCommentId(null)
            setCommentAttachmentFiles([])
            if (commentAttachmentInputRef.current) {
                commentAttachmentInputRef.current.value = ""
            }

            if (uploadFailedCount > 0) {
                showToast({
                    title: "Comentário salvo com ressalvas",
                    description: `${uploadFailedCount} anexo(s) não foram enviados.`,
                    variant: "error",
                })
            } else {
                showToast({ title: "Comentário salvo", variant: "success" })
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteComment(comment: WorkComment) {
        if (!comment.user_id || comment.user_id !== currentUserId) {
            showToast({ title: "Sem permissão", description: "Você só pode excluir seus próprios comentários.", variant: "error" })
            return
        }

        const confirmed = window.confirm("Deseja excluir este comentário?")
        if (!confirmed) return

        setIsSaving(true)
        try {
            const result = await deleteWorkComment(comment.id)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            showToast({ title: "Comentário excluído", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    async function handleUploadImage() {
        if (!workId || !uploadFile) return

        const validationError = validateWorkImageAttachment(uploadFile)
        if (validationError) {
            showToast({ title: "Arquivo inválido", description: validationError, variant: "error" })
            return
        }

        setIsSaving(true)
        try {
            const uploadResult = await uploadWorkImage({
                workId,
                imageType: uploadType,
                file: uploadFile,
            })

            if (uploadResult.error || !uploadResult.path) {
                showToast({ title: "Erro no upload", description: uploadResult.error ?? "Falha ao enviar imagem.", variant: "error" })
                return
            }

            const saveResult = await addWorkImage({
                workId,
                imageType: uploadType,
                storagePath: uploadResult.path,
                caption: uploadCaption,
            })

            if (saveResult.error) {
                showToast({ title: "Erro", description: saveResult.error, variant: "error" })
                return
            }

            setUploadFile(null)
            setUploadCaption("")
            await loadData()
            onChanged?.()
            showToast({ title: "Imagem adicionada", variant: "success" })
        } finally {
            setIsSaving(false)
        }
    }

    async function handleOpenImageViewer(image: WorkImage) {
        setViewerOpen(true)
        setViewerImage(image)
        setViewerLoading(true)
        setViewerViewUrl(null)
        setViewerDownloadUrl(null)
        setViewerError(null)

        try {
            const result = await getWorkImageOriginalAssetUrls(image.id)
            if (result.error || !result.viewUrl) {
                const errorMessage = result.error ?? "Falha ao carregar imagem em alta."
                setViewerError(errorMessage)
                showToast({ title: "Erro", description: errorMessage, variant: "error" })
                return
            }

            setViewerViewUrl(result.viewUrl)
            setViewerDownloadUrl(result.downloadUrl ?? null)
        } finally {
            setViewerLoading(false)
        }
    }

    function handleViewerOpenChange(nextOpen: boolean) {
        setViewerOpen(nextOpen)
        if (nextOpen) return

        setViewerLoading(false)
        setViewerImage(null)
        setViewerViewUrl(null)
        setViewerDownloadUrl(null)
        setViewerError(null)
    }

    function handleProductDialogOpenChange(nextOpen: boolean) {
        setProductDialogOpen(nextOpen)
        if (nextOpen) return

        setProductDialogLoading(false)
        setSelectedTechnicalProduct(null)
        setSelectedProductInfo(null)
        setProductDialogError(null)
    }

    async function handleOpenTechnicalProduct(target: TechnicalProductTarget) {
        setSelectedTechnicalProduct(target)
        setSelectedProductInfo(null)
        setProductDialogError(null)
        setProductDialogLoading(true)
        setProductDialogOpen(true)

        try {
            const realtimeInfo = await getProductRealtimeInfo(target.product_id)
            if (!realtimeInfo) {
                setProductDialogError("Produto não encontrado no estoque atual.")
                return
            }
            setSelectedProductInfo(realtimeInfo)
        } catch (error) {
            console.error("Erro ao carregar produto em tempo real:", error)
            setProductDialogError("Não foi possível carregar os dados atuais do produto.")
        } finally {
            setProductDialogLoading(false)
        }
    }

    async function handleDeleteImage(imageId: string) {
        setIsSaving(true)
        try {
            const result = await deleteWorkImage(imageId)
            if (result.error) {
                showToast({ title: "Erro", description: result.error, variant: "error" })
                return
            }

            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null
        setUploadFile(file)
    }

    const coverImages = images.filter((item) => item.image_type === "CAPA")
    const profileImages = images.filter((item) => item.image_type === "PERFIL")
    const beforeImages = images.filter((item) => item.image_type === "ANTES")
    const afterImages = images.filter((item) => item.image_type === "DEPOIS")

    const technicalSections = useMemo(
        () => buildTechnicalSnapshotSections(work?.technical_snapshot ?? {}),
        [work?.technical_snapshot],
    )
    const hasPrimaryTechnicalSection = useMemo(
        () => technicalSections.some((section) => section.isPrimary),
        [technicalSections],
    )
    const hasLinkedTechnicalSection = useMemo(
        () => technicalSections.some((section) => !section.isPrimary),
        [technicalSections],
    )
    const hasBothTechnicalSections = hasPrimaryTechnicalSection && hasLinkedTechnicalSection
    const shouldShowStartButton = (scope: WorkProjectProcessScope) => {
        if (scope === "PRIMARY") return hasBothTechnicalSections ? true : hasPrimaryTechnicalSection
        return hasBothTechnicalSections ? true : hasLinkedTechnicalSection
    }

    async function handleStartProjectByScope(scope: WorkProjectProcessScope) {
        if (!workId) return

        setIsSaving(true)
        try {
            const existingStartItem = projectStartItemByScope[scope]
            let targetItemId = existingStartItem?.id ?? null

            if (!targetItemId) {
                const createResult = await addWorkProcessItem({
                    workId,
                    phase: "PROJETO",
                    title: formatWorkProjectProcessTitle("Projeto iniciado", scope),
                })

                if (createResult.error || !createResult.item) {
                    showToast({ title: "Erro", description: createResult.error ?? "Falha ao iniciar projeto.", variant: "error" })
                    return
                }

                targetItemId = createResult.item.id
            } else if (existingStartItem?.status === "IN_PROGRESS" || existingStartItem?.status === "DONE") {
                showToast({
                    title: existingStartItem.status === "DONE" ? "Projeto já concluído" : "Projeto já iniciado",
                    variant: "success",
                })
                return
            }

            const statusResult = await setWorkProcessItemStatus({
                itemId: targetItemId,
                status: "IN_PROGRESS",
            })

            if (statusResult.error) {
                showToast({ title: "Erro", description: statusResult.error, variant: "error" })
                return
            }

            showToast({ title: "Projeto iniciado", variant: "success" })
            await loadData()
            onChanged?.()
        } finally {
            setIsSaving(false)
        }
    }
    const renderProjectProcessEntry = (entry: ProjectProcessListEntry) => {
        const protocolProcess = isWorkProjectProtocolProcess(entry.baseTitle)
        const statusValue = protocolProcess
            ? normalizeProtocolStatusForSelect(entry.item.status)
            : entry.item.status

        return (
            <div key={entry.item.id} className="rounded-md border bg-white p-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entry.baseTitle}</p>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDeleteProcessItem(entry.item.id)}
                        disabled={isSaving}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <Select
                        value={statusValue}
                        onValueChange={(value) => handleProcessStatusChange(entry.item.id, value as WorkProcessStatus)}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {protocolProcess ? (
                                <>
                                    <SelectItem value="BLOCKED">{protocolStatusLabel("BLOCKED")}</SelectItem>
                                    <SelectItem value="DONE">{protocolStatusLabel("DONE")}</SelectItem>
                                    <SelectItem value="IN_PROGRESS">{protocolStatusLabel("IN_PROGRESS")}</SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="TODO">{processStatusLabel("TODO")}</SelectItem>
                                    <SelectItem value="IN_PROGRESS">{processStatusLabel("IN_PROGRESS")}</SelectItem>
                                    <SelectItem value="BLOCKED">{processStatusLabel("BLOCKED")}</SelectItem>
                                    <SelectItem value="DONE">{processStatusLabel("DONE")}</SelectItem>
                                </>
                            )}
                        </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                        Concluído: {formatDateTime(entry.item.completed_at)}
                    </span>
                </div>
            </div>
        )
    }
    const renderExecutionProcessEntry = (entry: ProjectProcessListEntry) => (
        <div key={entry.item.id} className="rounded-md border bg-white p-2">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{entry.baseTitle}</p>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => handleDeleteProcessItem(entry.item.id)}
                    disabled={isSaving}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="mt-2 grid gap-2 xl:grid-cols-[220px_1fr_auto]">
                <Select
                    value={entry.item.status}
                    onValueChange={(value) => handleProcessStatusChange(entry.item.id, value as WorkProcessStatus)}
                    disabled={isSaving}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="TODO">{processStatusLabel("TODO")}</SelectItem>
                        <SelectItem value="IN_PROGRESS">{processStatusLabel("IN_PROGRESS")}</SelectItem>
                        <SelectItem value="BLOCKED">{processStatusLabel("BLOCKED")}</SelectItem>
                        <SelectItem value="DONE">{processStatusLabel("DONE")}</SelectItem>
                    </SelectContent>
                </Select>
                <Select
                    value={entry.item.responsible_user_id || "__none__"}
                    onValueChange={(value) =>
                        handleProcessResponsibleChange(entry.item.id, value === "__none__" ? "" : value)
                    }
                    disabled={isSaving}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {responsibleUsers.map((user) => (
                            <SelectItem key={`exec-responsible-${entry.item.id}-${user.id}`} value={user.id}>
                                {user.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {entry.item.linked_task_id ? (
                    <Link href={`/admin/tarefas?openTask=${entry.item.linked_task_id}`} className="text-xs underline">
                        Abrir tarefa
                    </Link>
                ) : (
                    <span className="text-xs text-muted-foreground">Sem tarefa vinculada</span>
                )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                Responsável atual: {entry.item.responsible_user_id
                    ? (responsibleUserById.get(entry.item.responsible_user_id)?.name ?? "Usuário não encontrado")
                    : "Sem responsável"}
            </p>
        </div>
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        <span>{work?.title || "Obra"}</span>
                        {work ? (
                            <Badge variant="outline">
                                {resolveWorkCardStatusLabel({
                                    status: work.status,
                                    completedAt: work.completed_at,
                                })}
                            </Badge>
                        ) : null}
                    </DialogTitle>
                    <DialogDescription>
                        {work?.codigo_instalacao
                            ? `Instalação ${work.codigo_instalacao}`
                            : work?.installation_key ?? "Detalhes da obra"}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : !work ? (
                    <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Obra não encontrada.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 rounded-md border px-2 py-2">
                                <Select
                                    value={statusDraft}
                                    onValueChange={(value) => setStatusDraft(value as WorkCard["status"])}
                                    disabled={isSaving}
                                >
                                    <SelectTrigger className="h-8 w-[190px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FECHADA">Obra Fechada</SelectItem>
                                        <SelectItem value="PARA_INICIAR">Obra Para Iniciar</SelectItem>
                                        <SelectItem value="EM_ANDAMENTO">Obra em Andamento</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleUpdateWorkStatus()}
                                    disabled={isSaving || statusDraft === work.status}
                                >
                                    Salvar status
                                </Button>
                            </div>
                            {work.status !== "FECHADA" || Boolean(work.completed_at) ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleUpdateWorkStatus("FECHADA", "open")}
                                    disabled={isSaving}
                                >
                                    Voltar para Obras Fechadas
                                </Button>
                            ) : null}
                            <Button
                                onClick={handleReleaseProject}
                                disabled={isSaving || !canReleaseProject}
                            >
                                {isSaving
                                    ? "Processando..."
                                    : work.projeto_liberado_at
                                        ? "Projeto já liberado"
                                        : "Marcar projeto como liberado"}
                            </Button>
                            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <Checkbox
                                    checked={work.tasks_integration_enabled}
                                    onChange={(event) => handleToggleTaskIntegration(event.currentTarget.checked)}
                                    disabled={isSaving}
                                />
                                <span>Conectar com tarefas automaticamente</span>
                            </div>
                            {work.contact_id ? (
                                <Button asChild variant="outline">
                                    <Link href={`/admin/contatos/${work.contact_id}`}>Abrir Contato 360</Link>
                                </Button>
                            ) : null}
                            {ownerWhatsAppHref ? (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={ownerWhatsAppHref}>
                                        <MessageCircle className="mr-2 h-4 w-4" />
                                        WhatsApp Dono
                                    </Link>
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" disabled>
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    WhatsApp Dono
                                </Button>
                            )}
                            {financialWhatsAppHref ? (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={financialWhatsAppHref}>
                                        <MessageCircle className="mr-2 h-4 w-4" />
                                        WhatsApp Financeiro
                                    </Link>
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" disabled>
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    WhatsApp Financeiro
                                </Button>
                            )}
                            {work.projeto_liberado_at ? (
                                <span className="text-xs text-muted-foreground">
                                    Projeto liberado em {formatDateTime(work.projeto_liberado_at)}
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    Execução disponível desde o envio para Obras.
                                </span>
                            )}
                        </div>

                        <div className="rounded-md border bg-slate-50/60 p-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">Locação da obra</p>
                                    <p className="text-xs text-muted-foreground">
                                        Defina o endereço completo para equipe de execução.
                                    </p>
                                    <Input
                                        value={workAddress}
                                        onChange={(event) => setWorkAddress(event.target.value)}
                                        placeholder="Ex.: Av. Historiador Rubens de Mendonça, 2368 - Bosque da Saúde, Cuiabá - MT"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={handleSaveWorkAddress}
                                    disabled={isSaving || !workAddress.trim()}
                                    className="self-end"
                                >
                                    Salvar endereço
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-md border border-sky-200 bg-sky-50/60 p-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">Dono da obra</p>
                                    <p className="text-sm text-foreground">
                                        {ownerName || "Não informado no orçamento"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">WhatsApp do dono</p>
                                    <p className="text-sm text-foreground">
                                        {ownerWhatsapp ? formatWhatsAppNumber(ownerWhatsapp) : "Não informado no orçamento"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">Origem do financeiro</p>
                                    <p className="text-sm text-foreground">
                                        {financialSourceLabel}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">Contato financeiro</p>
                                    <p className="text-sm text-foreground">
                                        {financialContactName || "Usando contato vinculado"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">WhatsApp financeiro</p>
                                    <p className="text-sm text-foreground">
                                        {financialWhatsapp ? formatWhatsAppNumber(financialWhatsapp) : "Não informado no contato"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-3 rounded-md border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">Dados técnicos por orçamento</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReprocessTechnicalSnapshot}
                                        disabled={isSaving}
                                    >
                                        Reprocessar dados técnicos
                                    </Button>
                                </div>
                                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                                    {(
                                        [
                                            { label: "Projeto Principal", isPrimary: true },
                                            { label: "Projeto Secundário", isPrimary: false },
                                        ] as const
                                    ).map(({ label, isPrimary }) => {
                                        const section = technicalSections.find((s) => s.isPrimary === isPrimary) ?? null
                                        return (
                                            <div
                                                key={label}
                                                className={
                                                    isPrimary
                                                        ? "rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3 space-y-2"
                                                        : "rounded-xl border-2 border-blue-100 bg-blue-50/30 p-3 space-y-2"
                                                }
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <div
                                                            className={
                                                                isPrimary
                                                                    ? "h-2 w-2 rounded-full bg-emerald-500"
                                                                    : "h-2 w-2 rounded-full bg-blue-400"
                                                            }
                                                        />
                                                        <p
                                                            className={
                                                                isPrimary
                                                                    ? "text-[11px] font-bold uppercase tracking-wide text-emerald-800"
                                                                    : "text-[11px] font-bold uppercase tracking-wide text-blue-800"
                                                            }
                                                        >
                                                            {label}
                                                        </p>
                                                    </div>
                                                    {section?.proposalId && (
                                                        <Link
                                                            href={`/admin/orcamentos?proposalId=${section.proposalId}`}
                                                            className="text-[11px] text-muted-foreground underline hover:text-foreground"
                                                        >
                                                            #{section.proposalId.slice(0, 8)}
                                                        </Link>
                                                    )}
                                                </div>
                                                {!section ? (
                                                    <p className="py-3 text-center text-xs text-muted-foreground">
                                                        {isPrimary
                                                            ? "Nenhum orçamento principal vinculado."
                                                            : "Nenhum orçamento secundário vinculado."}
                                                    </p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="space-y-1 rounded-lg border border-emerald-200 bg-white p-2">
                                                            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                                                                kWh para contrato
                                                            </p>
                                                            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-900">
                                                                {section.manualContractEstimate}
                                                            </div>
                                                        </div>
                                                        <div className="rounded-lg border bg-white p-2 text-xs">
                                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                                Placa selecionada
                                                            </p>
                                                            {section.module && section.module.product_id ? (
                                                                <button
                                                                    type="button"
                                                                    className="mt-1 w-full rounded border border-dashed px-2 py-1 text-left text-xs font-medium hover:bg-slate-50"
                                                                    onClick={() =>
                                                                        handleOpenTechnicalProduct({
                                                                            product_id: section.module!.product_id!,
                                                                            title:
                                                                                section.module!.model ||
                                                                                section.module!.name ||
                                                                                "Placa",
                                                                            subtitle: formatModuleSelectionLabel(
                                                                                section.module!,
                                                                            ),
                                                                        })
                                                                    }
                                                                >
                                                                    {formatModuleSelectionLabel(section.module!)}
                                                                </button>
                                                            ) : (
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    Não informado no orçamento
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="rounded-lg border bg-white p-2 text-xs">
                                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                                Inversores selecionados
                                                            </p>
                                                            {section.inverters.filter((item) => item.product_id).length >
                                                            0 ? (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {section.inverters
                                                                        .filter(
                                                                            (item): item is SnapshotInverter & {
                                                                                product_id: string
                                                                            } => Boolean(item.product_id),
                                                                        )
                                                                        .map((item, index) => (
                                                                            <button
                                                                                key={`${item.product_id}-${index}`}
                                                                                type="button"
                                                                                className="rounded border border-dashed px-2 py-0.5 text-left text-xs font-medium hover:bg-slate-50"
                                                                                onClick={() =>
                                                                                    handleOpenTechnicalProduct({
                                                                                        product_id: item.product_id,
                                                                                        title:
                                                                                            item.model ||
                                                                                            item.name ||
                                                                                            "Inversor",
                                                                                        subtitle:
                                                                                            formatInverterSelectionLabel(
                                                                                                item,
                                                                                            ),
                                                                                        purchase_required:
                                                                                            item.purchase_required,
                                                                                    })
                                                                                }
                                                                            >
                                                                                {formatInverterSelectionLabel(item)}
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            ) : (
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    Não informado no orçamento
                                                                </p>
                                                            )}
                                                        </div>
                                                        {section.rows.length > 0 && (
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                {section.rows.map((entry) => (
                                                                    <div
                                                                        key={`${section.key}-${entry.label}-${entry.value}`}
                                                                        className="rounded-lg border bg-white p-2 text-xs"
                                                                    >
                                                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                                            {entry.label}
                                                                        </p>
                                                                        <p className="mt-0.5 text-xs font-medium text-foreground">
                                                                            {entry.value}
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Resposta Energisa (destaque)</p>
                                <div className="rounded-md bg-slate-50 p-3 text-sm">
                                    {latestEnergisaComment ? latestEnergisaComment.content : "Sem resposta registrada."}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Atualizado em: {formatDateTime(latestEnergisaComment?.created_at)}
                                </p>
                                <Textarea
                                    value={newEnergisaComment}
                                    onChange={(event) => setNewEnergisaComment(event.target.value)}
                                    placeholder="Registrar nova resposta da Energisa"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleAddEnergisaComment}
                                    disabled={isSaving || !newEnergisaComment.trim()}
                                >
                                    Salvar resposta
                                </Button>
                                <div className="space-y-2 rounded-md border p-3">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                                        Histórico Energisa
                                    </p>
                                    <div className="max-h-52 space-y-2 overflow-auto">
                                        {energisaHistory.map((comment) => {
                                            const author = comment.user?.name || comment.user?.email || "Usuário interno"
                                            const isOwnComment = Boolean(comment.user_id && comment.user_id === currentUserId)
                                            return (
                                                <div key={comment.id} className="rounded-md bg-slate-50 p-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs text-muted-foreground">
                                                            {author} • {formatDateTime(comment.created_at)}
                                                        </p>
                                                        {isOwnComment ? (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                                onClick={() => handleDeleteComment(comment)}
                                                                disabled={isSaving}
                                                            >
                                                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                                Excluir
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-1 text-sm">{comment.content}</p>
                                                </div>
                                            )
                                        })}
                                        {energisaHistory.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">Sem histórico de respostas.</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Comentários da obra</p>
                            {replyTargetComment ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                                    <div className="space-y-0.5">
                                        <p className="font-semibold text-amber-900">
                                            Respondendo {getCommentAuthorLabel(replyTargetComment)}
                                        </p>
                                        <p className="text-amber-800">{getCommentPreview(replyTargetComment)}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-amber-900 hover:text-amber-900"
                                        onClick={clearReplyTarget}
                                        disabled={isSaving}
                                    >
                                        Cancelar resposta
                                    </Button>
                                </div>
                            ) : null}
                            <Textarea
                                ref={generalCommentInputRef}
                                value={newGeneralComment}
                                onChange={(event) => setNewGeneralComment(event.target.value)}
                                placeholder={
                                    replyTargetComment
                                        ? "Escreva sua resposta para este comentário."
                                        : "Escreva um comentário técnico, atualização de andamento ou observação da obra."
                                }
                            />
                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                                <Input
                                    ref={commentAttachmentInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                                    onChange={handleGeneralCommentAttachmentChange}
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleAddGeneralComment}
                                    disabled={isSaving || !newGeneralComment.trim()}
                                >
                                    {replyTargetComment ? "Salvar resposta" : "Salvar comentário"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Até {MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT} anexos por comentário (PDF, imagens, DOC/DOCX, XLS/XLSX; máximo {WORK_COMMENT_ATTACHMENT_MAX_MB}MB por arquivo).
                            </p>
                            {commentAttachmentFiles.length > 0 ? (
                                <div className="rounded-md border bg-slate-50 p-2 text-xs text-muted-foreground">
                                    {commentAttachmentFiles.length} arquivo(s) selecionado(s):
                                    <span className="ml-1">
                                        {commentAttachmentFiles.map((file) => file.name).join(", ")}
                                    </span>
                                </div>
                            ) : null}
                            <div className="h-[clamp(36rem,90vh,68rem)] space-y-2 overflow-y-auto rounded-md border p-2">
                                {generalCommentThreads.map(({ comment, replies }) => {
                                    const author = getCommentAuthorLabel(comment)
                                    const isOwnComment = Boolean(comment.user_id && comment.user_id === currentUserId)
                                    return (
                                        <div key={comment.id} className="rounded-md bg-slate-50 p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs text-muted-foreground">
                                                    {author} • {formatDateTime(comment.created_at)}
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => handleStartReply(comment)}
                                                        disabled={isSaving}
                                                    >
                                                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                                                        Responder
                                                    </Button>
                                                    {isOwnComment ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                            onClick={() => handleDeleteComment(comment)}
                                                            disabled={isSaving}
                                                        >
                                                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                            Excluir
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
                                            {comment.attachments.length > 0 ? (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {comment.attachments.map((attachment) => (
                                                        attachment.signed_url ? (
                                                            <a
                                                                key={attachment.path}
                                                                href={attachment.signed_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                                                            >
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                <span>{attachment.name}</span>
                                                                <span className="text-muted-foreground">
                                                                    ({formatAttachmentSize(attachment.size)})
                                                                </span>
                                                            </a>
                                                        ) : (
                                                            <span
                                                                key={attachment.path}
                                                                className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-muted-foreground"
                                                            >
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                <span>{attachment.name}</span>
                                                                <span>({formatAttachmentSize(attachment.size)})</span>
                                                            </span>
                                                        )
                                                    ))}
                                                </div>
                                            ) : null}

                                            {replies.length > 0 ? (
                                                <div className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
                                                    {replies.map((reply) => {
                                                        const replyAuthor = getCommentAuthorLabel(reply)
                                                        const isOwnReply = Boolean(reply.user_id && reply.user_id === currentUserId)
                                                        return (
                                                            <div key={reply.id} className="rounded-md border bg-white p-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {replyAuthor} • {formatDateTime(reply.created_at)}
                                                                    </p>
                                                                    <div className="flex items-center gap-1">
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-7 px-2 text-xs"
                                                                            onClick={() => handleStartReply(reply)}
                                                                            disabled={isSaving}
                                                                        >
                                                                            <MessageCircle className="mr-1 h-3.5 w-3.5" />
                                                                            Responder
                                                                        </Button>
                                                                        {isOwnReply ? (
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                                                onClick={() => handleDeleteComment(reply)}
                                                                                disabled={isSaving}
                                                                            >
                                                                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                                                Excluir
                                                                            </Button>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                                <p className="mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
                                                                {reply.attachments.length > 0 ? (
                                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                                        {reply.attachments.map((attachment) => (
                                                                            attachment.signed_url ? (
                                                                                <a
                                                                                    key={attachment.path}
                                                                                    href={attachment.signed_url}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                                                                                >
                                                                                    <Paperclip className="h-3.5 w-3.5" />
                                                                                    <span>{attachment.name}</span>
                                                                                    <span className="text-muted-foreground">
                                                                                        ({formatAttachmentSize(attachment.size)})
                                                                                    </span>
                                                                                </a>
                                                                            ) : (
                                                                                <span
                                                                                    key={attachment.path}
                                                                                    className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-muted-foreground"
                                                                                >
                                                                                    <Paperclip className="h-3.5 w-3.5" />
                                                                                    <span>{attachment.name}</span>
                                                                                    <span>({formatAttachmentSize(attachment.size)})</span>
                                                                                </span>
                                                                            )
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                                {generalCommentThreads.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhum comentário registrado.</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold">Despesas da obra</p>
                                    <p className="text-xs text-muted-foreground">
                                        Lance custos para confrontar depois com o levantamento e margem da obra.
                                    </p>
                                </div>
                                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">
                                    Custo acumulado: {formatCurrency(totalExpenses)}
                                </div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-[1fr_180px_1fr_auto]">
                                <Input
                                    value={newExpenseDescription}
                                    onChange={(event) => setNewExpenseDescription(event.target.value)}
                                    placeholder="Descrição da despesa"
                                />
                                <Input
                                    value={newExpenseAmount}
                                    onChange={(event) => setNewExpenseAmount(event.target.value)}
                                    placeholder="Valor (ex.: 1250,90)"
                                    inputMode="decimal"
                                />
                                <Input
                                    ref={expenseAttachmentInputRef}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                                    onChange={handleExpenseAttachmentChange}
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleAddWorkExpense}
                                    disabled={isSaving || !newExpenseDescription.trim() || !newExpenseAmount.trim()}
                                >
                                    Registrar despesa
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Anexo opcional por despesa (PDF, imagens, DOC/DOCX, XLS/XLSX; máximo 10MB).
                            </p>
                            {newExpenseFile ? (
                                <div className="rounded-md border bg-slate-50 p-2 text-xs text-muted-foreground">
                                    Arquivo selecionado: {newExpenseFile.name}
                                </div>
                            ) : null}
                            <div className="max-h-64 space-y-2 overflow-auto rounded-md border p-2">
                                {workExpenses.map((expense) => {
                                    const author = expense.user?.name || expense.user?.email || "Usuário interno"
                                    return (
                                        <div key={expense.id} className="rounded-md bg-slate-50 p-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-medium">{expense.description}</p>
                                                <Badge variant="outline">{formatCurrency(expense.amount)}</Badge>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Lançado por {author} • {formatDateTime(expense.created_at)}
                                            </p>
                                            {expense.attachment ? (
                                                expense.attachment.signed_url ? (
                                                    <a
                                                        href={expense.attachment.signed_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-2 inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-slate-100"
                                                    >
                                                        <Paperclip className="h-3.5 w-3.5" />
                                                        <span>{expense.attachment.name}</span>
                                                        <span className="text-muted-foreground">
                                                            ({formatAttachmentSize(expense.attachment.size)})
                                                        </span>
                                                    </a>
                                                ) : (
                                                    <span className="mt-2 inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs text-muted-foreground">
                                                        <Paperclip className="h-3.5 w-3.5" />
                                                        <span>{expense.attachment.name}</span>
                                                        <span>({formatAttachmentSize(expense.attachment.size)})</span>
                                                    </span>
                                                )
                                            ) : null}
                                        </div>
                                    )
                                })}
                                {workExpenses.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhuma despesa lançada.</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Processos de Projeto</p>
                                <div className="flex gap-2">
                                    <Input
                                        value={newProjectItem}
                                        onChange={(event) => setNewProjectItem(event.target.value)}
                                        placeholder="Novo processo de projeto (cria principal e vinculado)"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => handleAddProcessItem("PROJETO")}
                                        disabled={isSaving}
                                    >
                                        Adicionar
                                    </Button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                                                    {WORK_PROJECT_PROCESS_PRIMARY_LABEL}
                                                </p>
                                            </div>
                                            {shouldShowStartButton("PRIMARY") ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => handleStartProjectByScope("PRIMARY")}
                                                    disabled={isSaving}
                                                >
                                                    Projeto iniciado
                                                </Button>
                                            ) : null}
                                        </div>
                                        <div className="space-y-2">
                                            {projectItemsByScope.PRIMARY.map(renderProjectProcessEntry)}
                                            {projectItemsByScope.PRIMARY.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Sem processos desse orçamento.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full bg-blue-400" />
                                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                                                    {WORK_PROJECT_PROCESS_LINKED_LABEL}
                                                </p>
                                            </div>
                                            {shouldShowStartButton("LINKED") ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => handleStartProjectByScope("LINKED")}
                                                    disabled={isSaving}
                                                >
                                                    Projeto iniciado
                                                </Button>
                                            ) : null}
                                        </div>
                                        <div className="space-y-2">
                                            {projectItemsByScope.LINKED.map(renderProjectProcessEntry)}
                                            {projectItemsByScope.LINKED.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Sem processos desse orçamento.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                                {projectItemsByScope.unscoped.length > 0 ? (
                                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                            Processos sem separação
                                        </p>
                                        <div className="space-y-2">
                                            {projectItemsByScope.unscoped.map(renderProjectProcessEntry)}
                                        </div>
                                    </div>
                                ) : null}
                                {projectItems.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem processos de projeto.</p>
                                ) : null}
                            </div>

                            <div className="space-y-3 rounded-md border p-4">
                                <p className="text-sm font-semibold">Processos de Execução</p>
                                <p className="text-xs text-muted-foreground">
                                    Execução liberada para preenchimento desde o início.
                                </p>
                                <div className="grid gap-2 md:grid-cols-[1fr_240px_auto]">
                                    <Input
                                        value={newExecutionItem}
                                        onChange={(event) => setNewExecutionItem(event.target.value)}
                                        placeholder="Novo processo de execução (cria principal e vinculado)"
                                    />
                                    <Select
                                        value={newExecutionResponsibleId || "__none__"}
                                        onValueChange={(value) => setNewExecutionResponsibleId(value === "__none__" ? "" : value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Responsável (opcional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">Sem responsável</SelectItem>
                                            {responsibleUsers.map((user) => (
                                                <SelectItem key={`new-exec-responsible-${user.id}`} value={user.id}>
                                                    {user.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleAddProcessItem("EXECUCAO")}
                                        disabled={isSaving}
                                    >
                                        Adicionar
                                    </Button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                                                {WORK_PROJECT_PROCESS_PRIMARY_LABEL}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            {executionItemsByScope.PRIMARY.map(renderExecutionProcessEntry)}
                                            {executionItemsByScope.PRIMARY.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Sem processos desse orçamento.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-blue-400" />
                                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                                                {WORK_PROJECT_PROCESS_LINKED_LABEL}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            {executionItemsByScope.LINKED.map(renderExecutionProcessEntry)}
                                            {executionItemsByScope.LINKED.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">Sem processos desse orçamento.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                                {executionItemsByScope.unscoped.length > 0 ? (
                                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                            Processos sem separação
                                        </p>
                                        <div className="space-y-2">
                                            {executionItemsByScope.unscoped.map(renderExecutionProcessEntry)}
                                        </div>
                                    </div>
                                ) : null}
                                {executionItems.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem processos de execução.</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Imagens da Obra</p>
                            <div className="grid gap-2 md:grid-cols-[220px_1fr_1fr_auto]">
                                <Select value={uploadType} onValueChange={(value) => setUploadType(value as WorkImageType)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="CAPA">Capa</SelectItem>
                                        <SelectItem value="PERFIL">Perfil</SelectItem>
                                        <SelectItem value="ANTES">Antes</SelectItem>
                                        <SelectItem value="DEPOIS">Depois</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
                                <Input
                                    value={uploadCaption}
                                    onChange={(event) => setUploadCaption(event.target.value)}
                                    placeholder="Legenda (opcional)"
                                />
                                <Button onClick={handleUploadImage} disabled={isSaving || !uploadFile}>
                                    Upload
                                </Button>
                            </div>

                            <div className="space-y-3">
                                <ImageGallery
                                    label="Capa"
                                    items={coverImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Perfil"
                                    items={profileImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Antes"
                                    items={beforeImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                                <ImageGallery
                                    label="Depois"
                                    items={afterImages}
                                    onOpenImage={handleOpenImageViewer}
                                    onDelete={handleDeleteImage}
                                />
                            </div>
                        </div>

                        <div className="space-y-3 rounded-md border p-4">
                            <p className="text-sm font-semibold">Orçamentos vinculados</p>
                            <div className="space-y-2">
                                {proposalLinks.map((link) => (
                                    <div key={link.proposal_id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                                        <Badge variant={link.is_primary ? "default" : "outline"}>
                                            {link.is_primary ? "Principal" : "Vinculado"}
                                        </Badge>
                                        <Link href={`/admin/orcamentos?proposalId=${link.proposal_id}`} className="underline">
                                            #{link.proposal_id.slice(0, 8)}
                                        </Link>
                                        <span className="text-muted-foreground">{link.proposal?.status || "-"}</span>
                                        <span className="text-muted-foreground">modo {link.proposal?.source_mode || "legacy"}</span>
                                        <span className="text-muted-foreground">potência {typeof link.proposal?.total_power === "number" ? `${link.proposal.total_power.toFixed(2)} kWp` : "-"}</span>
                                        <span className="text-xs text-muted-foreground">{formatDateTime(link.linked_at)}</span>
                                    </div>
                                ))}
                                {proposalLinks.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem orçamentos vinculados.</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>

            <Dialog open={viewerOpen} onOpenChange={handleViewerOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{viewerImage?.caption || "Imagem da obra"}</DialogTitle>
                        <DialogDescription>
                            Visualização em alta qualidade sob demanda.
                        </DialogDescription>
                    </DialogHeader>

                    {viewerLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : viewerError ? (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {viewerError}
                        </div>
                    ) : viewerViewUrl ? (
                        <div className="overflow-hidden rounded-md border bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={viewerViewUrl}
                                alt={viewerImage?.caption || "Imagem da obra"}
                                className="max-h-[70vh] w-full object-contain"
                                decoding="async"
                            />
                        </div>
                    ) : (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            Imagem indisponível no momento.
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        {viewerDownloadUrl ? (
                            <Button asChild variant="outline">
                                <a href={viewerDownloadUrl} target="_blank" rel="noopener noreferrer">
                                    Baixar original
                                </a>
                            </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => handleViewerOpenChange(false)}>
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={productDialogOpen} onOpenChange={handleProductDialogOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedTechnicalProduct?.title || "Detalhes do equipamento"}</DialogTitle>
                        <DialogDescription>
                            Estoque em tempo real do produto selecionado.
                        </DialogDescription>
                    </DialogHeader>

                    {productDialogLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : productDialogError ? (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            {productDialogError}
                        </div>
                    ) : selectedProductInfo ? (
                        <div className="space-y-3 rounded-md border bg-slate-50 p-3 text-sm">
                            <div className="space-y-1 rounded-md border bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Produto</p>
                                <p className="font-medium">{selectedProductInfo.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {selectedTechnicalProduct?.subtitle || "-"}
                                </p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Fabricante</p>
                                    <p className="font-medium">{selectedProductInfo.manufacturer || "-"}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Modelo</p>
                                    <p className="font-medium">{selectedProductInfo.model || "-"}</p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Potência</p>
                                    <p className="font-medium">
                                        {typeof selectedProductInfo.power === "number"
                                            ? `${selectedProductInfo.power.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} W`
                                            : "-"}
                                    </p>
                                </div>
                                <div className="rounded-md border bg-white p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Estoque atual</p>
                                    <p className="font-medium">
                                        Total {selectedProductInfo.stock_total} • Reservado {selectedProductInfo.stock_reserved} • Disponível {selectedProductInfo.stock_available}
                                    </p>
                                </div>
                            </div>
                            {selectedTechnicalProduct?.purchase_required ? (
                                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                    Compra necessária: este inversor foi salvo com potência manual no orçamento.
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                            Produto indisponível no momento.
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        {selectedProductInfo ? (
                            <Button asChild variant="outline">
                                <Link href={`/admin/estoque/${selectedProductInfo.id}`}>Abrir no estoque</Link>
                            </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => handleProductDialogOpenChange(false)}>
                            Fechar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
