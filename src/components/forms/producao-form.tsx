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

const producaoSchema = z.object({
    usina_id: z.string().uuid("Selecione uma usina"),
    mes: z.string().regex(/^\d{4}-\d{2}$/, "Formato inválido"), // YYYY-MM from input type="month"
    kwh_gerado: z.coerce.number().min(0, "Valor deve ser positivo"),
})

type ProducaoFormValues = z.infer<typeof producaoSchema>

interface ProducaoFormProps {
    usinas: { id: string; nome: string }[]
}

export function ProducaoForm({ usinas }: ProducaoFormProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<ProducaoFormValues>({
        resolver: zodResolver(producaoSchema) as any,
        defaultValues: {
            kwh_gerado: 0,
            mes: new Date().toISOString().slice(0, 7) // YYYY-MM
        },
    })

    const onSubmit = async (values: ProducaoFormValues) => {
        setIsSubmitting(true)
        try {
            // Append day 01 to make it a full date
            const mesAnoDate = `${values.mes}-01`

            const { error } = await supabase
                .from("historico_producao")
                .insert({
                    usina_id: values.usina_id,
                    mes_ano: mesAnoDate,
                    kwh_gerado: values.kwh_gerado
                })

            if (error) {
                if (error.code === '23505') throw new Error("Já existe registro para esta usina neste mês.")
                throw error
            }

            showToast({
                variant: "success",
                title: "Produção registrada com sucesso!",
            })

            router.push("/admin/energia/producao")
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
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control as any}
                        name="usina_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Usina</FormLabel>
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
                        control={form.control as any}
                        name="mes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mês de Referência</FormLabel>
                                <FormControl>
                                    <Input type="month" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control as any}
                        name="kwh_gerado"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Energia Gerada (kWh)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} />
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
                            "Salvar Registro"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
