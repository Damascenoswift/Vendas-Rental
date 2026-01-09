"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { createTask, TaskPriority, Department } from "@/services/task-service"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

const taskSchema = z.object({
    title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
    description: z.string().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    department: z.enum(["VENDAS", "CADASTRO", "ENERGIA", "JURIDICO", "FINANCEIRO", "OUTRO"]),
    due_date: z.string().optional(), // YYYY-MM-DD
    assignee_id: z.string().optional(),
    indicacao_id: z.string().optional(), // Linked lead
})

type TaskFormValues = z.infer<typeof taskSchema>

export function TaskDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [users, setUsers] = useState<{ id: string, name: string }[]>([])
    const [leads, setLeads] = useState<{ id: string, nome: string }[]>([])

    const { showToast } = useToast()

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskSchema),
        defaultValues: {
            priority: "MEDIUM",
            department: "OUTRO",
            description: "",
        },
    })

    // Fetch dependencies when opening
    useEffect(() => {
        if (open) {
            fetchUsers()
            fetchLeads()
        }
    }, [open])

    async function fetchUsers() {
        // Fetch users for assignment (simulated logic or real table if RLS allows)
        // Ideally this should be a server action or a proper secure fetch
        const { data } = await supabase.from('users').select('id, name').order('name')
        if (data) setUsers(data)
    }

    async function fetchLeads() {
        // Fetch active leads to link
        const { data } = await supabase.from('indicacoes').select('id, nome').limit(50).order('created_at', { ascending: false })
        if (data) setLeads(data)
    }

    async function onSubmit(data: TaskFormValues) {
        setIsLoading(true)
        try {
            // Find client name if lead is selected
            let clientName = undefined
            if (data.indicacao_id) {
                const lead = leads.find(l => l.id === data.indicacao_id)
                if (lead) clientName = lead.nome
            }

            const result = await createTask({
                ...data,
                client_name: clientName
            })

            if (result.error) {
                showToast({ title: "Erro ao criar tarefa", description: result.error, variant: "error" })
            } else {
                showToast({ title: "Tarefa criada!", variant: "success" })
                setOpen(false)
                form.reset()
            }
        } catch (error) {
            console.error(error)
            showToast({ title: "Erro inesperado", variant: "error" })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4" />
                    Nova Tarefa
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Criar Nova Tarefa</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Título da Tarefa</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Analisar Contrato Energisa" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="department"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Setor</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="VENDAS">Vendas</SelectItem>
                                                <SelectItem value="CADASTRO">Cadastro</SelectItem>
                                                <SelectItem value="ENERGIA">Energia</SelectItem>
                                                <SelectItem value="JURIDICO">Jurídico</SelectItem>
                                                <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                                                <SelectItem value="OUTRO">Outro</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="priority"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Prioridade</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="LOW">Baixa</SelectItem>
                                                <SelectItem value="MEDIUM">Média</SelectItem>
                                                <SelectItem value="HIGH">Alta</SelectItem>
                                                <SelectItem value="URGENT">Urgente</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="assignee_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Responsável</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Atribuir a..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {users.map(u => (
                                                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="due_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Data Limite</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="indicacao_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vincular Cliente (Opcional)</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Buscar cliente..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="max-h-[200px]">
                                            <SelectItem value="none">Nenhum</SelectItem>
                                            {leads.map(lead => (
                                                <SelectItem key={lead.id} value={lead.id}>{lead.nome}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descrição</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Detalhes da tarefa..." className="resize-none" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end pt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="mr-2">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Criar Tarefa
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
