"use client"

import { useState, useEffect, useRef, type ChangeEvent } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus } from "lucide-react"

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
import { createTask, getTaskAssignableUsers, getTaskLeadById, getTaskProposalOptions, type TaskProposalOption } from "@/services/task-service"
import { useToast } from "@/hooks/use-toast"
import { LeadSelect } from "@/components/admin/tasks/lead-select"
import { Checkbox } from "@/components/ui/checkbox"
import { uploadTaskPdfAttachment, validateTaskPdfAttachment } from "@/lib/task-attachments"

const taskSchema = z
    .object({
        title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
        description: z.string().optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
        department: z.enum(["vendas", "cadastro", "energia", "juridico", "financeiro", "ti", "diretoria", "outro"]),
        due_date: z.string().optional(), // YYYY-MM-DD
        assignee_id: z.string().optional(),
        visibility_scope: z.enum(["TEAM", "RESTRICTED"]),
        indicacao_id: z.string().optional(), // Linked lead
        contact_id: z.string().optional(),
        proposal_id: z.string().optional(),
        client_name: z.string().optional(),
        codigo_instalacao: z.string().optional(),
        status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"]).optional(),
        brand: z.enum(["rental", "dorata"]),
    })
    .superRefine((values, ctx) => {
        if (values.visibility_scope === "RESTRICTED" && !values.assignee_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["assignee_id"],
                message: "Selecione um responsável para tarefa restrita.",
            })
        }
    })

type TaskFormValues = z.infer<typeof taskSchema>

