"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createProduct, updateProduct, Product } from "@/services/product-service"
import { useToast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"

const productSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    type: z.enum(['module', 'inverter', 'structure', 'cable', 'transformer', 'other']),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    power: z.coerce.number().optional(),
    technology: z.string().optional(),
    stock_total: z.coerce.number().min(0).default(0),
    min_stock: z.coerce.number().min(0).default(5),
    price: z.coerce.number().min(0, "Preço deve ser maior ou igual a 0"),
    cost: z.coerce.number().min(0).optional(),
    category: z.string().optional(),
    specs: z.string().optional(),
    active: z.boolean().default(true)
})

type ProductFormValues = z.infer<typeof productSchema>

interface ProductFormProps {
    initialData?: Product
}

export function ProductForm({ initialData }: ProductFormProps) {
    const router = useRouter()
    const { showToast } = useToast()

    // Default values need to handle potential nulls from DB nicely
    const defaultValues: Partial<ProductFormValues> = initialData ? {
        name: initialData.name,
        type: initialData.type,
        manufacturer: initialData.manufacturer || "",
        model: initialData.model || "",
        power: initialData.power || undefined,
        technology: initialData.technology || "",
        stock_total: initialData.stock_total || 0,
        min_stock: initialData.min_stock || 5, // Default explicit
        price: initialData.price,
        cost: initialData.cost || 0,
        category: initialData.category || "",
        specs: initialData.specs ? JSON.stringify(initialData.specs, null, 2) : "{}",
        active: initialData.active ?? true
    } : {
        name: "",
        type: "module",
        manufacturer: "",
        model: "",
        power: undefined,
        technology: "",
        stock_total: 0,
        min_stock: 5,
        price: 0,
        cost: 0,
        category: "",
        specs: "{}",
        active: true
    }

    const form = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues
    })

    async function onSubmit(data: ProductFormValues) {
        try {
            let parsedSpecs = {}
            try {
                parsedSpecs = JSON.parse(data.specs || "{}")
            } catch (e) {
                // ignore
            }

            const payload: any = {
                ...data,
                specs: parsedSpecs
            }

            if (initialData) {
                await updateProduct(initialData.id, payload)
                showToast({
                    title: "Sucesso",
                    description: "Produto atualizado com sucesso!",
                    variant: "success",
                })
            } else {
                await createProduct(payload)
                showToast({
                    title: "Sucesso",
                    description: "Produto criado com sucesso!",
                    variant: "success",
                })
            }
            router.push("/admin/estoque")
            router.refresh()
        } catch (error) {
            showToast({
                title: "Erro",
                description: "Erro ao salvar produto.",
                variant: "error",
            })
            console.error(error)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl bg-white p-6 rounded-md border shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Nome do Produto</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Painel Solar 550W" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="module">Módulo (Painel)</SelectItem>
                                        <SelectItem value="inverter">Inversor</SelectItem>
                                        <SelectItem value="structure">Estrutura</SelectItem>
                                        <SelectItem value="cable">Cabo</SelectItem>
                                        <SelectItem value="transformer">Transformador</SelectItem>
                                        <SelectItem value="other">Outro</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="manufacturer"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fabricante</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Canadian Solar" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Modelo</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: CS6W-550" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoria (Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Monocristalino" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="power"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Potência (W)</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="Ex: 550" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="technology"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tecnologia</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Mono Perc" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Categoria (Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Premium" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-4 gap-4">
                    <FormField
                        control={form.control}
                        name="stock_total"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Estoque Total</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormDescription>Qtd. Física</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="min_stock"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Estoque Mínimo</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="5" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormDescription>Alerta</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Preço de Venda (R$)</FormLabel>
                                <FormControl>
                                    {/* Using type="number" with controlled input and coerce in zod */}
                                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="cost"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Custo Interno (R$) (Opcional)</FormLabel>
                                <FormControl>
                                    <Input type="number" step="0.01" {...field} onChange={e => field.onChange(e.target.valueAsNumber)} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="specs"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Especificações (JSON)</FormLabel>
                            <FormControl>
                                <Input placeholder='{"potencia": 550}' {...field} />
                            </FormControl>
                            <FormDescription>Para usuários avançados: insira dados técnicos em formato JSON.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onChange={(e) => field.onChange(e.target.checked)}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Ativo
                                </FormLabel>
                                <FormDescription>
                                    Se desmarcado, não aparecerá para seleção em novas propostas.
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancelar
                    </Button>
                    <Button type="submit">
                        {initialData ? 'Salvar Alterações' : 'Criar Produto'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
