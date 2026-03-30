import { normalizeWhatsAppIdentifier } from "@/lib/integrations/whatsapp"

export type WorkProcessAutomationChannel = "INTERNAL" | "WHATSAPP"
export type WorkProcessAutomationStatus = "SENT" | "SKIPPED" | "FAILED"

const AUTOMATION_TIMEZONE = "America/Cuiaba"

export function isWorkProcessCompletionTransition(oldStatus?: string | null, newStatus?: string | null) {
    return oldStatus !== "DONE" && newStatus === "DONE"
}

export function normalizeAutomationWhatsappPhone(raw: string | null | undefined) {
    const normalized = normalizeWhatsAppIdentifier(raw)
    if (!normalized) return null
    if (normalized.length < 10 || normalized.length > 13) return null
    if (normalized.startsWith("0")) return null
    return normalized
}

type AutomationRecipientCandidate = {
    userId: string
    phone: string | null
}

export function pickAutomationRecipient(input: {
    responsible?: AutomationRecipientCandidate | null
    creator?: AutomationRecipientCandidate | null
}) {
    const responsiblePhone = normalizeAutomationWhatsappPhone(input.responsible?.phone)
    if (input.responsible?.userId && responsiblePhone) {
        return {
            userId: input.responsible.userId,
            phone: responsiblePhone,
            source: "RESPONSIBLE" as const,
        }
    }

    const creatorPhone = normalizeAutomationWhatsappPhone(input.creator?.phone)
    if (input.creator?.userId && creatorPhone) {
        return {
            userId: input.creator.userId,
            phone: creatorPhone,
            source: "CREATOR_FALLBACK" as const,
        }
    }

    return null
}

export function formatAutomationDateTime(value: Date) {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: AUTOMATION_TIMEZONE,
    }).format(value)
}

export function buildWorkProcessCompletionAutomationMessage(input: {
    workTitle: string
    processTitle: string
    actorDisplay: string
    completedAt: Date
}) {
    const workTitle = input.workTitle.trim() || "Obra sem título"
    const processTitle = input.processTitle.trim() || "Etapa da obra"
    const actorDisplay = input.actorDisplay.trim() || "Alguém"
    const completedAt = formatAutomationDateTime(input.completedAt)

    return [
        "Check de obra concluído.",
        `Obra: ${workTitle}`,
        `Etapa: ${processTitle}`,
        `Concluído por: ${actorDisplay}`,
        `Horário: ${completedAt}`,
    ].join("\n")
}

export function buildWorkProcessCompletionAutomationDedupeKey(input: {
    channel: WorkProcessAutomationChannel
    processItemId: string
    dedupeToken: string
}) {
    return `WORK_PROCESS_COMPLETION_AUTOMATION:${input.channel}:${input.processItemId}:${input.dedupeToken}`
}
