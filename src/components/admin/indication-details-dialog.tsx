"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, FileText, Download, Loader2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"
import { LeadInteractions } from "./interactions/lead-interactions"
import { EnergisaActions } from "./interactions/energisa-actions"
import { DocChecklist } from "./interactions/doc-checklist"
import { getProposalsForIndication } from "@/app/actions/proposals"
import {
    activateWorkCardFromProposal,
    markDorataContractSigned,
    setContractProposalForIndication,
} from "@/app/actions/crm"
import { cn } from "@/lib/utils"
import type { ChangeEvent, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuthSession } from "@/hooks/use-auth-session"
import { getIndicationStorageDetails, uploadIndicationAssets } from "@/app/actions/indication-assets"

interface IndicationDetailsDialogProps {
    indicationId: string
    userId: string
    fallbackUserIds?: string[]
    initialData?: Record<string, unknown> | null
    brand?: "rental" | "dorata" | null
    open?: boolean
    onOpenChange?: (open: boolean) => void
    hideDefaultTrigger?: boolean
    trigger?: ReactNode
}

interface FileItem {
    name: string
    url: string | null
}

type ProposalSummary = {
    id: string
    client_id: string | null
    created_at: string
    status: string | null
    total_value: number | null
    total_power: number | null
    calculation?: Record<string, any> | null
    seller?: {
        name?: string | null
        email?: string | null
    } | null
}

type IndicationAttachmentKey =
    | "fatura_energia_pf"
    | "documento_com_foto_pf"
    | "fatura_energia_pj"
    | "documento_com_foto_pj"
    | "contrato_social"
    | "cartao_cnpj"
    | "doc_representante"

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpg",
    "image/jpeg",
])

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png"

const ATTACHMENT_LABELS: Record<IndicationAttachmentKey, string> = {
    fatura_energia_pf: "Fatura de energia (PF)",
    documento_com_foto_pf: "Documento com foto (PF)",
    fatura_energia_pj: "Fatura de energia (PJ)",
    documento_com_foto_pj: "Documento com foto (PJ)",
    contrato_social: "Contrato social",
    cartao_cnpj: "Cartão CNPJ",
    doc_representante: "Documento do representante",
}

const PF_ATTACHMENT_FIELDS: Array<{ key: IndicationAttachmentKey; label: string }> = [
    { key: "fatura_energia_pf", label: ATTACHMENT_LABELS.fatura_energia_pf },
    { key: "documento_com_foto_pf", label: ATTACHMENT_LABELS.documento_com_foto_pf },
]

const PJ_ATTACHMENT_FIELDS: Array<{ key: IndicationAttachmentKey; label: string }> = [
    { key: "fatura_energia_pj", label: ATTACHMENT_LABELS.fatura_energia_pj },
    { key: "documento_com_foto_pj", label: ATTACHMENT_LABELS.documento_com_foto_pj },
    { key: "contrato_social", label: ATTACHMENT_LABELS.contrato_social },
    { key: "cartao_cnpj", label: ATTACHMENT_LABELS.cartao_cnpj },
    { key: "doc_representante", label: ATTACHMENT_LABELS.doc_representante },
]

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    accepted: "Aceito",
    rejected: "Rejeitado",
    expired: "Expirado",
}

