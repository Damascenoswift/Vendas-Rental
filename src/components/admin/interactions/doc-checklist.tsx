"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { updateDocValidationStatus } from "@/services/interactions-service"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuthSession } from "@/hooks/use-auth-session"

interface DocChecklistProps {
    indicacaoId: string
    brand?: "dorata" | "rental" | null
    currentStatus?: string
    onStatusChange?: (nextStatus: 'APPROVED' | 'REJECTED' | 'INCOMPLETE') => void
}

export function DocChecklist({ indicacaoId, brand = null, currentStatus = 'PENDING', onStatusChange }: DocChecklistProps) {
    const { showToast } = useToast()
    const { profile } = useAuthSession()
    const [updating, setUpdating] = useState(false)
    const [statusView, setStatusView] = useState(currentStatus)
    const isDorata = brand === "dorata"

    useEffect(() => {
        setStatusView(currentStatus)
    }, [currentStatus])

    // Only Admins/Support can validate docs
    // Force include 'adm_mestre' and ensure typed roles are correct
    const allowedRoles = ['adm_mestre', 'suporte_tecnico', 'adm_dorata', 'funcionario_n1', 'funcionario_n2']
    const canValidate = profile && allowedRoles.includes(profile.role)

    // Debug permission
    // console.log("Profile Role:", profile?.role, "Can Validate:", canValidate)

    const handleStatusUpdate = async (status: 'APPROVED' | 'REJECTED' | 'INCOMPLETE') => {
        setUpdating(true)
        const result = await updateDocValidationStatus(indicacaoId, status)

        if (result.error) {
            showToast({ variant: 'error', title: 'Erro', description: result.error })
        } else {
            setStatusView(status)

            const docLabels: Record<'APPROVED' | 'REJECTED' | 'INCOMPLETE', string> = {
                APPROVED: 'aprovada',
                INCOMPLETE: 'incompleta',
                REJECTED: 'rejeitada',
            }

            showToast({
                variant: 'success',
                title: 'Status atualizado',
                description: isDorata
                    ? status === 'APPROVED'
                        ? 'Documentação aprovada. Vendedor e financeiro notificados; comissão Dorata liberada.'
                        : `Documentação ${docLabels[status]}. Vendedor e financeiro notificados.`
                    : `Documentação marcada como ${status}.`,
            })
            if (result.warning) {
                showToast({
                    variant: 'info',
                    title: 'Atualizado com alerta',
                    description: result.warning,
                })
            }
            onStatusChange?.(status)
        }
        setUpdating(false)
    }

    const statusColors: Record<string, string> = {
        'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'APPROVED': 'bg-green-100 text-green-800 border-green-200',
        'REJECTED': 'bg-red-100 text-red-800 border-red-200',
        'INCOMPLETE': 'bg-orange-100 text-orange-800 border-orange-200'
    }

    const statusLabels: Record<string, string> = {
        'PENDING': 'Pendente de Análise',
        'APPROVED': 'Aprovado',
        'REJECTED': 'Rejeitado',
        'INCOMPLETE': 'Incompleto'
    }

    return (
        <div className="space-y-4 p-4 border rounded-md bg-card">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Status da Documentação</h3>
                <Badge variant="outline" className={statusColors[statusView] || ''}>
                    {statusLabels[statusView] || statusView}
                </Badge>
            </div>

            {isDorata ? (
                <p className="text-xs text-muted-foreground">
                    Fluxo Dorata: estes botões notificam vendedor e financeiro. Em <strong>Aprovar</strong>, a comissão também é liberada.
                </p>
            ) : null}

            {canValidate && (
                <div className="flex gap-2 pt-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                        onClick={() => handleStatusUpdate('APPROVED')}
                        disabled={updating || statusView === 'APPROVED'}
                    >
                        <CheckCircle className="mr-2 h-4 w-4" /> {isDorata ? "Aprovar + Notificar" : "Aprovar"}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                        onClick={() => handleStatusUpdate('INCOMPLETE')}
                        disabled={updating || statusView === 'INCOMPLETE'}
                    >
                        <AlertCircle className="mr-2 h-4 w-4" /> Incompleto
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => handleStatusUpdate('REJECTED')}
                        disabled={updating || statusView === 'REJECTED'}
                    >
                        <XCircle className="mr-2 h-4 w-4" /> Rejeitar
                    </Button>
                </div>
            )}

            {!canValidate && (
                <p className="text-xs text-muted-foreground">
                    Aguarde a análise do setor responsável.
                </p>
            )}
        </div>
    )
}
