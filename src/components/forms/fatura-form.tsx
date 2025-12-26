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
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

const faturaSchema = z.object({
    cliente_id: z.string().uuid("Selecione um cliente"),
    usina_id: z.string().uuid("Selecione uma usina"),
    mes: z.string().regex(/^\d{4}-\d{2}$/, "Formato inválido"),
    valor_fatura: z.coerce.number().min(0),
    kwh_compensado: z.coerce.number().min(0),
    status_pagamento: z.enum(["ABERTO", "PAGO", "ATRASADO", "CANCELADO"]),
    observacoes: z.string().optional(),
})

type FaturaFormValues = z.infer<typeof faturaSchema>

interface FaturaFormProps {
    usinas: { id: string; nome: string }[]
    clientes: { id: string; nome: string }[]
}

export function FaturaForm({ usinas, clientes }: FaturaFormProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<FaturaFormValues>({
        resolver: zodResolver(faturaSchema),
        defaultValues: {
            valor_fatura: 0,
            kwh_compensado: 0,
            status_pagamento: "ABERTO",
            mes: new Date().toISOString().slice(0, 7) // YYYY-MM
        },
    })

    const onSubmit = async (values: FaturaFormValues) => {
        setIsSubmitting(true)
        try {
            const mesAnoDate = `${values.mes}-01`

            const { error } = await supabase
                .from("faturas_conciliacao")
                .insert({
                    ...values,
                    mes_ano: mesAnoDate,
                })

            if (error) throw error

            showToast({
                variant: "success",
                title: "Fatura registrada!",
            })

            router.push("/admin/energia/faturas")
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
                        name="cliente_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Cliente</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o cliente" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {clientes.map(cliente => (
                                            <SelectItem key={cliente.id} value={cliente.id}>
                                                {cliente.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="usina_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Usina Referente</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione a usina" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {usinas.map(usina => (
                                            <SelectItem key={usina.id} value={usina.id}>
                                                {usina.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="mes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mês de Competência</FormLabel>
                                <FormControl>
                                    <Input type="month" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="status_pagamento"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status de Pagamento</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="ABERTO">Aberto</SelectItem>
                                        <SelectItem value="PAGO">Pago</SelectItem>
                                        <SelectItem value="ATRASADO">Atrasado</SelectItem>
                                        <SelectItem value="CANCELADO">Cancelado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="valor_fatura"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valor a Receber (R$)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="kwh_compensado"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Energia Compensada (kWh)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="md:col-span-2">
                        <FormField
                            control={form.control}
                            name="observacoes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Observações (Opcional)</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Detalhes adicionais..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

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
                            "Gerar Fatura"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
