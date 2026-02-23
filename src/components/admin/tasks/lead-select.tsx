"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
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
import { getTaskContactById, getTaskLeadById, searchTaskContacts, searchTaskLeads } from "@/services/task-service"

interface Lead {
    id: string
    nome: string
    documento: string | null
    unidade_consumidora: string | null
    codigo_cliente: string | null
    codigo_instalacao: string | null
}

interface Contact {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    whatsapp: string | null
    phone: string | null
    mobile: string | null
}

interface LeadSelectProps {
    value?: string
    onChange: (value?: string) => void
    onSelectLead?: (lead: Lead, source?: 'indicacao' | 'contact') => void
    onSelectContact?: (contact: Contact) => void
    mode?: 'contacts' | 'leads' | 'both'
    leadBrand?: 'rental' | 'dorata'
}

export function LeadSelect({ value, onChange, onSelectLead, onSelectContact, mode = 'both', leadBrand }: LeadSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [leads, setLeads] = React.useState<Lead[]>([])
    const [contacts, setContacts] = React.useState<Contact[]>([])
    const [search, setSearch] = React.useState("")
    const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null)
    const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null)
    const debouncedSearch = useDebounce(search, 300)
    const showLeads = mode !== 'contacts'
    const showContacts = mode !== 'leads'

    const getContactName = React.useCallback((contact: Contact) => {
        return contact.full_name
            || [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            || contact.email
            || contact.whatsapp
            || contact.phone
            || contact.mobile
            || "Contato"
    }, [])

    React.useEffect(() => {
        if (!value) {
            if (mode === "contacts") {
                setSelectedContact(null)
            } else {
                setSelectedLead(null)
            }
            return
        }

        if (mode === "contacts") {
            void getTaskContactById(value).then((data) => {
                setSelectedContact(data ?? null)
            })
            return
        }

        void getTaskLeadById(value).then((data) => {
            setSelectedLead(data ?? null)
        })
    }, [mode, value])

    React.useEffect(() => {
        if (mode === "contacts") {
            setSelectedLead(null)
        }
        if (mode === "leads") {
            setSelectedContact(null)
        }
    }, [mode])

    // Search leads
    React.useEffect(() => {
        async function fetchLeads() {
            const [leadData, contactData] = await Promise.all([
                showLeads ? searchTaskLeads(debouncedSearch, leadBrand) : Promise.resolve([]),
                showContacts ? searchTaskContacts(debouncedSearch) : Promise.resolve([]),
            ])
            if (leadData) setLeads(leadData)
            if (contactData) setContacts(contactData)
        }
        fetchLeads()
    }, [debouncedSearch, showLeads, showContacts, leadBrand])

    const selectedLabel = React.useMemo(() => {
        if (selectedLead) {
            return `${selectedLead.nome}${selectedLead.documento ? ` - ${selectedLead.documento}` : ''}`
        }
        if (selectedContact) {
            const name = getContactName(selectedContact)
            return name
        }
        return "Buscar cliente..."
    }, [selectedLead, selectedContact, getContactName])

    const handleSelectLead = (lead: Lead) => {
        onChange(lead.id)
        onSelectLead?.(lead, 'indicacao')
        setSelectedLead(lead)
        setSelectedContact(null)
        setOpen(false)
    }

    const handleSelectContact = (contact: Contact) => {
        const name = getContactName(contact)

        onChange(mode === "contacts" ? contact.id : undefined)
        onSelectLead?.({
            id: contact.id,
            nome: name,
            documento: null,
            unidade_consumidora: null,
            codigo_cliente: null,
            codigo_instalacao: null,
        }, 'contact')
        onSelectContact?.(contact)
        setSelectedContact(contact)
        setSelectedLead(null)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {selectedLabel}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="z-[90] w-[420px] p-0 shadow-xl">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar cliente por nome..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        {showLeads && (
                            <CommandGroup heading="Indicações">
                                {leads.map((lead) => (
                                    <CommandItem
                                        key={`lead-${lead.id}`}
                                        value={`lead-${lead.nome}-${lead.id}`}
                                        className="cursor-pointer text-foreground"
                                        onSelect={() => {
                                            handleSelectLead(lead)
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
                                {leads.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                        Nenhuma indicação encontrada.
                                    </div>
                                )}
                            </CommandGroup>
                        )}

                        {showContacts && (
                            <CommandGroup heading="Contatos">
                                {contacts.map((contact) => {
                                    const name = getContactName(contact)

                                    return (
                                    <CommandItem
                                        key={`contact-${contact.id}`}
                                        value={`contact-${name}-${contact.id}`}
                                        className="cursor-pointer text-foreground"
                                        onSelect={() => {
                                            handleSelectContact(contact)
                                        }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    (mode === "contacts" ? value === contact.id : selectedContact?.id === contact.id)
                                                        ? "opacity-100"
                                                        : "opacity-0"
                                                )}
                                            />
                                            <div className="flex flex-col">
                                                <span>{name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {contact.email || contact.whatsapp || contact.phone || contact.mobile || ""}
                                                </span>
                                            </div>
                                        </CommandItem>
                                    )
                                })}
                                {contacts.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                        Nenhum contato encontrado.
                                    </div>
                                )}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