export function TaskDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [users, setUsers] = useState<{ id: string, name: string, department: string | null }[]>([])
    const [observerIds, setObserverIds] = useState<string[]>([])
    const [proposalOptions, setProposalOptions] = useState<TaskProposalOption[]>([])
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
    const attachmentInputRef = useRef<HTMLInputElement>(null)

    const { showToast } = useToast()

    const form = useForm<TaskFormValues>({
        resolver: zodResolver(taskSchema),
        defaultValues: {
            priority: "MEDIUM",
            department: "outro",
            status: "TODO",
            brand: "rental",
            visibility_scope: "RESTRICTED",
            description: "",
            client_name: "",
        },
    })
    const selectedBrand = form.watch("brand")
    const visibilityScope = form.watch("visibility_scope")
    const visibleProposalOptions = proposalOptions.filter((proposal) => {
        if (!proposal.brand) return true
        return proposal.brand === selectedBrand
    })

    // Fetch dependencies when opening
    useEffect(() => {
        if (open) {
            fetchUsers()
            fetchProposalOptions()
        }
    }, [open])

    useEffect(() => {
        if (!open) {
            setObserverIds([])
            setAttachmentFile(null)
            if (attachmentInputRef.current) {
                attachmentInputRef.current.value = ""
            }
        }
    }, [open])

    function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null
        if (!file) {
            setAttachmentFile(null)
            return
        }

        const validationError = validateTaskPdfAttachment(file)
        if (validationError) {
            showToast({ title: "Arquivo inválido", description: validationError, variant: "error" })
            event.target.value = ""
            setAttachmentFile(null)
            return
        }

        setAttachmentFile(file)
    }

    async function fetchUsers() {
        const data = await getTaskAssignableUsers()
        setUsers((data ?? []).map(u => ({
            id: u.id,
            name: u.name || "Sem Nome",
            department: u.department
        })))
    }

    async function fetchProposalOptions() {
        const data = await getTaskProposalOptions()
        setProposalOptions(data ?? [])
    }

    async function onSubmit(data: TaskFormValues) {
        setIsLoading(true)
        try {
            const selectedProposal = data.proposal_id
                ? proposalOptions.find((proposal) => proposal.id === data.proposal_id) ?? null
                : null

            // Find client name if lead is selected
            const manualClientName = data.client_name?.trim()
            let clientName = manualClientName || undefined
            if (!clientName && selectedProposal) {
                clientName = selectedProposal.client_name ?? selectedProposal.contact_name ?? undefined
            }
            if (data.indicacao_id && !clientName) {
                const lead = await getTaskLeadById(data.indicacao_id)
                if (lead?.nome) clientName = lead.nome
            }

            const result = await createTask({
                ...data,
                brand: selectedProposal?.brand ?? data.brand,
                indicacao_id: data.indicacao_id ?? selectedProposal?.client_id ?? undefined,
                contact_id: data.contact_id ?? selectedProposal?.contact_id ?? undefined,
                codigo_instalacao: data.codigo_instalacao ?? selectedProposal?.codigo_instalacao ?? undefined,
                client_name: clientName,
                observer_ids: observerIds
            })

            if (result.error) {
                showToast({ title: "Erro ao criar tarefa", description: result.error, variant: "error" })
            } else {
                const createdTaskId = (result as { taskId?: string | null }).taskId ?? null
                let attachmentError: string | null = null

                if (attachmentFile && !createdTaskId) {
                    attachmentError = "A tarefa foi criada, mas não foi possível identificar o ID para anexar o PDF."
                } else if (attachmentFile && createdTaskId) {
                    const uploadResult = await uploadTaskPdfAttachment(createdTaskId, attachmentFile)
                    if (uploadResult.error) {
                        attachmentError = uploadResult.error
                    }
                }

                if (attachmentError) {
                    showToast({
                        title: "Tarefa criada com alerta",
                        description: `Tarefa criada, mas o PDF não foi anexado: ${attachmentError}`,
                        variant: "info",
                    })
                } else if (attachmentFile) {
                    showToast({ title: "Tarefa criada com PDF anexado!", variant: "success" })
                } else {
                    showToast({ title: "Tarefa criada!", variant: "success" })
                }
                setOpen(false)
                form.reset()
                setObserverIds([])
                setAttachmentFile(null)
                if (attachmentInputRef.current) {
                    attachmentInputRef.current.value = ""
                }
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
                                name="visibility_scope"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Modelo de visibilidade</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="TEAM">Equipe (todos visualizam)</SelectItem>
                                                <SelectItem value="RESTRICTED">Restrita (responsável + observadores)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
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
                            {visibilityScope === "RESTRICTED" && (
                                <p className="text-xs text-muted-foreground">
                                    Em tarefas restritas, acesso apenas do responsável e observadores selecionados.
                                </p>
                            )}
                        </div>

                        <FormField
                            control={form.control}
                            name="proposal_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vincular Orçamento (Opcional)</FormLabel>
                                    <Select
                                        value={field.value ?? "__none"}
                                        onValueChange={(value) => {
                                            if (value === "__none") {
                                                field.onChange(undefined)
                                                return
                                            }

                                            field.onChange(value)
                                            const selectedProposal = proposalOptions.find((proposal) => proposal.id === value)
                                            if (!selectedProposal) return

                                            if (selectedProposal.brand) {
                                                form.setValue("brand", selectedProposal.brand)
                                            }
                                            if (selectedProposal.client_id) {
                                                form.setValue("indicacao_id", selectedProposal.client_id)
                                            }
                                            if (selectedProposal.contact_id) {
                                                form.setValue("contact_id", selectedProposal.contact_id)
                                            }
                                            if (selectedProposal.client_name) {
                                                form.setValue("client_name", selectedProposal.client_name)
                                            } else if (selectedProposal.contact_name) {
                                                form.setValue("client_name", selectedProposal.contact_name)
                                            }
                                            if (selectedProposal.codigo_instalacao) {
                                                form.setValue("codigo_instalacao", selectedProposal.codigo_instalacao)
                                            }
                                        }}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um orçamento" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="__none">Sem vínculo de orçamento</SelectItem>
                                            {visibleProposalOptions.map((proposal) => {
                                                const totalLabel = proposal.total_value == null
                                                    ? "Sem valor"
                                                    : proposal.total_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                                const clientLabel = proposal.client_name || proposal.contact_name || "Cliente não identificado"
                                                const statusLabel = proposal.status || "draft"
                                                return (
                                                    <SelectItem key={proposal.id} value={proposal.id}>
                                                        {clientLabel} • {proposal.id.slice(0, 8)} • {statusLabel} • {totalLabel}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Ao vincular orçamento, cliente e indicação são preenchidos automaticamente.
                                    </p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="indicacao_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vincular Indicação (Opcional)</FormLabel>
                                    <FormControl>
                                        <LeadSelect
                                            mode="leads"
                                            leadBrand={selectedBrand}
                                            value={field.value}
                                            onChange={(value) => field.onChange(value ?? undefined)}
                                            onSelectLead={(lead) => {
                                                form.setValue("proposal_id", undefined)
                                                form.setValue("client_name", lead.nome)
                                                form.setValue("codigo_instalacao", lead.codigo_instalacao ?? undefined)
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="contact_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vincular Contato (Opcional)</FormLabel>
                                    <FormControl>
                                        <LeadSelect
                                            mode="contacts"
                                            value={field.value}
                                            onChange={(value) => field.onChange(value ?? undefined)}
                                            onSelectContact={(contact) => {
                                                const contactName =
                                                    contact.full_name
                                                    || [contact.first_name, contact.last_name].filter(Boolean).join(" ")
                                                    || contact.email
                                                    || contact.whatsapp
                                                    || contact.phone
                                                    || contact.mobile
                                                    || ""

                                                form.setValue("proposal_id", undefined)
                                                if (contactName) {
                                                    form.setValue("client_name", contactName)
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
                                    <FormLabel>Comentário inicial</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Adicione um comentário inicial..." className="resize-none" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-2">
                            <FormLabel>Anexo PDF (Opcional)</FormLabel>
                            <Input
                                ref={attachmentInputRef}
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={handleAttachmentChange}
                            />
                            <p className="text-xs text-muted-foreground">
                                Apenas PDF, até 10MB.
                            </p>
                        </div>

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
