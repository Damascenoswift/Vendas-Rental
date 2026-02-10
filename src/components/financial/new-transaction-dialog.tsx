"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { createTransaction } from "@/app/actions/financial"
import { PlusCircle } from "lucide-react"

// Submit Button Component
function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar Lançamento"}
        </Button>
    )
}

interface UserSummary {
    id: string
    name: string | null
    email: string | null
}

export function NewTransactionDialog({ users }: { users: UserSummary[] }) {
    const [open, setOpen] = useState(false)
    const { showToast } = useToast()

    async function clientAction(formData: FormData) {
        // Create initial state manually as useActionState might be overkill for simple one-off or if React 19 is tricky
        const result = await createTransaction({ success: false, message: '' }, formData)

        if (result.success) {
            showToast({
                variant: "success",
                title: "Sucesso!",
                description: result.message,
            })
            setOpen(false)
        } else {
            showToast({
                variant: "error",
                title: "Erro",
                description: result.message,
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" /> Novo Lançamento
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Lançamento Manual</DialogTitle>
                    <DialogDescription>
                        Adicione bônus, adiantamentos ou despesas avulsas.
                    </DialogDescription>
                </DialogHeader>
                <form action={clientAction} className="grid gap-4 py-4">

                    {/* Beneficiário */}
                    <div className="grid gap-2">
                        <Label htmlFor="beneficiary_user_id">Beneficiário (Vendedor)</Label>
                        <Select name="beneficiary_user_id" required>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                                {users.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name || u.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Tipo */}
                    <div className="grid gap-2">
                        <Label htmlFor="type">Tipo de Lançamento</Label>
                        <Select name="type" required defaultValue="bonus_recrutamento">
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bonus_recrutamento">Bônus Recrutamento (+ R$ 500)</SelectItem>
                            <SelectItem value="comissao_venda">Comissão Venda (Manual)</SelectItem>
                            <SelectItem value="comissao_dorata">Comissão Dorata</SelectItem>
                            <SelectItem value="override_gestao">Override Gestão</SelectItem>
                            <SelectItem value="adiantamento">Adiantamento (Débito)</SelectItem>
                            <SelectItem value="despesa">Despesa (Débito)</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>

                    {/* Valor */}
                    <div className="grid gap-2">
                        <Label htmlFor="amount">Valor (R$)</Label>
                        <Input
                            id="amount"
                            name="amount"
                            type="number"
                            step="0.01"
                            placeholder="500.00"
                            required
                        />
                    </div>

                    {/* Data Vencimento */}
                    <div className="grid gap-2">
                        <Label htmlFor="due_date">Data de Pagamento</Label>
                        <Input
                            id="due_date"
                            name="due_date"
                            type="date"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="origin_lead_id">ID da indicação (opcional)</Label>
                        <Input
                            id="origin_lead_id"
                            name="origin_lead_id"
                            placeholder="UUID da indicação para conciliar pagamento"
                        />
                    </div>

                    {/* Descrição */}
                    <div className="grid gap-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Ex: Bônus pela contratação do João."
                            required
                        />
                    </div>

                    <DialogFooter>
                        <SubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
