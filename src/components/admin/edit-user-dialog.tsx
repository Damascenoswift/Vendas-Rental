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
        phone?: string
        department?: string
        allowed_brands?: string[]
        status?: string
    }
}

export function EditUserDialog({ user }: EditUserDialogProps) {
    const [open, setOpen] = useState(false)
    const [state, formAction, isPending] = useActionState(updateUser, initialState)

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
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" name="phone" defaultValue={user.phone} />
                        </div>
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
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="role">Perfil (Função)</Label>
                        <select
                            id="role"
                            name="role"
                            defaultValue={user.role}
                            className="w-full rounded-md border p-2 text-sm"
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
                    </div>

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
                            <option value="energia">Energia</option>
                            <option value="juridico">Jurídico</option>
                            <option value="financeiro">Financeiro</option>
                            <option value="ti">TI</option>
                            <option value="diretoria">Diretoria</option>
                            <option value="outro">Outro</option>
                        </select>
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
                                    defaultChecked={user.allowed_brands?.includes('rental')}
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
                                    defaultChecked={user.allowed_brands?.includes('dorata')}
                                    className="h-4 w-4"
                                />
                                <Label htmlFor="edit-brand-dorata">Dorata</Label>
                            </div>
                        </div>
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
