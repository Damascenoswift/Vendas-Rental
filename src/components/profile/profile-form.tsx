"use client"

import { useActionState } from "react"
import { updatePassword, updateProfile } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"

interface ProfileFormProps {
    initialName: string
    initialPhone: string
    email: string
    role?: string
    initialCompanyName?: string
    initialSupervisedCompanyName?: string
}

const initialState: { error?: string; success?: string } = {
    error: "",
    success: "",
}

const passwordInitialState: { error?: string; success?: string } = {
    error: "",
    success: "",
}

export function ProfileForm({
    initialName,
    initialPhone,
    email,
    role,
    initialCompanyName = "",
    initialSupervisedCompanyName = "",
}: ProfileFormProps) {
    const [state, formAction, isPending] = useActionState(updateProfile, initialState)
    const { showToast } = useToast()

    useEffect(() => {
        if (state?.error) {
            showToast({
                variant: "error",
                title: "Erro",
                description: state.error,
            })
        }
        if (state?.success) {
            showToast({
                variant: "success",
                title: "Sucesso",
                description: state.success,
            })
        }
    }, [state, showToast])

    return (
        <div className="space-y-8">
            <form action={formAction} className="space-y-6">

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={email} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">
                        O email não pode ser alterado.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input
                        id="name"
                        name="name"
                        defaultValue={initialName}
                        placeholder="Seu nome completo"
                        required
                        minLength={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="phone">Telefone / WhatsApp</Label>
                    <Input
                        id="phone"
                        name="phone"
                        defaultValue={initialPhone}
                        placeholder="(00) 00000-0000"
                        required
                        minLength={10}
                    />
                </div>

                {role === "vendedor_interno" ? (
                    <div className="space-y-2">
                        <Label htmlFor="company_name">Empresa</Label>
                        <Input
                            id="company_name"
                            name="company_name"
                            defaultValue={initialCompanyName}
                            placeholder="Ex: Acme Energia"
                        />
                    </div>
                ) : null}

                {role === "supervisor" ? (
                    <div className="space-y-2">
                        <Label htmlFor="supervised_company_name">Empresa Supervisionada</Label>
                        <Input
                            id="supervised_company_name"
                            name="supervised_company_name"
                            defaultValue={initialSupervisedCompanyName}
                            placeholder="Ex: Acme Energia"
                        />
                    </div>
                ) : null}

                <Button type="submit" disabled={isPending}>
                    {isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
            </form>

            <div className="border-t pt-6">
                <h3 className="mb-4 text-lg font-medium">Alterar Senha</h3>
                <PasswordChangeForm />
            </div>
        </div>
    )
}

function PasswordChangeForm() {
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [state, formAction, isPending] = useActionState(updatePassword, passwordInitialState)
    const { showToast } = useToast()

    useEffect(() => {
        if (state?.error) {
            showToast({
                variant: "error",
                title: "Erro",
                description: state.error,
            })
        }
        if (state?.success) {
            showToast({
                variant: "success",
                title: "Sucesso",
                description: state.success,
            })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        }
    }, [state, showToast])

    return (
        <form action={formAction} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <Input
                    id="current-password"
                    name="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={6}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={6}
                />
            </div>
            <Button
                type="submit"
                variant="secondary"
                disabled={isPending || !currentPassword || !newPassword || !confirmPassword}
            >
                {isPending ? "Atualizando..." : "Alterar senha"}
            </Button>
        </form>
    )
}
