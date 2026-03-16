"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useDebounce } from "@/hooks/use-debounce"
import {
    WORK_STATUS_FILTER_OPTIONS,
    normalizeWorkStatusFilter,
} from "@/lib/work-status-filter"

export function WorkFilters() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const currentStatus = normalizeWorkStatusFilter(searchParams.get("status"))
    const searchFromUrl = searchParams.get("q")?.trim() ?? ""
    const [search, setSearch] = useState(searchFromUrl)
    const debouncedSearch = useDebounce(search, 350)

    useEffect(() => {
        setSearch(searchFromUrl)
    }, [searchFromUrl])

    const updateParams = useCallback((updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())

        Object.entries(updates).forEach(([key, value]) => {
            const normalized = value?.trim() ?? ""
            if (!normalized) {
                params.delete(key)
            } else {
                params.set(key, normalized)
            }
        })

        const query = params.toString()
        const nextUrl = query ? `${pathname}?${query}` : pathname
        router.replace(nextUrl)
    }, [pathname, router, searchParams])

    useEffect(() => {
        if (debouncedSearch === searchFromUrl) return
        updateParams({ q: debouncedSearch || null })
    }, [debouncedSearch, searchFromUrl, updateParams])

    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:w-[360px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por cliente ou instalação"
                    className="h-9 pl-8"
                />
            </div>

            <div className="flex flex-wrap gap-2">
                {WORK_STATUS_FILTER_OPTIONS.map((option) => (
                    <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={currentStatus === option.value ? "default" : "outline"}
                        onClick={() => updateParams({ status: option.value })}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
        </div>
    )
}
