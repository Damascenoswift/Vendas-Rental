"use client"

import { useActionState } from "react"
import { updatePassword, updateProfile } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

interface ProfileFormProps {
    initialName: string
    initialPhone: string
    email: string
}

const initialState: { error?: string; success?: string } = {
    error: "",
    success: "",
}

const passwordInitialState: { error?: string; success?: string } = {
    error: "",
    success: "",
}

export function ProfileForm({ initialName, initialPhone, email }: ProfileFormProps) {
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

                <Button type="submit" disabled={isPending}>
                    {isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
            </form>

            <div className="border-t pt-6">
                <h3 className="mb-4 text-lg font-medium">Alterar Senha</h3>
                <PasswordChangeForm email={email} />
            </div>
        </div>
    )
}

function PasswordChangeForm({ email }: { email: string }) {
    const [password, setPassword] = useState("")
    const [state, formAction, isPending] = useActionState(updatePassword, passwordInitialState)
    const [isSendingReset, setIsSendingReset] = useState(false)
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
            setPassword("")
        }
    }, [state, showToast])

    const handleSendResetLink = async () => {
        if (!email) {
            showToast({
                variant: "error",
                title: "Erro",
                description: "Email não disponível para envio do link.",
            })
            return
        }

        setIsSendingReset(true)
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        setIsSendingReset(false)

        if (error) {
            showToast({
                variant: "error",
                title: "Erro",
                description: "Não foi possível enviar o link de redefinição.",
            })
            return
        }

        showToast({
            variant: "success",
            title: "Sucesso",
            description: "Enviamos um link para redefinir sua senha. Verifique sua caixa de entrada e spam.",
        })
    }

    return (
        <form action={formAction} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                    id="new-password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={6}
                />
            </div>
            <Button type="submit" variant="secondary" disabled={isPending || !password}>
                {isPending ? "Atualizando..." : "Redefinir Senha"}
            </Button>
            <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleSendResetLink}
                disabled={isSendingReset}
            >
                {isSendingReset ? "Enviando link..." : "Enviar link de redefinição"}
            </Button>
        </form>
    )
}
