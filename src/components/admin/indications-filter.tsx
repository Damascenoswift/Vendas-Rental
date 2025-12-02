"use client"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface IndicationsFilterProps {
    vendors: string[]
    selectedVendor: string | "all"
    sortOrder: "newest" | "oldest"
    onVendorChange: (vendor: string) => void
    onSortChange: (sort: "newest" | "oldest") => void
    onClearFilters: () => void
}

export function IndicationsFilter({
    vendors,
    selectedVendor,
    sortOrder,
    onVendorChange,
    onSortChange,
    onClearFilters,
}: IndicationsFilterProps) {
    return (
        <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center mb-6 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-1 w-full sm:w-[200px]">
                <span className="text-xs font-medium text-muted-foreground">Filtrar por Vendedor</span>
                <Select value={selectedVendor} onValueChange={onVendorChange}>
                    <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todos os vendedores" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os vendedores</SelectItem>
                        {vendors.map((vendor) => (
                            <SelectItem key={vendor} value={vendor}>
                                {vendor}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1 w-full sm:w-[180px]">
                <span className="text-xs font-medium text-muted-foreground">Ordenação</span>
                <Select value={sortOrder} onValueChange={(v) => onSortChange(v as "newest" | "oldest")}>
                    <SelectTrigger className="h-9 bg-background">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Mais recentes</SelectItem>
                        <SelectItem value="oldest">Mais antigos</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {(selectedVendor !== "all" || sortOrder !== "newest") && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearFilters}
                    className="h-9 px-3 text-muted-foreground hover:text-foreground"
                >
                    <X className="mr-2 h-4 w-4" />
                    Limpar filtros
                </Button>
            )}
        </div>
    )
}
