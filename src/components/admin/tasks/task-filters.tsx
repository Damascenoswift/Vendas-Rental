"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Filter, Search } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"

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
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const currentBrand = normalizeBrand(searchParams.get("brand"))
    const rawScope = normalizeScope(searchParams.get("scope"))
    const currentScope = !hasDepartment && rawScope === "department" ? "all" : rawScope
    const searchFromUrl = searchParams.get("q")?.trim() ?? ""
    const [search, setSearch] = useState(searchFromUrl)
    const debouncedSearch = useDebounce(search, 350)

    useEffect(() => {
        setSearch(searchFromUrl)
    }, [searchFromUrl])

    const updateParam = useCallback((key: string, value: string, options?: { allValue?: string; replace?: boolean }) => {
        const params = new URLSearchParams(searchParams.toString())
        const normalizedValue = value.trim()
        const shouldDelete = normalizedValue.length === 0 || normalizedValue === (options?.allValue ?? "all")

        if (shouldDelete) {
            params.delete(key)
        } else {
            params.set(key, normalizedValue)
        }

        const queryString = params.toString()
        const nextUrl = queryString ? `${pathname}?${queryString}` : pathname
        if (options?.replace) {
            router.replace(nextUrl)
            return
        }

        router.push(nextUrl)
    }, [pathname, router, searchParams])

    useEffect(() => {
        if (debouncedSearch === searchFromUrl) return
        updateParam("q", debouncedSearch, { allValue: "", replace: true })
    }, [debouncedSearch, searchFromUrl, updateParam])

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-[240px] md:w-[320px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por cliente ou instalação"
                    className="h-9 pl-8"
                />
            </div>

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
        </div>
    )
}
