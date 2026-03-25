"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, Pencil, Save } from "lucide-react"
import { useRouter } from "next/navigation"

import { updateContactNameAction } from "@/app/actions/contacts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

type ContactNameEditorProps = {
  contactId: string
  initialName: string
  canEdit?: boolean
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function ContactNameEditor({
  contactId,
  initialName,
  canEdit = true,
}: ContactNameEditorProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(initialName)

  useEffect(() => {
    setDraftName(initialName)
  }, [initialName])

  const normalizedInitialName = useMemo(() => normalizeName(initialName), [initialName])
  const normalizedDraftName = useMemo(() => normalizeName(draftName), [draftName])
  const hasChanges = normalizedDraftName !== normalizedInitialName

  const handleCancel = () => {
    setDraftName(initialName)
    setIsEditing(false)
  }

  const handleSave = () => {
    if (!canEdit || isPending) return

    const nextName = normalizeName(draftName)
    if (!nextName) {
      showToast({
        variant: "error",
        title: "Nome inválido",
        description: "Informe um nome válido para o contato.",
      })
      return
    }

    if (!hasChanges) {
      setIsEditing(false)
      return
    }

    startTransition(async () => {
      const result = await updateContactNameAction({
        contactId,
        fullName: nextName,
      })

      if (!result.success) {
        showToast({
          variant: "error",
          title: "Falha ao atualizar contato",
          description: result.error ?? "Não foi possível salvar o nome do contato.",
        })
        return
      }

      const summary = result.data
      const details = summary
        ? `indicações=${summary.indicacoes}, obras=${summary.obra_cards}, ` +
          `tarefas=${summary.tasks_client_name}, títulos=${summary.tasks_titles}, ` +
          `whatsapp=${summary.whatsapp_conversations}`
        : null
      const successMessage = result.message ?? "Nome atualizado com sucesso."

      showToast({
        variant: "success",
        title: "Nome atualizado",
        description: details ? `${successMessage} (${details})` : successMessage,
      })

      setIsEditing(false)
      router.refresh()
    })
  }

  if (!canEdit) return null

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        disabled={!isEditing || isPending}
        className="h-9 w-full sm:w-[320px]"
        placeholder="Nome do contato"
      />

      {!isEditing ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="mr-1 h-4 w-4" />
          Editar nome
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending || !hasChanges}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}
