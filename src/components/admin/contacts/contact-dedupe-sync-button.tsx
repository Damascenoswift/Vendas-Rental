"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCcw } from "lucide-react"

import { syncDuplicateContactsByPhoneAction } from "@/app/actions/contacts"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

type ContactDedupeSyncButtonProps = {
  canSync: boolean
  duplicateGroups: number
  duplicateContacts: number
}

export function ContactDedupeSyncButton({
  canSync,
  duplicateGroups,
  duplicateContacts,
}: ContactDedupeSyncButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  const handleSync = () => {
    if (!canSync) {
      showToast({
        variant: "error",
        title: "Sem permissão",
        description: "Apenas administradores podem executar a sincronização de contatos.",
      })
      return
    }

    if (duplicateGroups === 0) {
      showToast({
        variant: "info",
        title: "Nenhum duplicado",
        description: "Não há contatos duplicados por número para consolidar.",
      })
      return
    }

    const confirmed = confirm(
      `Sincronizar ${duplicateGroups} grupo(s) duplicado(s) e manter um único contato por número? ` +
        `${duplicateContacts} contato(s) devem ser consolidados.`
    )

    if (!confirmed) return

    startTransition(async () => {
      const result = await syncDuplicateContactsByPhoneAction()

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha na sincronização",
          description: result.error ?? "Erro inesperado ao consolidar contatos duplicados.",
        })
        return
      }

      const summary = result.data
      const details = summary
        ? `grupos=${summary.groups_merged}/${summary.groups_found}, removidos=${summary.contacts_removed}, ` +
          `propostas=${summary.reassigned.proposals}, tarefas=${summary.reassigned.tasks}, ` +
          `obras=${summary.reassigned.obra_cards}, whatsapp=${summary.reassigned.whatsapp_conversations}`
        : null

      showToast({
        variant: "success",
        title: "Sincronização concluída",
        description: details ? `${result.message ?? "Concluído"} (${details})` : result.message,
      })

      router.refresh()
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending || !canSync}>
      <RefreshCcw className="mr-2 h-4 w-4" />
      {isPending ? "Sincronizando..." : "Sincronizar duplicados"}
    </Button>
  )
}
