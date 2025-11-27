"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createQuickLead } from "@/app/actions/quick-lead"
import { useToast } from "@/hooks/use-toast"
import { formatPhone } from "@/lib/formatters"


const schema = z.object({
    nome: z.string().min(1, "Nome é obrigatório"),
    whatsapp: z.string().min(14, "WhatsApp inválido"),
    observacao: z.string().optional(),
    marca: z.enum(["rental", "dorata"]),
})

type FormValues = z.infer<typeof schema>

export function QuickIndicationDialog() {
    const [open, setOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { showToast } = useToast()

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            marca: "rental",
        },
    })

    const selectedMarca = watch("marca")

    const onSubmit = async (data: FormValues) => {
        setIsSubmitting(true)
        try {
            const formData = new FormData()
            formData.append("nome", data.nome)
            formData.append("whatsapp", data.whatsapp)
            formData.append("marca", data.marca)
            if (data.observacao) formData.append("observacao", data.observacao)

            const result = await createQuickLead({}, formData)

            if (result.error) {
                showToast({
                    variant: "error",
                    title: "Erro",
                    description: result.error,
                })
            } else {
                showToast({
                    variant: "success",
                    title: "Sucesso!",
                    description: "Indicação rápida enviada.",
                })
                setOpen(false)
                reset()
            }
        } catch (error) {
            showToast({
                variant: "error",
                title: "Erro inesperado",
                description: "Tente novamente.",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed">
                    <Plus className="h-4 w-4" />
                    Indicação Rápida
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Indicação Rápida</DialogTitle>
                    <DialogDescription>
                        Preencha os dados básicos do lead para atendimento imediato.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="marca">Marca</Label>
                        <select
                            id="marca"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            {...register("marca")}
                        >
                            <option value="rental">Rental</option>
                            <option value="dorata">Dorata</option>
                        </select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="nome">Nome do Cliente</Label>
                        <Input id="nome" {...register("nome")} placeholder="Nome completo" />
                        {errors.nome && (
                            <span className="text-xs text-destructive">{errors.nome.message}</span>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="whatsapp">WhatsApp</Label>
                        <Input
                            id="whatsapp"
                            {...register("whatsapp")}
                            placeholder="(00) 00000-0000"
                            onChange={(e) => {
                                setValue("whatsapp", formatPhone(e.target.value))
                            }}
                        />
                        {errors.whatsapp && (
                            <span className="text-xs text-destructive">
                                {errors.whatsapp.message}
                            </span>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="observacao">Observação</Label>
                        <textarea
                            id="observacao"
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Detalhes sobre o que o cliente procura..."
                            {...register("observacao")}
                        />
                    </div>



                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Indicação
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
