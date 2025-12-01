"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { setIndicationFlags } from "@/app/actions/admin-indications"

type IndicationFlagsProps = {
    id: string
    assinadaEm: string | null
    compensadaEm: string | null
}

function formatDate(value: string | null) {
    if (!value) return "—"
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value))
    } catch {
        return "—"
    }
}

export function IndicationFlags({ id, assinadaEm, compensadaEm }: IndicationFlagsProps) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { showToast } = useToast()

    const toggle = (field: "assinada" | "compensada", current: boolean) => {
        startTransition(async () => {
            const payload =
                field === "assinada"
                    ? { assinada: !current }
                    : { compensada: !current }

            const result = await setIndicationFlags(id, payload)

            if (result.error) {
                showToast({
                    variant: "error",
                    title: "Erro ao atualizar",
                    description: result.error,
                })
                return
            }

            showToast({
                variant: "success",
                title: "Atualizado",
                description:
                    field === "assinada"
                        ? !current
                            ? "Marcada como assinada."
                            : "Assinatura removida."
                        : !current
                          ? "Marcada como compensada."
                          : "Compensação removida.",
            })

            router.refresh()
        })
    }

    return (
        <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Assinada em</span>
                <span className="font-medium text-foreground">{formatDate(assinadaEm)}</span>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => toggle("assinada", Boolean(assinadaEm))}
                >
                    {assinadaEm ? "Remover marcação" : "Marcar como assinada"}
                </Button>
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Compensada em</span>
                <span className="font-medium text-foreground">{formatDate(compensadaEm)}</span>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => toggle("compensada", Boolean(compensadaEm))}
                >
                    {compensadaEm ? "Remover marcação" : "Marcar como compensada"}
                </Button>
            </div>
        </div>
    )
}
