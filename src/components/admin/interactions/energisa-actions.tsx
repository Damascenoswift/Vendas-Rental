"use client"

import { useState, useEffect } from "react"
import { getEnergisaLogs, addEnergisaLog, type EnergisaLog } from "@/services/interactions-service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, Plus, History } from "lucide-react"

interface EnergisaActionsProps {
    indicacaoId: string
    variant?: "default" | "compact"
}

const ACTION_TYPES = [
    { value: 'DOC_SUBMITTED', label: 'Protocolo de Entrada' },
    { value: 'PENDING_INFO', label: 'Pendência de Info' },
    { value: 'REJECTION', label: 'Rejeição / Indeferimento' },
    { value: 'RESUBMISSION', label: 'Reentrada / Recurso' },
    { value: 'APPROVED', label: 'Aprovação / Parecer' },
    { value: 'METER_CHANGE', label: 'Troca de Medidor' },
    { value: 'TRANSFER_SUCCESS', label: 'Titularidade Concluída' }
]

export function EnergisaActions({ indicacaoId, variant = "default" }: EnergisaActionsProps) {
    const [logs, setLogs] = useState<EnergisaLog[]>([])
    const [actionType, setActionType] = useState("")
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const { showToast } = useToast()
    const isCompact = variant === "compact"
    const rootClassName = isCompact ? "space-y-4" : "space-y-6 h-full flex flex-col"
    const historyClassName = isCompact
        ? "border rounded-md max-h-64 overflow-auto"
        : "flex-1 overflow-auto border rounded-md"

    const fetchLogs = async () => {
        setRefreshing(true)
        const data = await getEnergisaLogs(indicacaoId)
        setLogs(data)
        setRefreshing(false)
    }

    useEffect(() => {
        fetchLogs()
    }, [indicacaoId])

    const handleAddLog = async () => {
        if (!actionType) return
        setLoading(true)
        const result = await addEnergisaLog(indicacaoId, actionType, notes)

        if (result.error) {
            showToast({ variant: 'error', title: 'Erro', description: result.error })
        } else {
            showToast({ variant: 'success', title: 'Registro Adicionado' })
            setNotes("")
            setActionType("")
            fetchLogs()
        }
        setLoading(false)
    }

    return (
        <div className={rootClassName}>
            {/* Input Form */}
            <Card className="bg-slate-50 border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Registrar Ação Energisa
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Select value={actionType} onValueChange={setActionType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Tipo de Ação" />
                            </SelectTrigger>
                            <SelectContent>
                                {ACTION_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            placeholder="Observação (ex: Nº Protocolo, Motivo...)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={handleAddLog}
                        disabled={loading || !actionType}
                        className="w-full"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
                    </Button>
                </CardContent>
            </Card>

            {/* History List */}
            <div className={historyClassName}>
                <div className="p-3 bg-muted/50 border-b flex justify-between items-center sticky top-0">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <History className="h-4 w-4" /> Histórico Energisa
                    </h3>
                    <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={refreshing}>
                        {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Atualizar'}
                    </Button>
                </div>

                <div className="divide-y">
                    {logs.length === 0 && (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            Nenhum registro encontrado.
                        </div>
                    )}
                    {logs.map((log) => {
                        const label = ACTION_TYPES.find(t => t.value === log.action_type)?.label || log.action_type
                        return (
                            <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-sm text-slate-800">{label}</span>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 mb-1">{log.notes || '-'}</p>
                                <div className="text-xs text-slate-400">
                                    Registrado por: {log.user?.name || 'Desconhecido'}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
