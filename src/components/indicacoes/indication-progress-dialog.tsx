"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Clock3, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { supabase } from "@/lib/supabase"

type DocValidationStatus = "PENDING" | "APPROVED" | "REJECTED" | "INCOMPLETE" | null

type TimelineIndication = {
    id: string
    nome: string
    status: string
    doc_validation_status: DocValidationStatus
    created_at: string
    updated_at: string
    contrato_enviado_em: string | null
    assinada_em: string | null
}

type InteractionItem = {
    id: string
    type: string
    content: string | null
    created_at: string
    metadata?: Record<string, unknown> | null
    user?: {
        name: string | null
        email: string | null
    } | null
}

type EnergisaLogItem = {
    id: string
    action_type: string
    notes: string | null
    created_at: string
    user?: {
        name: string | null
        email: string | null
    } | null
}

type StepState = "done" | "current" | "pending" | "blocked"

interface IndicationProgressDialogProps {
    indication: TimelineIndication
}

type TimelineEvent = {
    id: string
    date: string
    title: string
    description: string
    actor: string
}

const energisaActionLabels: Record<string, string> = {
    DOC_SUBMITTED: "Protocolo de Entrada",
    PENDING_INFO: "Pendência de Informação",
    REJECTION: "Rejeição / Indeferimento",
    RESUBMISSION: "Reentrada / Recurso",
    APPROVED: "Aprovação / Parecer",
    METER_CHANGE: "Troca de Medidor",
    TRANSFER_SUCCESS: "Titularidade Concluída",
}

const statusLabels: Record<string, string> = {
    EM_ANALISE: "Em análise",
    AGUARDANDO_ASSINATURA: "Aguardando assinatura",
    FALTANDO_DOCUMENTACAO: "Faltando documentação",
    ENERGISA_ANALISE: "Energisa em análise",
    ENERGISA_APROVADO: "Energisa aprovado",
    INSTALACAO_AGENDADA: "Instalação agendada",
    APROVADA: "Aprovada",
    CONCLUIDA: "Concluída",
    REJEITADA: "Rejeitada",
}

const docStatusLabels: Record<string, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovada",
    REJECTED: "Rejeitada",
    INCOMPLETE: "Incompleta",
}

const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "—"
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value))
    } catch {
        return "—"
    }
}

const normalizeActor = (user: { name: string | null; email: string | null } | null | undefined) => {
    return user?.name ?? user?.email ?? "Sistema"
}

const getInteractionTitle = (type: string) => {
    if (type === "STATUS_CHANGE") return "Status atualizado"
    if (type === "DOC_APPROVAL") return "Validação de documentação"
    if (type === "DOC_REQUEST") return "Solicitação de documentos"
    return "Comentário"
}

