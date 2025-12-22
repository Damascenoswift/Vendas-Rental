"use client"

import { useState, type ChangeEvent, useRef } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { Loader2, Upload } from "lucide-react"

// Schema definition
const schema = z.object({
    cliente_nome: z.string().min(1, "Nome do cliente é obrigatório"),
    // Coerce number, but if it results in 0 (from empty string), treat as optional/null if desired.
    // Standard z.coerce.number().optional() works but empty string -> 0.
    // If we want to allow empty:
    cliente_gasto_mensal: z.union([z.number(), z.string()])
        .transform((val) => {
            if (val === "" || val === undefined || val === null) return null;
            const num = Number(val);
            return isNaN(num) ? null : num;
        })
        .optional(),
    is_b_optante: z.boolean().default(false),
})

type FormValues = z.infer<typeof schema>

interface OrcamentoFormProps {
    userId: string
}

export function OrcamentoForm({ userId }: OrcamentoFormProps) {
    const { showToast } = useToast()
    const [file, setFile] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            cliente_nome: "",
            cliente_gasto_mensal: undefined, // undefined shows as empty in input
            is_b_optante: false,
        },
    })

    // Handle file selection
    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) {
            if (f.size > 10 * 1024 * 1024) {
                showToast({ variant: "error", title: "Arquivo muito grande", description: "Máximo 10MB" })
                e.target.value = ""
                setFile(null)
                return
            }
            setFile(f)
        } else {
            setFile(null)
        }
    }

    const onSubmit = async (values: FormValues) => {
        setIsSubmitting(true)

        try {
            // 1. Create record
            const { data: orcamento, error: insertError } = await supabase
                .from("orcamentos")
                .insert({
                    user_id: userId,
                    cliente_nome: values.cliente_nome,
                    cliente_gasto_mensal: typeof values.cliente_gasto_mensal === 'number' ? values.cliente_gasto_mensal : null,
                    is_b_optante: values.is_b_optante,
                    status: "PENDENTE"
                })
                .select("id")
                .single()

            if (insertError || !orcamento) {
                throw new Error(insertError?.message || "Erro ao criar orçamento")
            }

            // 2. Upload file if exists
            if (file) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${userId}/${orcamento.id}/conta_energia.${fileExt}`

                // Upload to 'orcamentos' bucket
                const { error: uploadError } = await supabase.storage
                    .from("orcamentos")
                    .upload(fileName, file, { upsert: true })

                if (uploadError) {
                    console.error("Upload error:", uploadError)
                    showToast({ variant: "info", title: "Atenção", description: "Orçamento criado, mas erro ao enviar arquivo." })
                } else {
                    const { data: publicUrlData } = supabase.storage.from("orcamentos").getPublicUrl(fileName)

                    if (publicUrlData) {
                        await supabase
                            .from("orcamentos")
                            .update({ conta_energia_url: publicUrlData.publicUrl })
                            .eq("id", orcamento.id)
                    }
                }
            }

            showToast({ variant: "success", title: "Sucesso!", description: "Orçamento solicitado com sucesso." })
            form.reset({
                cliente_nome: "",
                cliente_gasto_mensal: undefined,
                is_b_optante: false,
            })
            setFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ""

        } catch (error: any) {
            console.error(error)
            showToast({ variant: "error", title: "Erro", description: error.message || "Ocorreu um erro inesperado." })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="rounded-xl border bg-background p-6 shadow-sm">
            <div className="mb-6">
                <h2 className="text-xl font-semibold">Solicitar Orçamento</h2>
                <p className="text-sm text-muted-foreground">Preencha os dados e anexe a conta de energia (opcional).</p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    <FormField
                        control={form.control}
                        name="cliente_nome"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nome do Cliente</FormLabel>
                                <FormControl>
                                    <Input placeholder="Nome completo" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="cliente_gasto_mensal"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Gasto Mensal (Opção)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            placeholder="R$ 0,00"
                                            {...field}
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(e.target.value)} // Pass string to be transformed
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="is_b_optante"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm mt-8 md:mt-0 lg:mt-0 xl:mt-0 2xl:mt-0 self-end h-10 items-center">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            // Checkbox onChange returns boolean or event depending on implementation. 
                                            // Native input checkbox onChange event: e.target.checked
                                            // My Checkbox component uses native input props.
                                            // react-hook-form Controller passes onChange that expects value.
                                            onChange={(e) => field.onChange(e.target.checked)}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Cliente é B-Optante?
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <FormLabel>Conta de Energia (Opcional)</FormLabel>
                        <div className="flex items-center gap-4">
                            <Input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                className="cursor-pointer"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Formatos aceitos: PDF, JPG, PNG (Max 10MB)</p>
                    </div>

                    <Button type="submit" disabled={isSubmitting} className="w-full">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            "Solicitar Orçamento"
                        )}
                    </Button>

                </form>
            </Form>
        </div>
    )
}
