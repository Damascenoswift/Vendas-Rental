"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { deleteContactAction } from "@/app/actions/contacts"
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
import { useToast } from "@/hooks/use-toast"

type DeleteContactButtonProps = {
  contactId: string
  contactName?: string | null
  compact?: boolean
}

export function DeleteContactButton({
  contactId,
  contactName,
  compact = false,
}: DeleteContactButtonProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    try {
      const result = await deleteContactAction(contactId)

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao excluir contato",
          description: result.error || "Não foi possível excluir este contato.",
        })
        return
      }

      showToast({
        variant: "success",
        title: "Contato excluído",
        description: result.message || "O contato foi removido com sucesso.",
      })
      router.refresh()
    } catch {
      showToast({
        variant: "error",
        title: "Erro inesperado",
        description: "Não foi possível concluir a exclusão do contato.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size={compact ? "icon" : "sm"}
          variant={compact ? "ghost" : "destructive"}
          disabled={isDeleting}
          className={compact ? "text-red-600 hover:text-red-700 hover:bg-red-50" : ""}
          aria-label="Excluir contato"
          title="Excluir contato"
        >
          {isDeleting ? (
            <Loader2 className={compact ? "h-4 w-4 animate-spin" : "mr-1 h-4 w-4 animate-spin"} />
          ) : (
            <Trash2 className={compact ? "h-4 w-4" : "mr-1 h-4 w-4"} />
          )}
          {compact ? <span className="sr-only">Excluir</span> : "Excluir"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação remove o contato permanentemente
            {contactName ? ` (${contactName})` : ""}. Referências em tarefas/obras/WhatsApp serão desvinculadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
            disabled={isDeleting}
          >
            {isDeleting ? "Excluindo..." : "Excluir contato"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
