"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Filter } from "lucide-react"

type TaskScope = "all" | "mine" | "department"
type TaskBrand = "all" | "rental" | "dorata"

interface TaskFiltersProps {
    hasDepartment: boolean
}

const BRAND_OPTIONS: { value: TaskBrand; label: string }[] = [
    { value: "all", label: "Todas" },
    { value: "rental", label: "Rental" },
    { value: "dorata", label: "Dorata" },
]

const SCOPE_OPTIONS: { value: TaskScope; label: string; requiresDepartment?: boolean }[] = [
    { value: "all", label: "Todas as tarefas" },
    { value: "mine", label: "Minhas tarefas" },
    { value: "department", label: "Tarefas do meu setor", requiresDepartment: true },
]

function normalizeBrand(value: string | null): TaskBrand {
    if (value === "rental" || value === "dorata") return value
    return "all"
}

function normalizeScope(value: string | null): TaskScope {
    if (value === "mine" || value === "department") return value
    return "all"
}

export function TaskFilters({ hasDepartment }: TaskFiltersProps) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const currentBrand = normalizeBrand(searchParams.get("brand"))
    const rawScope = normalizeScope(searchParams.get("scope"))
    const currentScope = !hasDepartment && rawScope === "department" ? "all" : rawScope

    const updateParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value === "all") {
            params.delete(key)
        } else {
            params.set(key, value)
        }
        router.push(`?${params.toString()}`)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Filtros
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Marca</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={currentBrand}
                    onValueChange={(value) => updateParam("brand", value)}
                >
                    {BRAND_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                            {option.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Escopo</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={currentScope}
                    onValueChange={(value) => updateParam("scope", value)}
                >
                    {SCOPE_OPTIONS.map((option) => {
                        const disabled = Boolean(option.requiresDepartment && !hasDepartment)
                        return (
                            <DropdownMenuRadioItem
                                key={option.value}
                                value={option.value}
                                disabled={disabled}
                            >
                                {disabled ? `${option.label} (indisponivel)` : option.label}
                            </DropdownMenuRadioItem>
                        )
                    })}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
