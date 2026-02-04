"use client"

import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { updateStatusWithComment } from "@/services/interactions-service"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

type IndicationStatusSelectProps = {
    id: string
    initialStatus: string
    brand?: string | null
}

const statusOptions = [
    { value: "EM_ANALISE", label: "Em Análise" },
    { value: "AGUARDANDO_ASSINATURA", label: "Aguardando Assinatura" },
    { value: "FALTANDO_DOCUMENTACAO", label: "Faltando Documentação" },
    { value: "ENERGISA_ANALISE", label: "Energisa (Em Análise)" },
    { value: "ENERGISA_APROVADO", label: "Energisa (Aprovado)" },
    { value: "INSTALACAO_AGENDADA", label: "Instalação Agendada" },
    { value: "CONCLUIDA", label: "Concluída" },
    { value: "REJEITADA", label: "Rejeitada" },
]

export function IndicationStatusSelect({ id, initialStatus, brand }: IndicationStatusSelectProps) {
    const [status, setStatus] = useState(initialStatus)
    const [tempStatus, setTempStatus] = useState<string | null>(null)
    const [comment, setComment] = useState("")
    const [isOpen, setIsOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const { showToast } = useToast()

    // When user selects a new status, open the dialog instead of changing immediately
    const handleValueChange = (newValue: string) => {
        if (newValue === status) return
        setTempStatus(newValue)
        setComment("")
        setIsOpen(true)
    }

    const handleConfirm = async () => {
        if (!tempStatus) return

        setIsSaving(true)
        const result = await updateStatusWithComment(id, tempStatus, comment)

        if (result.error) {
            showToast({
                variant: "error",
                title: "Erro ao atualizar",
                description: result.error
            })
            setTempStatus(null)
        } else {
            setStatus(tempStatus)
            showToast({
                variant: "success",
                title: "Status Atualizado",
                description: "Status alterado e comentário registrado."
            })
        }

        setIsSaving(false)
        setIsOpen(false)
    }

    const currentLabel = statusOptions.find(opt => opt.value === status)?.label || status
    const isRental = brand === "rental"

    return (
        <>
            <Select value={status} onValueChange={handleValueChange}>
                <SelectTrigger className="w-full h-8 text-xs" disabled={isRental}>
                    <SelectValue>{currentLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {isRental ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                    Fluxo Rental: mova o card no CRM/Tarefas.
                </p>
            ) : null}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Alterar Status</DialogTitle>
                        <DialogDescription>
                            Você está alterando o status para: <strong>{statusOptions.find(o => o.value === tempStatus)?.label}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Comentário ou Observação (Opcional)</Label>
                            <Textarea
                                placeholder="Ex: Contrato enviado para assinatura..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleConfirm} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Alteração
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
