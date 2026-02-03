"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus } from "lucide-react"
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
    SelectGroup,
    SelectLabel
} from "@/components/ui/select"
import { createTask, TaskPriority, Department, getTaskAssignableUsers, getTaskLeadById } from "@/services/task-service"
import { useToast } from "@/hooks/use-toast"
import { LeadSelect } from "@/components/admin/tasks/lead-select"
import { getProfile } from "@/lib/auth"
import { Checkbox } from "@/components/ui/checkbox"

const taskSchema = z.object({
    title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
    description: z.string().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    department: z.enum(["vendas", "cadastro", "energia", "juridico", "financeiro", "ti", "diretoria", "outro"]),
    due_date: z.string().optional(), // YYYY-MM-DD
    assignee_id: z.string().optional(),
    indicacao_id: z.string().optional(), // Linked lead
    client_name: z.string().optional(),
    codigo_instalacao: z.string().optional(),
    status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"]).optional(),
    brand: z.enum(["rental", "dorata"]),
})

type TaskFormValues = z.infer<typeof taskSchema>

export function TaskDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [users, setUsers] = useState<{ id: string, name: string, department: string | null }[]>([])
    const [observerIds, setObserverIds] = useState<string[]>([])

    const { showToast } = useToast()

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskSchema),
        defaultValues: {
            priority: "MEDIUM",
            department: "outro",
            status: "TODO",
            brand: "rental",
            description: "",
            client_name: "",
        },
    })

    // Fetch dependencies when opening
    useEffect(() => {
        if (open) {
            fetchUsers()
        }
    }, [open])

    useEffect(() => {
        if (!open) {
            setObserverIds([])
        }
    }, [open])

    async function fetchUsers() {
        const data = await getTaskAssignableUsers()
        setUsers((data ?? []).map(u => ({
            id: u.id,
            name: u.name || "Sem Nome",
            department: u.department
        })))
    }

    async function onSubmit(data: TaskFormValues) {
        setIsLoading(true)
        try {
            // Find client name if lead is selected
            const manualClientName = data.client_name?.trim()
            let clientName = manualClientName || undefined
            if (data.indicacao_id && !clientName) {
                const lead = await getTaskLeadById(data.indicacao_id)
                if (lead?.nome) clientName = lead.nome
            }

            const result = await createTask({
                ...data,
                client_name: clientName,
                observer_ids: observerIds
            })

            if (result.error) {
                showToast({ title: "Erro ao criar tarefa", description: result.error, variant: "error" })
            } else {
                showToast({ title: "Tarefa criada!", variant: "success" })
                setOpen(false)
                form.reset()
                setObserverIds([])
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
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
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

                        <FormField
                            control={form.control}
                            name="brand"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Marca</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="rental">Rental Solar</SelectItem>
                                            <SelectItem value="dorata">Dorata</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Status Inicial</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="TODO">A Fazer</SelectItem>
                                            <SelectItem value="IN_PROGRESS">Em Andamento</SelectItem>
                                            <SelectItem value="REVIEW">Revisão</SelectItem>
                                            <SelectItem value="DONE">Concluído</SelectItem>
                                            <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                                                <SelectItem value="vendas">Vendas</SelectItem>
                                                <SelectItem value="cadastro">Cadastro</SelectItem>
                                                <SelectItem value="energia">Energia</SelectItem>
                                                <SelectItem value="juridico">Jurídico</SelectItem>
                                                <SelectItem value="financeiro">Financeiro</SelectItem>
                                                <SelectItem value="ti">TI</SelectItem>
                                                <SelectItem value="diretoria">Diretoria</SelectItem>
                                                <SelectItem value="outro">Outro</SelectItem>
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
                                                {Object.entries(
                                                    users.reduce((acc, user) => {
                                                        const dept = user.department ? user.department.toUpperCase() : "OUTROS"
                                                        if (!acc[dept]) acc[dept] = []
                                                        acc[dept].push(user)
                                                        return acc
                                                    }, {} as Record<string, typeof users>)
                                                ).map(([dept, deptUsers]) => (
                                                    <SelectGroup key={dept}>
                                                        <SelectLabel>{dept}</SelectLabel>
                                                        {deptUsers.map(u => (
                                                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                        ))}
                                                    </SelectGroup>
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

                        <div className="space-y-2">
                            <FormLabel>Observadores</FormLabel>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-md border p-2">
                                {users.map((user) => (
                                    <label key={user.id} className="flex items-center gap-2 text-xs">
                                        <Checkbox
                                            checked={observerIds.includes(user.id)}
                                            onChange={(event) => {
                                                const checked = event.currentTarget.checked
                                                setObserverIds((prev) => {
                                                    if (checked) return [...prev, user.id]
                                                    return prev.filter((id) => id !== user.id)
                                                })
                                            }}
                                        />
                                        <span>{user.name}</span>
                                    </label>
                                ))}
                                {users.length === 0 && (
                                    <span className="text-xs text-muted-foreground">Nenhum usuário disponível.</span>
                                )}
                            </div>
                        </div>

                        <FormField
                            control={form.control}
                            name="indicacao_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vincular Cliente (Opcional)</FormLabel>
                                    <FormControl>
                                    <LeadSelect
                                        value={field.value}
                                        onChange={(value) => field.onChange(value ?? undefined)}
                                        onSelectLead={(lead, source) => {
                                            form.setValue("client_name", lead.nome)
                                            if (source === 'contact') {
                                                form.setValue("indicacao_id", undefined)
                                                form.setValue("codigo_instalacao", undefined)
                                            } else {
                                                form.setValue("codigo_instalacao", lead.codigo_instalacao ?? undefined)
                                            }
                                        }}
                                    />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="client_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Cliente Manual (Opcional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Maria Silva" {...field} />
                                    </FormControl>
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
