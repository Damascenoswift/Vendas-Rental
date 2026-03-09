"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { deleteProposal } from "@/app/actions/proposals"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type DeleteProposalButtonProps = {
  proposalId: string
  clientName?: string | null
}

export function DeleteProposalButton({ proposalId, clientName }: DeleteProposalButtonProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    try {
      const result = await deleteProposal(proposalId)
      if (result.error) {
        showToast({
          variant: "error",
          title: "Erro ao excluir",
          description: result.error,
        })
        return
      }

      showToast({
        variant: "success",
        title: "Orçamento excluído",
        description: "O orçamento foi removido com sucesso.",
      })
      router.refresh()
    } catch {
      showToast({
        variant: "error",
        title: "Erro inesperado",
        description: "Ocorreu um erro ao tentar excluir o orçamento.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Isso excluirá permanentemente o orçamento
            {clientName ? ` de ${clientName}` : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
            {isDeleting ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
