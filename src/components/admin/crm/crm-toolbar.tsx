"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { syncCrmCardsFromIndicacoes } from "@/app/actions/crm"

export function CrmToolbar() {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { showToast } = useToast()

    const handleSync = () => {
        startTransition(async () => {
            const result = await syncCrmCardsFromIndicacoes()
            if (result?.error) {
                showToast({
                    variant: "error",
                    title: "Erro ao sincronizar",
                    description: result.error,
                })
                return
            }

            showToast({
                variant: "success",
                title: "Sincronização concluída",
                description: `${result?.created ?? 0} cards criados`,
            })
            router.refresh()
        })
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSync} disabled={isPending}>
                {isPending ? "Sincronizando..." : "Sincronizar indicações"}
            </Button>
        </div>
    )
}
