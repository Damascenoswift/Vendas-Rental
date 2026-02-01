"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { supabase } from "@/lib/supabase"

interface Lead {
    id: string
    nome: string
    documento: string | null
    unidade_consumidora: string | null
    codigo_cliente: string | null
    codigo_instalacao: string | null
}

interface LeadSelectProps {
    value?: string
    onChange: (value: string) => void
    onSelectLead?: (lead: Lead) => void
}

export function LeadSelect({ value, onChange, onSelectLead }: LeadSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [leads, setLeads] = React.useState<Lead[]>([])
    const [search, setSearch] = React.useState("")
    const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null)
    const debouncedSearch = useDebounce(search, 300)

    // Fetch initial selected lead
    React.useEffect(() => {
        if (value && !selectedLead) {
            supabase
                .from('indicacoes')
                .select('id, nome, documento, unidade_consumidora, codigo_cliente, codigo_instalacao')
                .eq('id', value)
                .single()
                .then(({ data }) => {
                    if (data) setSelectedLead(data)
                })
        }
    }, [value, selectedLead])

    // Search leads
    React.useEffect(() => {
        async function fetchLeads() {
            let query = supabase
                .from('indicacoes')
                .select('id, nome, documento, unidade_consumidora, codigo_cliente, codigo_instalacao')
                .limit(20)

            if (debouncedSearch) {
                query = query.ilike('nome', `%${debouncedSearch}%`)
            } else {
                query = query.order('created_at', { ascending: false })
            }

            const { data } = await query
            if (data) setLeads(data)
        }
        fetchLeads()
    }, [debouncedSearch])

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {selectedLead
                        ? `${selectedLead.nome}${selectedLead.documento ? ` - ${selectedLead.documento}` : ''}`
                        : "Buscar cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar cliente por nome..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                            {leads.map((lead) => (
                                <CommandItem
                                    key={lead.id}
                                    value={`${lead.nome} ${lead.id}`} // Ensure unique value for cmdk
                                    onSelect={() => {
                                        console.log("Selected lead:", lead)
                                        onChange(lead.id)
                                        onSelectLead?.(lead)
                                        setSelectedLead(lead)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === lead.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col">
                                        <span>{lead.nome}</span>
                                        <span className="text-xs text-muted-foreground">
                                            Doc: {lead.documento || 'N/A'}
                                            {lead.unidade_consumidora && ` • UC: ${lead.unidade_consumidora}`}
                                            {lead.codigo_cliente && ` • Cód: ${lead.codigo_cliente}`}
                                            {lead.codigo_instalacao && ` • Inst: ${lead.codigo_instalacao}`}
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
