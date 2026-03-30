"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
    updateWorkProcessCompletionAutomationSettingsForAdmin,
    type WorkProcessCompletionAutomationLogItem,
    type WorkProcessCompletionAutomationSettings,
} from "@/services/work-process-completion-automation-service"

type WorkProcessCompletionAutomationPanelProps = {
    initialSettings: WorkProcessCompletionAutomationSettings
    initialLogs: WorkProcessCompletionAutomationLogItem[]
}

type UpdatingChannel = "INTERNAL" | "WHATSAPP" | null

function formatDateTime(value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return "-"

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Cuiaba",
    }).format(parsed)
}

function getChannelLabel(channel: WorkProcessCompletionAutomationLogItem["channel"]) {
    if (channel === "INTERNAL") return "Interno"
    return "WhatsApp"
}

function getStatusLabel(status: WorkProcessCompletionAutomationLogItem["status"]) {
    if (status === "SENT") return "Enviado"
    if (status === "SKIPPED") return "Ignorado"
    return "Falhou"
}

function getStatusVariant(status: WorkProcessCompletionAutomationLogItem["status"]) {
    if (status === "SENT") return "default" as const
    if (status === "SKIPPED") return "secondary" as const
    return "destructive" as const
}

function getReasonLabel(reason: string | null) {
    if (!reason) return "-"

    const map: Record<string, string> = {
        CHANNEL_DISABLED: "Canal desativado",
        BRAND_NOT_ALLOWED: "Marca fora do escopo",
        NO_VALID_PHONE: "Sem telefone válido",
        WHATSAPP_SEND_FAILED: "Falha no envio WhatsApp",
        INTERNAL_DISPATCH_FAILED: "Falha no envio interno",
        WORK_NOT_FOUND: "Obra não encontrada",
    }

    return map[reason] ?? reason
}

export function WorkProcessCompletionAutomationPanel({
    initialSettings,
    initialLogs,
}: WorkProcessCompletionAutomationPanelProps) {
    const [settings, setSettings] = useState(initialSettings)
    const [updatingChannel, setUpdatingChannel] = useState<UpdatingChannel>(null)
    const [isPending, startTransition] = useTransition()
    const { showToast } = useToast()
    const router = useRouter()

    const allowedBrandsLabel = useMemo(() => {
        const brands = settings.allowedBrands.map((brand) => brand.trim().toLowerCase()).filter(Boolean)
        if (brands.length === 0) return "dorata, rental"
        return brands.join(", ")
    }, [settings.allowedBrands])

    const handleToggleInternal = () => {
        const nextValue = !settings.channelInternalEnabled
        const previous = settings
        setSettings((current) => ({
            ...current,
            channelInternalEnabled: nextValue,
        }))
        setUpdatingChannel("INTERNAL")

        startTransition(async () => {
            const result = await updateWorkProcessCompletionAutomationSettingsForAdmin({
                channelInternalEnabled: nextValue,
            })

            if (result.error || !result.settings) {
                setSettings(previous)
                showToast({
                    title: "Erro ao atualizar canal interno",
                    description: result.error ?? "Falha inesperada ao salvar.",
                    variant: "error",
                })
                setUpdatingChannel(null)
                return
            }

            setSettings(result.settings)
            showToast({
                title: "Canal interno atualizado",
                description: nextValue ? "Canal interno ativado." : "Canal interno desativado.",
                variant: "success",
            })
            setUpdatingChannel(null)
            router.refresh()
        })
    }

    const handleToggleWhatsApp = () => {
        const nextValue = !settings.channelWhatsAppEnabled
        const previous = settings
        setSettings((current) => ({
            ...current,
            channelWhatsAppEnabled: nextValue,
        }))
        setUpdatingChannel("WHATSAPP")

        startTransition(async () => {
            const result = await updateWorkProcessCompletionAutomationSettingsForAdmin({
                channelWhatsAppEnabled: nextValue,
            })

            if (result.error || !result.settings) {
                setSettings(previous)
                showToast({
                    title: "Erro ao atualizar canal WhatsApp",
                    description: result.error ?? "Falha inesperada ao salvar.",
                    variant: "error",
                })
                setUpdatingChannel(null)
                return
            }

            setSettings(result.settings)
            showToast({
                title: "Canal WhatsApp atualizado",
                description: nextValue ? "Canal WhatsApp ativado." : "Canal WhatsApp desativado.",
                variant: "success",
            })
            setUpdatingChannel(null)
            router.refresh()
        })
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Check Concluído em Obras</CardTitle>
                    <CardDescription>
                        Automação para conclusão de etapa (`DONE`) em `PROJETO` e `EXECUCAO`.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
                        <p><strong>Regra fixa:</strong> responsável da etapa → fallback criador da obra.</p>
                        <p><strong>Marcas:</strong> {allowedBrandsLabel}</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="font-medium">Canal Interno</p>
                                <Badge variant={settings.channelInternalEnabled ? "default" : "secondary"}>
                                    {settings.channelInternalEnabled ? "ON" : "OFF"}
                                </Badge>
                            </div>
                            <Button
                                type="button"
                                variant={settings.channelInternalEnabled ? "outline" : "default"}
                                onClick={handleToggleInternal}
                                disabled={isPending || updatingChannel === "WHATSAPP"}
                            >
                                {updatingChannel === "INTERNAL"
                                    ? "Salvando..."
                                    : settings.channelInternalEnabled
                                        ? "Desativar interno"
                                        : "Ativar interno"}
                            </Button>
                        </div>

                        <div className="rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="font-medium">Canal WhatsApp</p>
                                <Badge variant={settings.channelWhatsAppEnabled ? "default" : "secondary"}>
                                    {settings.channelWhatsAppEnabled ? "ON" : "OFF"}
                                </Badge>
                            </div>
                            <Button
                                type="button"
                                variant={settings.channelWhatsAppEnabled ? "outline" : "default"}
                                onClick={handleToggleWhatsApp}
                                disabled={isPending || updatingChannel === "INTERNAL"}
                            >
                                {updatingChannel === "WHATSAPP"
                                    ? "Salvando..."
                                    : settings.channelWhatsAppEnabled
                                        ? "Desativar WhatsApp"
                                        : "Ativar WhatsApp"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Histórico de Execução</CardTitle>
                    <CardDescription>
                        Últimos envios e falhas da automação.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {initialLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Canal</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Motivo</TableHead>
                                        <TableHead>Obra</TableHead>
                                        <TableHead>Etapa</TableHead>
                                        <TableHead>Destino</TableHead>
                                        <TableHead>Telefone</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {initialLogs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                                            <TableCell>{getChannelLabel(log.channel)}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(log.status)}>
                                                    {getStatusLabel(log.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{getReasonLabel(log.reasonCode)}</TableCell>
                                            <TableCell>{log.workTitle ?? log.workId}</TableCell>
                                            <TableCell>{log.processTitle ?? log.processItemId}</TableCell>
                                            <TableCell>{log.targetUserDisplay ?? "-"}</TableCell>
                                            <TableCell>{log.recipientPhone ?? "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
