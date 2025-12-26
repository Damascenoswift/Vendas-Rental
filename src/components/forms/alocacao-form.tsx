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

const alocacaoSchema = z.object({
    usina_id: z.string().uuid("Selecione uma usina"),
    cliente_id: z.string().uuid("Selecione um cliente"),
    tipo_alocacao: z.enum(["percentual", "fixo"]),
    valor: z.coerce.number().positive("Valor deve ser positivo"),
    data_inicio: z.string().min(1, "Data de início obrigatória"),
})

type AlocacaoFormValues = z.infer<typeof alocacaoSchema>

interface AlocacaoFormProps {
    usinas: { id: string; nome: string }[]
    clientes: { id: string; nome: string }[]
}

export function AlocacaoForm({ usinas, clientes }: AlocacaoFormProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<AlocacaoFormValues>({
        resolver: zodResolver(alocacaoSchema),
        defaultValues: {
            tipo_alocacao: "percentual",
            data_inicio: new Date().toISOString().split("T")[0],
        },
    })

    const tipoAlocacao = form.watch("tipo_alocacao")

    const onSubmit = async (values: AlocacaoFormValues) => {
        setIsSubmitting(true)
        try {
            const payload = {
                usina_id: values.usina_id,
                cliente_id: values.cliente_id,
                data_inicio: values.data_inicio,
                percentual_alocado: values.tipo_alocacao === 'percentual' ? values.valor : null,
                quantidade_kwh_alocado: values.tipo_alocacao === 'fixo' ? values.valor : null,
                status: 'ATIVO'
            }

            const { error } = await supabase
                .from("alocacoes_clientes")
                .insert(payload)

            if (error) throw error

            showToast({
                variant: "success",
                title: "Alocação realizada com sucesso!",
            })

            router.push("/admin/energia/alocacoes")
            router.refresh()
        } catch (error: any) {
            showToast({
                variant: "error",
                title: "Erro ao alocar",
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
                                <FormLabel>Cliente (Lead Aprovado)</FormLabel>
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
                                <FormLabel>Usina de Geração</FormLabel>
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
                        name="tipo_alocacao"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Alocação</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="percentual">Percentual (%)</SelectItem>
                                        <SelectItem value="fixo">Quantidade Fixa (kWh)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="valor"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {tipoAlocacao === 'percentual' ? 'Percentual (%)' : 'Quantidade (kWh)'}
                                </FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="data_inicio"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Data de Início</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
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
                            "Criar Alocação"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
