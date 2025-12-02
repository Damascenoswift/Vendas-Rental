"use client"

import { useActionState } from "react"
import { updateProfile } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useEffect } from "react"

interface ProfileFormProps {
    initialName: string
    initialPhone: string
    email: string
}

const initialState: { error?: string; success?: string } = {
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
    )
}
