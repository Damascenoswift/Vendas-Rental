"use client"

import { useState } from "react"
import { useActionState } from "react"
import { updateUser, CreateUserState } from "@/app/actions/auth-admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog"
import { Pencil } from "lucide-react"
import { roleHasSalesAccessByDefault } from "@/lib/sales-access"
import { roleHasInternalChatAccessByDefault } from "@/lib/internal-chat-access"

const initialState: CreateUserState = {
    success: false,
    message: '',
    errors: undefined,
}

interface EditUserDialogProps {
    user: {
        id: string
        name: string
        email: string
        role: string
        sales_access?: boolean | null
        internal_chat_access?: boolean | null
        phone?: string
        department?: string
        allowed_brands?: string[]
        status?: string
        supervisor_id?: string
        company_name?: string
        supervised_company_name?: string
    }
    supervisors?: any[]
}

export function EditUserDialog({ user, supervisors = [] }: EditUserDialogProps) {
    const [open, setOpen] = useState(false)
    const [state, formAction, isPending] = useActionState(updateUser, initialState)
    const [selectedRole, setSelectedRole] = useState(user.role)
    const [salesAccess, setSalesAccess] = useState(
        typeof user.sales_access === "boolean"
            ? user.sales_access
            : roleHasSalesAccessByDefault(user.role)
    )
    const [internalChatAccess, setInternalChatAccess] = useState(
        typeof user.internal_chat_access === "boolean"
            ? user.internal_chat_access
            : roleHasInternalChatAccessByDefault(user.role)
    )

    // Close dialog on success
    if (state.success && open) {
        // We need a way to close it. Since state comes from action, we can't easily reset it inside render without effects.
        // A simple way is to let the user close or show a success message.
        // For better UX, we can use a small effect or just let the user see the success message.
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Usuário</DialogTitle>
                    <DialogDescription>
                        Faça alterações no perfil de acesso de <strong>{user.name}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <form action={formAction} className="space-y-4">
                    <input type="hidden" name="userId" value={user.id} />

                    {state.message && (
                        <div className={`p-3 rounded text-sm ${state.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {state.message}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome</Label>
                            <Input id="name" name="name" defaultValue={user.name} required />
                            {state.errors?.name && <p className="text-red-500 text-xs">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" name="phone" defaultValue={user.phone} />
                            {state.errors?.phone && <p className="text-red-500 text-xs">{state.errors.phone[0]}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" defaultValue={user.email || ""} required />
                        {state.errors?.email && <p className="text-red-500 text-xs">{state.errors.email[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Nova Senha (Opcional)</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="Deixe em branco para manter a atual"
                            minLength={6}
                        />
                        <p className="text-[10px] text-muted-foreground">Mínimo de 6 caracteres.</p>
                        {state.errors?.password && <p className="text-red-500 text-xs">{state.errors.password[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="role">Perfil (Função)</Label>
                        <select
                            id="role"
                            name="role"
                            defaultValue={user.role}
                            className="w-full rounded-md border p-2 text-sm"
                            onChange={(e) => {
                                const nextRole = e.target.value
                                setSelectedRole(nextRole)
                                setSalesAccess(roleHasSalesAccessByDefault(nextRole))
                                setInternalChatAccess(roleHasInternalChatAccessByDefault(nextRole))
                            }}
                        >
                            <option value="vendedor_externo">Vendedor Externo</option>
                            <option value="vendedor_interno">Vendedor Interno</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="suporte_tecnico">Suporte Técnico</option>
                            <option value="suporte_limitado">Suporte Limitado</option>
                            <option value="adm_mestre">Admin Mestre</option>
                            <option value="adm_dorata">Admin Dorata</option>
                            <option value="investidor">Investidor</option>
                            <option value="funcionario_n1">Funcionário Nível 1</option>
                            <option value="funcionario_n2">Funcionário Nível 2</option>
                        </select>
                        {state.errors?.role && <p className="text-red-500 text-xs">{state.errors.role[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <input type="hidden" name="sales_access" value={salesAccess ? "true" : "false"} />
                        <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                            <div>
                                <Label htmlFor={`sales_access_toggle_${user.id}`}>Acesso a vendas</Label>
                                <p className="text-[10px] text-muted-foreground">
                                    Indicações e comissões no financeiro.
                                </p>
                            </div>
                            <input
                                id={`sales_access_toggle_${user.id}`}
                                type="checkbox"
                                checked={salesAccess}
                                onChange={(e) => setSalesAccess(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <input
                            type="hidden"
                            name="internal_chat_access"
                            value={internalChatAccess ? "true" : "false"}
                        />
                        <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                            <div>
                                <Label htmlFor={`internal_chat_access_toggle_${user.id}`}>Acesso ao chat interno</Label>
                                <p className="text-[10px] text-muted-foreground">
                                    Permite usar o módulo de chat interno da equipe.
                                </p>
                            </div>
                            <input
                                id={`internal_chat_access_toggle_${user.id}`}
                                type="checkbox"
                                checked={internalChatAccess}
                                onChange={(e) => setInternalChatAccess(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                        </div>
                    </div>

                    {/* Supervisor Selection */}
                    {(selectedRole === 'vendedor_interno' || selectedRole === 'vendedor_externo') && supervisors.length > 0 && (
                        <div className="space-y-2 bg-slate-50 p-3 rounded-md border border-slate-100">
                            <Label htmlFor="supervisor_id" className="text-slate-700">Supervisor Responsável</Label>
                            <select
                                id="supervisor_id"
                                name="supervisor_id"
                                className="w-full rounded-md border p-2 text-sm"
                                defaultValue={user.supervisor_id || ""}
                            >
                                <option value="">Selecione um supervisor (opcional)</option>
                                {supervisors.map(sup => (
                                    <option key={sup.id} value={sup.id}>
                                        {sup.name || sup.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {selectedRole === 'vendedor_interno' && (
                        <div className="space-y-2">
                            <Label htmlFor="company_name">Empresa do Vendedor Interno</Label>
                            <Input
                                id="company_name"
                                name="company_name"
                                defaultValue={user.company_name || ""}
                                placeholder="Ex: Acme Energia"
                            />
                            {state.errors?.company_name && <p className="text-red-500 text-xs">{state.errors.company_name[0]}</p>}
                        </div>
                    )}

                    {selectedRole === 'supervisor' && (
                        <div className="space-y-2">
                            <Label htmlFor="supervised_company_name">Empresa Supervisionada</Label>
                            <Input
                                id="supervised_company_name"
                                name="supervised_company_name"
                                defaultValue={user.supervised_company_name || ""}
                                placeholder="Ex: Acme Energia"
                            />
                            {state.errors?.supervised_company_name && <p className="text-red-500 text-xs">{state.errors.supervised_company_name[0]}</p>}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="department">Departamento</Label>
                        <select
                            id="department"
                            name="department"
                            defaultValue={user.department || 'outro'}
                            className="w-full rounded-md border p-2 text-sm"
                        >
                            <option value="vendas">Vendas</option>
                            <option value="cadastro">Cadastro</option>
                            <option value="energia">Engenharia/Proj.</option>
                            <option value="juridico">Jurídico</option>
                            <option value="financeiro">Financeiro</option>
                            <option value="ti">TI</option>
                            <option value="diretoria">Diretoria</option>
                            <option value="outro">Outro</option>
                        </select>
                        {state.errors?.department && <p className="text-red-500 text-xs">{state.errors.department[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Marcas Permitidas</Label>
                        <div className="flex gap-4 p-2 border rounded-md">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="edit-brand-rental"
                                    name="brands"
                                    value="rental"
                                    defaultChecked={user.allowed_brands?.length ? user.allowed_brands.includes('rental') : true}
                                    className="h-4 w-4"
                                />
                                <Label htmlFor="edit-brand-rental">Rental</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="edit-brand-dorata"
                                    name="brands"
                                    value="dorata"
                                    defaultChecked={user.allowed_brands?.length ? user.allowed_brands.includes('dorata') : false}
                                    className="h-4 w-4"
                                />
                                <Label htmlFor="edit-brand-dorata">Dorata</Label>
                            </div>
                        </div>
                        {state.errors?.brands && <p className="text-red-500 text-xs">{state.errors.brands[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <select
                            id="status"
                            name="status"
                            defaultValue={user.status || 'active'}
                            className="w-full rounded-md border p-2 text-sm"
                        >
                            <option value="active">Ativo</option>
                            <option value="inactive">Inativo</option>
                            <option value="suspended">Suspenso</option>
                        </select>
                        {state.errors?.status && <p className="text-red-500 text-xs">{state.errors.status[0]}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
