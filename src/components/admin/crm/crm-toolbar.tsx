"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { syncCrmCardsFromIndicacoes } from "@/app/actions/crm"

type Props = {
    brand: "dorata" | "rental"
}

export function CrmToolbar({ brand }: Props) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { showToast } = useToast()
    const brandLabel = brand === "rental" ? "Rental" : "Dorata"

    const handleSync = () => {
        startTransition(async () => {
            const result = await syncCrmCardsFromIndicacoes({ brand })
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
                description: `${result?.created ?? 0} cards criados (${brandLabel})`,
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
