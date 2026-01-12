'use client'

import { useActionState } from 'react'
import { createUser } from '@/app/actions/auth-admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { CreateUserState } from '@/app/actions/auth-admin'

const initialState: CreateUserState = {
    success: false,
    message: '',
    errors: undefined,
}

export function RegisterUserForm() {
    const [state, formAction, isPending] = useActionState(createUser, initialState)

    return (
        <form action={formAction} className="space-y-6 max-w-md mx-auto p-6 border rounded-lg shadow-sm bg-white">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Cadastrar Usuário</h2>
                <p className="text-sm text-gray-500">Crie um novo acesso para o sistema.</p>
            </div>

            {state.message && (
                <div className={`p-3 rounded text-sm ${state.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {state.message}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input id="name" name="name" required placeholder="Ex: João Silva" />
                {state.errors?.name && <p className="text-red-500 text-xs">{state.errors.name[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input id="phone" name="phone" placeholder="(00) 00000-0000" />
                {state.errors?.phone && <p className="text-red-500 text-xs">{state.errors.phone[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="joao@exemplo.com" />
                {state.errors?.email && <p className="text-red-500 text-xs">{state.errors.email[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" required minLength={6} placeholder="******" />
                {state.errors?.password && <p className="text-red-500 text-xs">{state.errors.password[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="role">Perfil</Label>
                <select
                    id="role"
                    name="role"
                    required
                    className="w-full rounded-md border p-2"
                    defaultValue=""
                >
                    <option value="" disabled>Selecione um cargo</option>
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

            <div>
                <label className="mb-2 block text-sm font-medium">Setor / Departamento</label>
                <select
                    name="department"
                    className="w-full rounded-md border p-2"
                    defaultValue=""
                >
                    <option value="" disabled>Selecione um setor (opcional)</option>
                    <option value="vendas">Vendas</option>
                    <option value="cadastro">Cadastro</option>
                    <option value="energia">Energia</option>
                    <option value="juridico">Jurídico</option>
                    <option value="financeiro">Financeiro</option>
                    <option value="ti">TI</option>
                    <option value="diretoria">Diretoria</option>
                    <option value="outro">Outro</option>
                </select>
                {state.errors?.role && <p className="text-red-500 text-xs">{state.errors.role[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label>Marcas Permitidas</Label>
                <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="brand-rental"
                            name="brands"
                            value="rental"
                            defaultChecked
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="brand-rental" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Rental
                        </label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="brand-dorata"
                            name="brands"
                            value="dorata"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="brand-dorata" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Dorata
                        </label>
                    </div>
                </div>
                {state.errors?.brands && <p className="text-red-500 text-xs">{state.errors.brands[0]}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? 'Cadastrando...' : 'Cadastrar Usuário'}
            </Button>
        </form>
    )
}
