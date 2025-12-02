"use client"

import { useState } from "react"
import { Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

interface IndicationValueEditProps {
    id: string
    initialValue: number | null
}

export function IndicationValueEdit({ id, initialValue }: IndicationValueEditProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [value, setValue] = useState<string>(initialValue ? initialValue.toString() : "")
    const [isLoading, setIsLoading] = useState(false)
    const { showToast } = useToast()
    // const supabase = createClient() // Removed, using imported instance

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const numericValue = value ? parseFloat(value.replace(",", ".")) : null

            const { error } = await supabase
                .from("indicacoes")
                .update({ valor: numericValue })
                .eq("id", id)

            if (error) throw error

            showToast({
                title: "Valor atualizado",
                description: "O valor compensado foi salvo com sucesso.",
                variant: "success"
            })
            setIsEditing(false)
        } catch (error) {
            console.error("Erro ao atualizar valor:", error)
            showToast({
                title: "Erro ao atualizar",
                description: "Não foi possível salvar o valor.",
                variant: "error"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const formatCurrency = (val: number | null) => {
        if (val === null) return "-"
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(val)
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <Input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-8 w-24 px-2 text-right"
                    placeholder="0,00"
                    autoFocus
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={handleSave}
                    disabled={isLoading}
                >
                    <Check className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setIsEditing(false)}
                    disabled={isLoading}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )
    }

    return (
        <div
            className="flex items-center justify-end gap-2 group cursor-pointer py-1"
            onClick={() => setIsEditing(true)}
        >
            <span className="font-medium text-sm">
                {formatCurrency(initialValue)}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    )
}
