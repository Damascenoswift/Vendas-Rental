"use client"

import { useState, useTransition } from "react"
import { updateIndicationStatus } from "@/app/actions/admin-indications"
import { useToast } from "@/hooks/use-toast"

type IndicationStatusSelectProps = {
    id: string
    initialStatus: string
}

const statusOptions = [
    { value: "EM_ANALISE", label: "Em Análise" },
    { value: "AGUARDANDO_ASSINATURA", label: "Aguardando Assinatura" },
    { value: "FALTANDO_DOCUMENTACAO", label: "Faltando Documentação" },
    { value: "APROVADA", label: "Aprovada" },
    { value: "REJEITADA", label: "Rejeitada" },
    { value: "CONCLUIDA", label: "Concluída" },
]

export function IndicationStatusSelect({ id, initialStatus }: IndicationStatusSelectProps) {
    const [status, setStatus] = useState(initialStatus)
    const [isPending, startTransition] = useTransition()
    const { showToast } = useToast()

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value
        setStatus(newStatus)

        startTransition(async () => {
            const result = await updateIndicationStatus(id, newStatus)
            if (result.error) {
                showToast({
                    variant: "error",
                    title: "Erro ao atualizar status",
                    description: result.error,
                })
                // Revert status on error
                setStatus(initialStatus)
            } else {
                showToast({
                    variant: "success",
                    title: "Status atualizado",
                    description: "O status da indicação foi atualizado com sucesso.",
                })
            }
        })
    }

    return (
        <select
            value={status}
            onChange={handleChange}
            disabled={isPending}
            className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
        >
            {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    )
}
