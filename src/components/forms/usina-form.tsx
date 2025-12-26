"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

const usinaSchema = z.object({
    nome: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
    capacidade_total: z.coerce.number().min(0, "Capacidade deve ser positiva"),
    tipo: z.enum(["rental", "parceiro"]),
    investidor_user_id: z.string().optional(),
    modelo_negocio: z.string().optional(),
    status: z.enum(["ATIVA", "MANUTENCAO", "INATIVA"]),
})

type UsinaFormValues = z.infer<typeof usinaSchema>

interface UsinaFormProps {
    investors: { id: string; name: string | null; email: string }[]
    initialData?: any // Can be typed If needed
}

export function UsinaForm({ investors, initialData }: UsinaFormProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<UsinaFormValues>({
        resolver: zodResolver(usinaSchema),
        defaultValues: {
            nome: initialData?.nome || "",
            capacidade_total: initialData?.capacidade_total || 0,
            tipo: initialData?.tipo || "rental",
            investidor_user_id: initialData?.investidor_user_id || undefined,
            modelo_negocio: initialData?.modelo_negocio || "",
            status: initialData?.status || "ATIVA",
        },
    })

    const tipo = form.watch("tipo")

    const onSubmit = async (values: UsinaFormValues) => {
        setIsSubmitting(true)
        try {
            const payload = {
                ...values,
                investidor_user_id: values.tipo === 'parceiro' ? values.investidor_user_id : null
            }

            let error
            if (initialData?.id) {
                // Update
                const { error: updateError } = await supabase
                    .from("usinas")
                    .update(payload)
                    .eq("id", initialData.id)
                error = updateError
            } else {
                // Create
                const { error: insertError } = await supabase
                    .from("usinas")
                    .insert(payload)
                error = insertError
            }

            if (error) throw error

            showToast({
                variant: "success",
                title: initialData ? "Usina atualizada!" : "Usina criada!",
            })

            router.push("/admin/energia/usinas")
            router.refresh()
        } catch (error: any) {
            showToast({
                variant: "error",
                title: "Erro ao salvar",
                description: error.message,
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nome da Usina</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Usina Solar Norte" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="capacidade_total"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Capacidade Total (kWh/mês)</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="tipo"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Propriedade</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="rental">Própria (Rental)</SelectItem>
                                        <SelectItem value="parceiro">Parceiro / Investidor</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {tipo === 'parceiro' && (
                        <FormField
                            control={form.control}
                            name="investidor_user_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Investidor Responsável</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione o investidor" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {investors.map(inv => (
                                                <SelectItem key={inv.id} value={inv.id}>
                                                    {inv.name || inv.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Apenas usuários com perfil 'Investidor' aparecem aqui.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status Operacional</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o status" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="ATIVA">Ativa</SelectItem>
                                        <SelectItem value="MANUTENCAO">Em Manutenção</SelectItem>
                                        <SelectItem value="INATIVA">Inativa</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="modelo_negocio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Modelo de Negócio (Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Autoconsumo Remoto" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => router.back()}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            "Salvar Usina"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
