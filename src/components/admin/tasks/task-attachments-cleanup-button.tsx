"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { cleanupOldTaskPdfAttachments } from "@/services/task-service"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export function TaskAttachmentsCleanupButton() {
    const [isPending, startTransition] = useTransition()
    const [months, setMonths] = useState<"6" | "12">("12")
    const router = useRouter()
    const { showToast } = useToast()

    const olderThanMonths = months === "6" ? 6 : 12
    const periodLabel = olderThanMonths === 6 ? "6 meses" : "1 ano"

    const handleCleanup = () => {
        const confirmed = window.confirm(
            `Apagar permanentemente todos os PDFs de tarefas com mais de ${periodLabel}? Esta ação não pode ser desfeita.`
        )
        if (!confirmed) return

        startTransition(async () => {
            const result = await cleanupOldTaskPdfAttachments({ olderThanMonths })
            if (result?.error) {
                showToast({
                    title: "Erro ao limpar PDFs",
                    description: result.error,
                    variant: "error",
                })
                return
            }

            showToast({
                title: "Limpeza concluída",
                description: `${result?.deleted ?? 0} PDF(s) removido(s).`,
                variant: "success",
            })
            router.refresh()
        })
    }

    return (
        <div className="flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50/60 px-2 py-1">
            <select
                className="h-8 rounded-md border border-input bg-white px-2 text-xs"
                value={months}
                onChange={(event) => setMonths(event.target.value === "6" ? "6" : "12")}
                disabled={isPending}
                aria-label="Período para limpeza de PDFs antigos"
            >
                <option value="12">Mais de 1 ano</option>
                <option value="6">Mais de 6 meses</option>
            </select>
            <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleCleanup}
                disabled={isPending}
            >
                {isPending ? "Limpando..." : "Limpar PDFs antigos"}
            </Button>
        </div>
    )
}
