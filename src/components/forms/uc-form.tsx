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
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

const ucSchema = z.object({
    cliente_id: z.string().uuid("Selecione um cliente"),
    codigo_uc_fatura: z.string().min(1, "Código da UC é obrigatório"),
    codigo_instalacao: z.string().min(1, "Código da instalação é obrigatório"),
    tipo_uc: z.enum(["normal", "b_optante"]),
    atendido_via_consorcio: z.boolean().default(false),
    transferida_para_consorcio: z.boolean().default(false),
    ativo: z.boolean().default(true),
    observacoes: z.string().optional(),
})

type UcFormValues = z.infer<typeof ucSchema>

interface UcFormProps {
    clientes: { id: string; nome: string | null }[]
}

export function UcForm({ clientes }: UcFormProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<UcFormValues>({
        resolver: zodResolver(ucSchema) as any,
        defaultValues: {
            tipo_uc: "normal",
            atendido_via_consorcio: false,
            transferida_para_consorcio: false,
            ativo: true,
        },
    })

    const onSubmit = async (values: UcFormValues) => {
        setIsSubmitting(true)
        try {
            const payload = {
                cliente_id: values.cliente_id,
                codigo_uc_fatura: values.codigo_uc_fatura.trim(),
                codigo_instalacao: values.codigo_instalacao.trim(),
                tipo_uc: values.tipo_uc,
                atendido_via_consorcio: values.atendido_via_consorcio,
                transferida_para_consorcio: values.transferida_para_consorcio,
                ativo: values.ativo,
                observacoes: values.observacoes ?? null,
            }

            const { error } = await supabase
                .from("energia_ucs")
                .insert(payload)

            if (error) throw error

            showToast({
                variant: "success",
                title: "UC cadastrada com sucesso!",
            })

            router.push("/admin/energia/ucs")
            router.refresh()
        } catch (error: any) {
            showToast({
                variant: "error",
                title: "Erro ao salvar UC",
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
                                        {clientes.map((cliente) => (
                                            <SelectItem key={cliente.id} value={cliente.id}>
                                                {cliente.nome || cliente.id}
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
                        name="codigo_uc_fatura"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Código da UC (fatura)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: 12345678" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control as any}
                        name="codigo_instalacao"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Código da instalação</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: 00002157080" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control as any}
                        name="tipo_uc"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de UC</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="b_optante">B-optante</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                        control={form.control as any}
                        name="atendido_via_consorcio"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-3">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(value) => field.onChange(Boolean(value))}
                                    />
                                </FormControl>
                                <FormLabel className="mb-0">Atendido via consórcio</FormLabel>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control as any}
                        name="transferida_para_consorcio"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-3">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(value) => field.onChange(Boolean(value))}
                                    />
                                </FormControl>
                                <FormLabel className="mb-0">Transferida para consórcio</FormLabel>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control as any}
                        name="ativo"
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-3">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={(value) => field.onChange(Boolean(value))}
                                    />
                                </FormControl>
                                <FormLabel className="mb-0">UC ativa</FormLabel>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control as any}
                    name="observacoes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Observações</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Detalhes sobre a UC" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

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
                            "Salvar UC"
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
