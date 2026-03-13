"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { runManualCogniSyncAction } from "@/app/actions/cogni-sync"

export function CogniSyncButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  const handleSync = () => {
    const confirmed = confirm("Executar sincronização manual da COGNI agora?")
    if (!confirmed) return

    startTransition(async () => {
      const result = await runManualCogniSyncAction({ monthsBack: 12, dryRun: false })

      if (!result.ok) {
        showToast({
          title: "Falha na sincronização COGNI",
          description: result.message || result.errors[0] || "Erro desconhecido.",
          variant: "error",
        })
        return
      }

      const summary =
        `fetched=${result.totals.fetched}, mapped=${result.totals.mapped}, ` +
        `upserted=${result.totals.upserted}, unresolved=${result.totals.unresolved}`

      showToast({
        title: result.skipped ? "Sincronização COGNI ignorada" : "Sincronização COGNI concluída",
        description: result.message ? `${result.message} (${summary})` : summary,
        variant: result.skipped ? "info" : "success",
      })

      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
      <RefreshCcw className="mr-2 h-4 w-4" />
      {isPending ? "Sincronizando..." : "Sincronizar COGNI"}
    </Button>
  )
}