export function IndicationDetailsDialog({
    indicationId,
    userId,
    fallbackUserIds = [],
    initialData = null,
    brand,
    open,
    onOpenChange,
    hideDefaultTrigger = false,
    trigger,
}: IndicationDetailsDialogProps) {
    const router = useRouter()
    const [internalOpen, setInternalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [metadata, setMetadata] = useState<any>(null)
    const [files, setFiles] = useState<FileItem[]>([])
    const [storageOwnerId, setStorageOwnerId] = useState<string | null>(null)
    const [uploadFiles, setUploadFiles] = useState<Partial<Record<IndicationAttachmentKey, File | null>>>({})
    const [isUploadingFiles, setIsUploadingFiles] = useState(false)
    const [proposals, setProposals] = useState<ProposalSummary[]>([])
    const [proposalError, setProposalError] = useState<string | null>(null)
    const [proposalLoading, setProposalLoading] = useState(false)
    const [hasLoadedProposals, setHasLoadedProposals] = useState(false)
    const [contractProposalId, setContractProposalId] = useState<string | null>((initialData as any)?.contract_proposal_id ?? null)
    const [updatingContractProposalId, setUpdatingContractProposalId] = useState<string | null>(null)
    const [isMarkingContractSigned, setIsMarkingContractSigned] = useState(false)
    const [activatingProposalId, setActivatingProposalId] = useState<string | null>(null)
    const [signedAt, setSignedAt] = useState<string | null>((initialData as any)?.assinada_em ?? null)
    const { showToast } = useToast()
    const { session, profile } = useAuthSession()
    const isControlled = typeof open === "boolean"
    const isOpen = isControlled ? open : internalOpen
    const isSupervisorTeamReadOnly =
        profile?.role === "supervisor" &&
        Boolean(session?.user.id) &&
        session?.user.id !== userId

    const resolvedBrand = useMemo(() => {
        if (brand) return brand
        const fromInitial = (initialData as any)?.marca
        return fromInitial === "rental" || fromInitial === "dorata" ? fromInitial : null
    }, [brand, initialData])

    const isDorata = resolvedBrand === "dorata"
    const initialDocStatus = useMemo(() => {
        const rawStatus = (initialData as any)?.doc_validation_status
        return typeof rawStatus === "string" && rawStatus.length > 0 ? rawStatus : "PENDING"
    }, [initialData])
    const personType = useMemo<"PF" | "PJ">(() => {
        const raw = String((metadata as any)?.tipoPessoa ?? (metadata as any)?.tipo ?? (initialData as any)?.tipo ?? "").toUpperCase()
        return raw === "PJ" ? "PJ" : "PF"
    }, [metadata, initialData])
    const attachmentFields = personType === "PJ" ? PJ_ATTACHMENT_FIELDS : PF_ATTACHMENT_FIELDS
    const selectedUploadCount = attachmentFields.filter((field) => uploadFiles[field.key] instanceof File).length

    useEffect(() => {
        setMetadata(null)
        setFiles([])
        setStorageOwnerId(null)
        setUploadFiles({})
        setIsUploadingFiles(false)
        setProposals([])
        setProposalError(null)
        setHasLoadedProposals(false)
        setContractProposalId((initialData as any)?.contract_proposal_id ?? null)
        setSignedAt((initialData as any)?.assinada_em ?? null)
    }, [indicationId, userId, initialData])

    const toDisplayMetadata = (value: Record<string, unknown> | null) => {
        if (!value) return null
        const filteredEntries = Object.entries(value).filter(([, item]) => {
            if (item === null || item === undefined || item === "") return false
            if (typeof item === "object") return false
            return true
        })

        if (filteredEntries.length === 0) return null
        return Object.fromEntries(filteredEntries)
    }

    const listFilesForOwner = async (ownerId: string) => {
        const { data: fileList } = await supabase.storage
            .from("indicacoes")
            .list(`${ownerId}/${indicationId}`)

        if (!fileList) return []

        const validFiles = fileList.filter((file) => file.name !== "metadata.json")
        if (validFiles.length === 0) return []

        return Promise.all(
            validFiles.map(async (file) => {
                const { data } = await supabase.storage
                    .from("indicacoes")
                    .createSignedUrl(`${ownerId}/${indicationId}/${file.name}`, 3600)

                return {
                    name: file.name,
                    url: data?.signedUrl || null,
                }
            })
        )
    }

    const readMetadataForOwner = async (ownerId: string) => {
        const { data: metadataFile } = await supabase.storage
            .from("indicacoes")
            .download(`${ownerId}/${indicationId}/metadata.json`)

        if (!metadataFile) return null

        try {
            const text = await metadataFile.text()
            const parsed = JSON.parse(text)
            return parsed as Record<string, unknown>
        } catch {
            return null
        }
    }

    const fetchDetails = async () => {
        setIsLoading(true)
        try {
            const candidateOwnerIds = Array.from(
                new Set([userId, session?.user.id, ...fallbackUserIds].map((value) => value?.trim()).filter(Boolean) as string[])
            )

            let finalMetadata: Record<string, unknown> | null = null
            let finalFiles: FileItem[] = []
            let finalOwnerId: string | null = null
            const serverResult = await getIndicationStorageDetails({
                indicationId,
                ownerIds: candidateOwnerIds,
            })

            if (serverResult.success) {
                finalMetadata = serverResult.metadata
                finalFiles = serverResult.files
                finalOwnerId = serverResult.ownerId
            } else {
                // Fallback to client-side reads if server action is unavailable in current environment.
                for (const ownerId of candidateOwnerIds) {
                    const [ownerMetadata, ownerFiles] = await Promise.all([
                        readMetadataForOwner(ownerId),
                        listFilesForOwner(ownerId),
                    ])

                    if (ownerMetadata || ownerFiles.length > 0) {
                        finalMetadata = ownerMetadata
                        finalFiles = ownerFiles
                        finalOwnerId = ownerId
                        break
                    }
                }
            }

            setMetadata(toDisplayMetadata(finalMetadata ?? initialData))
            setFiles(finalFiles)
            setStorageOwnerId(finalOwnerId)
        } catch (error) {
            console.error("Error loading details:", error)
            showToast({
                title: "Erro ao carregar detalhes",
                description: "Não foi possível buscar as informações.",
                variant: "error"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const formatFileLabel = (name: string) => {
        const normalized = name as IndicationAttachmentKey
        if (normalized in ATTACHMENT_LABELS) {
            return ATTACHMENT_LABELS[normalized]
        }
        return name
    }

    const handleUploadFileChange = (key: IndicationAttachmentKey) => (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0] ?? null

        if (!selectedFile) {
            setUploadFiles((previous) => ({ ...previous, [key]: null }))
            return
        }

        if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(selectedFile.type)) {
            showToast({
                title: "Arquivo inválido",
                description: "Use PDF, JPG, JPEG ou PNG.",
                variant: "error",
            })
            event.target.value = ""
            return
        }

        if (selectedFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
            showToast({
                title: "Arquivo grande",
                description: "Máximo de 10MB por arquivo.",
                variant: "error",
            })
            event.target.value = ""
            return
        }

        setUploadFiles((previous) => ({ ...previous, [key]: selectedFile }))
    }

    const handleUploadAttachments = async () => {
        if (selectedUploadCount === 0) {
            showToast({
                title: "Nenhum arquivo selecionado",
                description: "Selecione ao menos um documento para anexar.",
                variant: "error",
            })
            return
        }

        setIsUploadingFiles(true)
        try {
            const formData = new FormData()
            formData.append("indicationId", indicationId)
            formData.append("ownerId", storageOwnerId ?? userId)

            for (const field of attachmentFields) {
                const selectedFile = uploadFiles[field.key]
                if (selectedFile instanceof File) {
                    formData.append(field.key, selectedFile)
                }
            }

            const result = await uploadIndicationAssets(formData)
            if (!result.success) {
                const metadataError = "metadataError" in result ? result.metadataError : null
                const fileErrors = "fileErrors" in result && Array.isArray(result.fileErrors) ? result.fileErrors : []
                const genericError = "error" in result ? result.error : null

                const message = [genericError, metadataError, ...fileErrors].filter(Boolean).join(" | ")
                showToast({
                    title: "Erro ao anexar documentos",
                    description: message || "Não foi possível concluir o upload.",
                    variant: "error",
                })
                return
            }

            showToast({
                title: "Documentos anexados",
                description: "Arquivos salvos com sucesso.",
                variant: "success",
            })
            setUploadFiles({})
            await fetchDetails()
            router.refresh()
        } catch (error) {
            console.error("Error uploading indication assets:", error)
            const message = error instanceof Error && error.message
                ? error.message
                : "Tente novamente em instantes."
            showToast({
                title: "Erro ao anexar documentos",
                description: message,
                variant: "error",
            })
        } finally {
            setIsUploadingFiles(false)
        }
    }

    const handleOpenChange = (open: boolean) => {
        if (!isControlled) {
            setInternalOpen(open)
        }
        onOpenChange?.(open)
    }

    const formatCurrency = (value?: number | null) => {
        if (typeof value !== "number") return "—"
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    }

    const formatPercent = (value?: number | null) => {
        if (typeof value !== "number") return "—"
        return `${(value * 100).toFixed(2)}%`
    }

    const toFiniteNumber = (value: unknown): number | null => {
        const parsed = typeof value === "number" ? value : Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }

    const formatDateTime = (value?: string | null) => {
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

    const selectedContractProposal = useMemo(() => {
        if (!contractProposalId) return null
        return proposals.find((proposal) => (
            proposal.id === contractProposalId &&
            proposal.client_id === indicationId
        )) ?? null
    }, [contractProposalId, proposals, indicationId])

    const contractFinanceRows = useMemo(() => {
        if (!selectedContractProposal) return []

        const calculation = selectedContractProposal.calculation ?? null
        const financeInput = (calculation as any)?.input?.finance ?? null
        const financeOutput = (calculation as any)?.output?.finance ?? null
        const totalsOutput = (calculation as any)?.output?.totals ?? null
        const financeEnabled = Boolean(financeInput?.enabled)

        const rows: Array<{ label: string; value: string }> = [
            {
                label: "Orçamento",
                value: `#${selectedContractProposal.id.slice(0, 8)}`,
            },
            {
                label: "Status",
                value: selectedContractProposal.status
                    ? PROPOSAL_STATUS_LABELS[selectedContractProposal.status] ?? selectedContractProposal.status
                    : "—",
            },
            {
                label: "Valor do orçamento",
                value: formatCurrency(selectedContractProposal.total_value),
            },
            {
                label: "Potência total",
                value:
                    typeof selectedContractProposal.total_power === "number"
                        ? `${selectedContractProposal.total_power.toFixed(2)} kWp`
                        : "—",
            },
            {
                label: "Forma de pagamento",
                value: financeEnabled ? "Financiado" : "À vista",
            },
        ]

        if (!financeEnabled) {
            const cashTotal = toFiniteNumber(totalsOutput?.total_a_vista) ?? selectedContractProposal.total_value ?? null
            rows.push({
                label: "Total à vista",
                value: formatCurrency(cashTotal),
            })
            return rows
        }

        const entryValue = toFiniteNumber(financeInput?.entrada_valor)
        const graceMonths = toFiniteNumber(financeInput?.carencia_meses)
        const monthlyRate = toFiniteNumber(financeInput?.juros_mensal)
        const installments = toFiniteNumber(financeInput?.num_parcelas)
        const installmentValue = toFiniteNumber(financeOutput?.parcela_mensal)
        const totalPaid = toFiniteNumber(financeOutput?.total_pago)
        const totalInterest = toFiniteNumber(financeOutput?.juros_pagos)
        const financedAmount = toFiniteNumber(financeOutput?.valor_financiado)

        rows.push(
            {
                label: "Entrada",
                value: formatCurrency(entryValue),
            },
            {
                label: "Parcelamento",
                value: installments ? `${installments} parcelas` : "—",
            },
            {
                label: "Parcela mensal",
                value: formatCurrency(installmentValue),
            },
            {
                label: "Juros mensal",
                value: formatPercent(monthlyRate),
            },
            {
                label: "Carência",
                value: graceMonths && graceMonths > 0 ? `${graceMonths} meses` : "Sem carência",
            },
            {
                label: "Valor financiado",
                value: formatCurrency(financedAmount),
            },
            {
                label: "Total pago",
                value: formatCurrency(totalPaid),
            },
            {
                label: "Total de juros",
                value: formatCurrency(totalInterest),
            },
        )

        return rows
    }, [selectedContractProposal])

    useEffect(() => {
        if (!isOpen) return
        if (metadata || files.length > 0) return
        fetchDetails()
    }, [isOpen, indicationId, userId])

    useEffect(() => {
        if (!isOpen || !isDorata) return
        if (hasLoadedProposals || proposalLoading) return

        const loadProposals = async () => {
            setProposalLoading(true)
            const result = await getProposalsForIndication(indicationId)
            if (result?.error) {
                setProposalError(result.error)
                setProposals([])
            } else {
                setProposalError(null)
                setProposals((result as any).data ?? [])
                setContractProposalId((result as any).selectedProposalId ?? (initialData as any)?.contract_proposal_id ?? null)
            }
            setProposalLoading(false)
            setHasLoadedProposals(true)
        }

        void loadProposals()
    }, [isOpen, isDorata, indicationId, proposalLoading, hasLoadedProposals, initialData])

    const formatLabel = (key: string) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
    }

    const formatValue = (key: string, value: unknown) => {
        if (typeof value === "number") {
            if (key.toLowerCase().includes("valor") || key.toLowerCase().includes("preco") || key.toLowerCase().includes("price")) {
                return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
            }
            return new Intl.NumberFormat("pt-BR").format(value)
        }
        return String(value)
    }

    const [isCopied, setIsCopied] = useState(false)

    const handleCopy = () => {
        if (!metadata) return
        let text = ""
        Object.entries(metadata).forEach(([key, value]) => {
            if (typeof value === 'object' || !value) return
            text += `*${formatLabel(key)}:*\n${value}\n\n`
        })
        navigator.clipboard.writeText(text)
        setIsCopied(true)
        showToast({ title: "Copiado!", description: "Dados copiados." })
        setTimeout(() => setIsCopied(false), 2000)
    }

    const handleMarkContractSigned = async () => {
        if (isMarkingContractSigned) return

        setIsMarkingContractSigned(true)
        try {
            const statusPriority: Record<string, number> = {
                accepted: 0,
                sent: 1,
                draft: 2,
            }
            const directProposals = proposals.filter((proposal) => proposal.client_id === indicationId)
            const selectedContractProposal = contractProposalId
                ? directProposals.find((proposal) => proposal.id === contractProposalId)
                : null
            const preferredProposal = selectedContractProposal ?? directProposals
                .slice()
                .sort((a, b) => {
                    const rankA = statusPriority[a.status ?? ""] ?? 99
                    const rankB = statusPriority[b.status ?? ""] ?? 99
                    if (rankA !== rankB) return rankA - rankB
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })[0]

            const result = await markDorataContractSigned(indicationId, {
                allowToggle: true,
                proposalId: preferredProposal?.id ?? null,
            })
            if (result?.error) {
                showToast({
                    title: "Erro ao marcar contrato",
                    description: result.error,
                    variant: "error",
                })
                return
            }

            const resolvedSignedAt = result?.signed ? (result?.signedAt ?? new Date().toISOString()) : null
            setSignedAt(resolvedSignedAt)

            showToast({
                title: result?.signed ? "Contrato assinado" : "Contrato desmarcado",
                description: result?.signed
                    ? result?.warning
                        ? `Comissão liberada, mas com alerta: ${result.warning}`
                        : "Comissão Dorata liberada e gestor financeiro notificado."
                    : "Cliente voltou para aguardando assinatura e saiu da fila liberada do financeiro.",
                variant: result?.signed ? "success" : "info",
            })

            router.refresh()
        } catch {
            showToast({
                title: "Erro inesperado",
                description: "Não foi possível concluir a atualização do contrato.",
                variant: "error",
            })
        } finally {
            setIsMarkingContractSigned(false)
        }
    }

    const handleSetContractProposal = async (proposalId: string) => {
        if (updatingContractProposalId) return

        const shouldClearSelection = contractProposalId === proposalId
        setUpdatingContractProposalId(proposalId)
        try {
            const result = await setContractProposalForIndication(
                indicationId,
                shouldClearSelection ? null : proposalId,
            )

            if (result?.error) {
                showToast({
                    title: "Erro ao definir orçamento",
                    description: result.error,
                    variant: "error",
                })
                return
            }

            const nextContractProposalId =
                "contractProposalId" in (result ?? {})
                    ? result.contractProposalId ?? null
                    : shouldClearSelection
                        ? null
                        : proposalId

            setContractProposalId(nextContractProposalId)
            showToast({
                title: shouldClearSelection ? "Orçamento desmarcado" : "Orçamento marcado para contrato",
                description: shouldClearSelection
                    ? "A indicação voltou para seleção automática de orçamento."
                    : `Orçamento #${proposalId.slice(0, 8)} será usado como base do contrato.`,
                variant: "success",
            })
            router.refresh()
        } catch {
            showToast({
                title: "Erro inesperado",
                description: "Não foi possível atualizar o orçamento para contrato.",
                variant: "error",
            })
        } finally {
            setUpdatingContractProposalId(null)
        }
    }

    const handleActivateWorkCard = async (proposalId: string) => {
        if (activatingProposalId) return

        const rawBusinessDays = window.prompt(
            "Quanto tempo para execução desta obra? Informe em dias úteis.",
            "30",
        )

        if (rawBusinessDays === null) return

        const sanitizedBusinessDays = rawBusinessDays.trim()
        if (!/^\d+$/.test(sanitizedBusinessDays)) {
            showToast({
                title: "Prazo inválido",
                description: "Informe um número inteiro de dias úteis.",
                variant: "error",
            })
            return
        }

        const executionBusinessDays = Number.parseInt(sanitizedBusinessDays, 10)
        if (executionBusinessDays <= 0) {
            showToast({
                title: "Prazo inválido",
                description: "O prazo deve ser maior que zero.",
                variant: "error",
            })
            return
        }

        setActivatingProposalId(proposalId)
        try {
            const result = await activateWorkCardFromProposal(proposalId, { executionBusinessDays })
            if (result?.error) {
                showToast({
                    title: "Falha ao enviar para Obras",
                    description: result.error,
                    variant: "error",
                })
                return
            }

            showToast({
                title: "Obra atualizada",
                description:
                    result?.warning ??
                    `Card criado/atualizado no módulo de Obras. Prazo definido: ${executionBusinessDays} dia(s) úteis.`,
                variant: "success",
            })
            setContractProposalId(proposalId)
            router.refresh()
        } finally {
            setActivatingProposalId(null)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {!hideDefaultTrigger ? (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            <Eye className="h-4 w-4" />
                        </Button>
                    )}
                </DialogTrigger>
            ) : null}
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                    <DialogTitle>Detalhes da Indicação</DialogTitle>
                    {metadata && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            className="gap-2 mr-6" // margem para não colar no X
                        >
                            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {isCopied ? "Copiado" : "Copiar Dados"}
                        </Button>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="flex-1 py-4">
                        <Tabs defaultValue="dados" className="w-full">
                            <TabsList className={cn("grid w-full", isDorata ? "grid-cols-5" : "grid-cols-4")}>
                                <TabsTrigger value="dados">Dados & Docs</TabsTrigger>
                                {isDorata ? <TabsTrigger value="orcamento">Orçamento</TabsTrigger> : null}
                                <TabsTrigger value="arquivos">Arquivos ({files.length})</TabsTrigger>
                                <TabsTrigger value="energisa">Energisa</TabsTrigger>
                                <TabsTrigger value="atividades">Atividades & Chat</TabsTrigger>
                            </TabsList>

                            <TabsContent value="dados" className="space-y-4 mt-4">
                                <DocChecklist
                                    indicacaoId={indicationId}
                                    brand={resolvedBrand}
                                    currentStatus={initialDocStatus}
                                    onStatusChange={(nextStatus) => {
                                        if (resolvedBrand === "dorata" && nextStatus === "APPROVED") {
                                            setSignedAt((prev) => prev ?? new Date().toISOString())
                                        }
                                        router.refresh()
                                    }}
                                />
                                {/* ... metadata details ... */}
                                {metadata ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
                                        {Object.entries(metadata).map(([key, value]) => {
                                            if (typeof value === 'object' || !value) return null
                                            return (
                                                <div key={key} className="space-y-1 border-b pb-2">
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                        {formatLabel(key)}
                                                    </span>
                                                    <p className="text-sm font-medium break-words">
                                                        {formatValue(key, value)}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        Nenhum dado adicional encontrado.
                                    </div>
                                )}
                            </TabsContent>

                            {isDorata ? (
                                <TabsContent value="orcamento" className="space-y-4 mt-4">
                                    <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">Comissão Dorata</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Ao marcar contrato assinado, a comissão é liberada. Clique novamente para desfazer.
                                                </p>
                                            </div>
                                            <Badge variant={signedAt ? "success" : "secondary"}>
                                                {signedAt ? "Comissão liberada" : "Aguardando contrato assinado"}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            {!isSupervisorTeamReadOnly ? (
                                                <Button
                                                    type="button"
                                                    onClick={handleMarkContractSigned}
                                                    disabled={isMarkingContractSigned}
                                                >
                                                    {isMarkingContractSigned ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Salvando...
                                                        </>
                                                    ) : signedAt ? "Marcar como não assinado" : "Contrato assinado"}
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    Supervisor possui acesso apenas de visualização para a equipe.
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                Assinado em: {formatDateTime(signedAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border p-4 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold">Rastreamento financeiro do contrato</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Mostra os dados do orçamento marcado para contrato. O valor do card no CRM usa este orçamento.
                                                </p>
                                            </div>
                                            <Badge variant={selectedContractProposal ? "success" : "outline"}>
                                                {selectedContractProposal ? "Fonte ativa" : "Sem fonte selecionada"}
                                            </Badge>
                                        </div>

                                        {selectedContractProposal ? (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm border rounded-md overflow-hidden">
                                                    <tbody>
                                                        {contractFinanceRows.map((row) => (
                                                            <tr key={row.label} className="border-b last:border-b-0">
                                                                <td className="px-3 py-2 text-xs font-medium text-muted-foreground w-[40%] bg-muted/30">
                                                                    {row.label}
                                                                </td>
                                                                <td className="px-3 py-2 font-medium">{row.value}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Marque um orçamento com <span className="font-medium">Orçamento p/ contrato</span> para visualizar o resumo financeiro.
                                            </p>
                                        )}
                                    </div>

                                    {proposalLoading ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        </div>
                                    ) : proposalError ? (
                                        <div className="text-sm text-destructive">{proposalError}</div>
                                    ) : proposals.length === 0 ? (
                                        <div className="text-center py-6 text-muted-foreground">
                                            <p>Nenhum orçamento encontrado para esta indicação.</p>
                                            <p className="text-xs mt-2">
                                                Orçamentos do fluxo legado (Solicitar Orçamento) não aparecem aqui. Use o fluxo novo em
                                                <span className="font-medium"> /admin/orcamentos/novo</span>.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {proposals.map((proposal) => {
                                                const commissionValue = proposal.calculation?.commission?.value
                                                const commissionPercent = proposal.calculation?.commission?.percent
                                                const statusLabel = proposal.status
                                                    ? PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status
                                                    : "—"
                                                const isContractProposal = contractProposalId === proposal.id
                                                const isDirectMatch = proposal.client_id === indicationId

                                                return (
                                                    <div
                                                        key={proposal.id}
                                                        className={cn(
                                                            "rounded-lg border p-4 space-y-2",
                                                            isContractProposal ? "border-primary bg-primary/5" : null,
                                                        )}
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-semibold">
                                                                    Orçamento #{proposal.id.slice(0, 8)}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Criado em {formatDateTime(proposal.created_at)}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="secondary">{statusLabel}</Badge>
                                                                {isContractProposal ? (
                                                                    <Badge variant="success">Orçamento para contrato</Badge>
                                                                ) : null}
                                                                {!isDirectMatch ? (
                                                                    <Badge variant="outline">Outra indicação</Badge>
                                                                ) : null}
                                                                {!isSupervisorTeamReadOnly ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant={isContractProposal ? "default" : "outline"}
                                                                        disabled={updatingContractProposalId === proposal.id || !isDirectMatch}
                                                                        onClick={() => handleSetContractProposal(proposal.id)}
                                                                    >
                                                                        {updatingContractProposalId === proposal.id ? (
                                                                            <>
                                                                                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                                                                Salvando...
                                                                            </>
                                                                        ) : isContractProposal ? "Marcado no contrato" : "Orçamento p/ contrato"}
                                                                    </Button>
                                                                ) : null}
                                                                {!isSupervisorTeamReadOnly ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="outline"
                                                                        disabled={activatingProposalId === proposal.id}
                                                                        onClick={() => handleActivateWorkCard(proposal.id)}
                                                                    >
                                                                        {activatingProposalId === proposal.id ? (
                                                                            <>
                                                                                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                                                                Enviando...
                                                                            </>
                                                                        ) : "Enviar para Obras"}
                                                                    </Button>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Valor total</p>
                                                                <p className="font-medium">{formatCurrency(proposal.total_value)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Potência total</p>
                                                                <p className="font-medium">
                                                                    {typeof proposal.total_power === "number"
                                                                        ? `${proposal.total_power.toFixed(2)} kWp`
                                                                        : "—"}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-muted-foreground">Comissão</p>
                                                                <p className="font-medium">
                                                                    {commissionValue
                                                                        ? `${formatCurrency(commissionValue)} (${((commissionPercent ?? 0) * 100).toFixed(1)}%)`
                                                                        : "—"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Vendedor: {proposal.seller?.name || proposal.seller?.email || "Sistema"}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </TabsContent>
                            ) : null}

                            <TabsContent value="arquivos" className="mt-4 space-y-4">
                                {files.length > 0 ? (
                                    <div className="grid gap-2">
                                        {files.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-5 w-5 text-blue-500" />
                                                    <span className="text-sm font-medium">{formatFileLabel(file.name)}</span>
                                                </div>
                                                {file.url ? (
                                                    <Button size="sm" variant="outline" asChild>
                                                        <a href={file.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                                                            <Download className="h-4 w-4" />
                                                            Baixar
                                                        </a>
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-red-500">Erro no link</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        Nenhum arquivo anexado.
                                    </div>
                                )}

                                <div className="rounded-lg border p-4 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">Anexar documentos</p>
                                            <p className="text-xs text-muted-foreground">
                                                Você pode anexar ou substituir os documentos da indicação sem recriar o cadastro.
                                            </p>
                                        </div>
                                        <Badge variant="outline">{personType}</Badge>
                                    </div>

                                    {isSupervisorTeamReadOnly ? (
                                        <p className="text-xs text-muted-foreground">
                                            Supervisor possui acesso apenas de visualização para anexos da equipe.
                                        </p>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {attachmentFields.map((field) => (
                                                    <label key={field.key} className="space-y-1">
                                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                            {field.label}
                                                        </span>
                                                        <input
                                                            type="file"
                                                            accept={ATTACHMENT_ACCEPT}
                                                            className="block w-full rounded-md border border-input px-3 py-2 text-sm"
                                                            onChange={handleUploadFileChange(field.key)}
                                                        />
                                                        {uploadFiles[field.key] instanceof File ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                {(uploadFiles[field.key] as File).name}
                                                            </span>
                                                        ) : null}
                                                    </label>
                                                ))}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={handleUploadAttachments}
                                                    disabled={isUploadingFiles || selectedUploadCount === 0}
                                                >
                                                    {isUploadingFiles ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            Salvando anexos...
                                                        </>
                                                    ) : "Salvar anexos"}
                                                </Button>
                                                <span className="text-xs text-muted-foreground">
                                                    Formatos aceitos: PDF, JPG, JPEG e PNG (até 10MB por arquivo).
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="energisa" className="mt-4 h-full">
                                <EnergisaActions indicacaoId={indicationId} readOnly={isSupervisorTeamReadOnly} />
                            </TabsContent>

                            <TabsContent value="atividades" className="mt-4 h-full">
                                <LeadInteractions indicacaoId={indicationId} readOnly={isSupervisorTeamReadOnly} />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </DialogContent>
        </Dialog >
    )
}
