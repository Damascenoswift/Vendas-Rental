"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { backfillRentalTasksFromIndicacoes } from "@/services/task-service"

export function TaskBackfillButton() {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { showToast } = useToast()

    const handleBackfill = () => {
        const confirmed = confirm("Gerar tarefas para todas as indicações Rental? Isso pode criar tarefas duplicadas.")
        if (!confirmed) return

        startTransition(async () => {
            const result = await backfillRentalTasksFromIndicacoes()
            if (result?.error) {
                showToast({ title: "Erro no backfill", description: result.error, variant: "error" })
                return
            }
            showToast({
                title: "Backfill concluído",
                description: `Tarefas criadas: ${result?.created ?? 0}`,
                variant: "success",
            })
            router.refresh()
        })
    }

    return (
        <Button variant="outline" size="sm" onClick={handleBackfill} disabled={isPending}>
            {isPending ? "Gerando..." : "Gerar tarefas antigas"}
        </Button>
    )
}