const getStepIcon = (state: StepState) => {
    if (state === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    if (state === "current") return <Clock3 className="h-4 w-4 text-amber-600" />
    if (state === "blocked") return <XCircle className="h-4 w-4 text-rose-600" />
    return <Circle className="h-4 w-4 text-muted-foreground" />
}

function buildSteps(indication: TimelineIndication, energisaLogs: EnergisaLogItem[]) {
    const hasContractSent =
        Boolean(indication.contrato_enviado_em) ||
        indication.status === "AGUARDANDO_ASSINATURA" ||
        indication.status === "CONCLUIDA"

    const hasContractSigned =
        Boolean(indication.assinada_em) ||
        indication.status === "CONCLUIDA"

    const docsRejected =
        indication.doc_validation_status === "REJECTED" ||
        indication.status === "REJEITADA"
    const docsApproved = indication.doc_validation_status === "APPROVED"
    const docsIncomplete =
        indication.doc_validation_status === "INCOMPLETE" ||
        indication.status === "FALTANDO_DOCUMENTACAO"

    const energisaActiveStatuses = new Set([
        "ENERGISA_ANALISE",
        "ENERGISA_APROVADO",
        "INSTALACAO_AGENDADA",
    ])
    const energisaInProgress =
        energisaLogs.length > 0 || energisaActiveStatuses.has(indication.status)

    const isConcluded = indication.status === "CONCLUIDA"
    const isRejected = indication.status === "REJEITADA"
    const lastEnergisaDate = energisaLogs[0]?.created_at ?? null

    return [
        {
            key: "created",
            title: "Indicação registrada",
            state: "done" as StepState,
            date: indication.created_at,
            detail: "Cadastro inicial recebido.",
        },
        {
            key: "docs",
            title: "Validação de documentação",
            state: docsRejected
                ? ("blocked" as StepState)
                : docsApproved
                    ? ("done" as StepState)
                    : docsIncomplete
                        ? ("current" as StepState)
                        : ("pending" as StepState),
            date: docsApproved || docsRejected || docsIncomplete ? indication.updated_at : null,
            detail: docsRejected
                ? "Documentação rejeitada."
                : docsApproved
                    ? "Documentação aprovada."
                    : docsIncomplete
                        ? "Documentação com pendências."
                        : "Aguardando análise.",
        },
        {
            key: "contract_sent",
            title: "Contrato enviado para assinatura",
            state: hasContractSent ? ("done" as StepState) : ("pending" as StepState),
            date: indication.contrato_enviado_em,
            detail: hasContractSent ? "Contrato enviado ao cliente." : "Aguardando envio.",
        },
        {
            key: "contract_signed",
            title: "Contrato assinado",
            state: hasContractSigned
                ? ("done" as StepState)
                : hasContractSent
                    ? ("current" as StepState)
                    : ("pending" as StepState),
            date: indication.assinada_em,
            detail: hasContractSigned ? "Assinatura concluída." : "Aguardando assinatura.",
        },
        {
            key: "energisa",
            title: "Processo Energisa",
            state: isConcluded
                ? ("done" as StepState)
                : energisaInProgress
                    ? ("current" as StepState)
                    : ("pending" as StepState),
            date: lastEnergisaDate,
            detail: energisaInProgress ? "Processo em andamento." : "Sem ações registradas.",
        },
        {
            key: "finish",
            title: "Finalização",
            state: isConcluded
                ? ("done" as StepState)
                : isRejected
                    ? ("blocked" as StepState)
                    : ("pending" as StepState),
            date: isConcluded || isRejected ? indication.updated_at : null,
            detail: isConcluded
                ? "Fluxo concluído com sucesso."
                : isRejected
                    ? "Fluxo encerrado com rejeição."
                    : "Aguardando conclusão.",
        },
    ]
}

export function IndicationProgressDialog({ indication }: IndicationProgressDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [lead, setLead] = useState<TimelineIndication>(indication)
    const [interactions, setInteractions] = useState<InteractionItem[]>([])
    const [energisaLogs, setEnergisaLogs] = useState<EnergisaLogItem[]>([])

    useEffect(() => {
        setLead(indication)
    }, [indication])

    const loadLead = useCallback(async () => {
        const { data } = await supabase
            .from("indicacoes")
            .select("id, nome, status, doc_validation_status, created_at, updated_at, contrato_enviado_em, assinada_em")
            .eq("id", indication.id)
            .maybeSingle()

        if (data) {
            setLead(data as TimelineIndication)
        }
    }, [indication.id])

    const loadInteractions = useCallback(async () => {
        const { data } = await supabase
            .from("indicacao_interactions")
            .select("id, type, content, metadata, created_at, user:users(name, email)")
            .eq("indicacao_id", indication.id)
            .order("created_at", { ascending: false })

        setInteractions((data ?? []) as unknown as InteractionItem[])
    }, [indication.id])

    const loadEnergisaLogs = useCallback(async () => {
        const { data } = await supabase
            .from("energisa_logs")
            .select("id, action_type, notes, created_at, user:users(name, email)")
            .eq("indicacao_id", indication.id)
            .order("created_at", { ascending: false })

        setEnergisaLogs((data ?? []) as unknown as EnergisaLogItem[])
    }, [indication.id])

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            await Promise.all([loadLead(), loadInteractions(), loadEnergisaLogs()])
        } finally {
            setLoading(false)
        }
    }, [loadLead, loadInteractions, loadEnergisaLogs])

    useEffect(() => {
        if (!open) return
        void loadAll()
    }, [open, loadAll])

    useEffect(() => {
        if (!open) return

        const channel = supabase
            .channel(`indicacao-timeline-${indication.id}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "indicacoes", filter: `id=eq.${indication.id}` },
                () => {
                    void loadLead()
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "indicacao_interactions", filter: `indicacao_id=eq.${indication.id}` },
                () => {
                    void loadInteractions()
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "energisa_logs", filter: `indicacao_id=eq.${indication.id}` },
                () => {
                    void loadEnergisaLogs()
                }
            )
            .subscribe()

        return () => {
            void supabase.removeChannel(channel)
        }
    }, [open, indication.id, loadLead, loadInteractions, loadEnergisaLogs])

    const steps = useMemo(() => buildSteps(lead, energisaLogs), [lead, energisaLogs])

    const timelineEvents = useMemo(() => {
        const items: TimelineEvent[] = [
            {
                id: `created-${lead.id}`,
                date: lead.created_at,
                title: "Indicação registrada",
                description: "Lead cadastrado no sistema.",
                actor: "Sistema",
            },
        ]

        if (lead.contrato_enviado_em) {
            items.push({
                id: `contract-sent-${lead.id}`,
                date: lead.contrato_enviado_em,
                title: "Contrato enviado para assinatura",
                description: "O contrato foi disparado para o cliente assinar.",
                actor: "Sistema",
            })
        }

        if (lead.assinada_em) {
            items.push({
                id: `contract-signed-${lead.id}`,
                date: lead.assinada_em,
                title: "Contrato assinado",
                description: "A assinatura do contrato foi concluída.",
                actor: "Sistema",
            })
        }

        for (const interaction of interactions) {
            items.push({
                id: `interaction-${interaction.id}`,
                date: interaction.created_at,
                title: getInteractionTitle(interaction.type),
                description: interaction.content || "Atualização registrada.",
                actor: normalizeActor(interaction.user),
            })
        }

        for (const log of energisaLogs) {
            items.push({
                id: `energisa-${log.id}`,
                date: log.created_at,
                title: `Energisa: ${energisaActionLabels[log.action_type] ?? log.action_type}`,
                description: log.notes || "Sem observações.",
                actor: normalizeActor(log.user),
            })
        }

        return items.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
    }, [lead, interactions, energisaLogs])

    const currentStatusLabel = statusLabels[lead.status] ?? lead.status
    const currentDocStatusLabel = docStatusLabels[lead.doc_validation_status ?? "PENDING"] ?? "Pendente"

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                    Acompanhar
                </Button>
            </DialogTrigger>

            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Jornada da Indicação: {lead.nome}</DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
                        <div className="rounded-lg border p-4">
                            <div className="mb-4 space-y-1">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status atual</p>
                                <p className="font-medium">{currentStatusLabel}</p>
                                <p className="text-sm text-muted-foreground">Documentação: {currentDocStatusLabel}</p>
                                <p className="text-xs text-muted-foreground">Última atualização: {formatDateTime(lead.updated_at)}</p>
                            </div>

                            <div className="space-y-3">
                                {steps.map((step) => (
                                    <div key={step.key} className="rounded-md border bg-muted/30 p-3">
                                        <div className="flex items-start gap-2">
                                            <span className="mt-0.5">{getStepIcon(step.state)}</span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">{step.title}</p>
                                                <p className="text-xs text-muted-foreground">{step.detail}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(step.date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border">
                            <div className="border-b px-4 py-3">
                                <p className="text-sm font-semibold">Linha do tempo</p>
                            </div>
                            <ScrollArea className="h-[520px]">
                                <div className="space-y-3 p-4">
                                    {timelineEvents.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
                                    ) : (
                                        timelineEvents.map((event) => (
                                            <div key={event.id} className="rounded-md border bg-background p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-medium">{event.title}</p>
                                                    <span className="text-xs text-muted-foreground">{formatDateTime(event.date)}</span>
                                                </div>
                                                <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                                                <p className="mt-2 text-xs text-muted-foreground">Registrado por: {event.actor}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
