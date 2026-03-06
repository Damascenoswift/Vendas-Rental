"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    onSelectLead?: (lead: Lead, source?: "indicacao" | "contact") => void
    onSelectContact?: (contact: Contact) => void
    mode?: "contacts" | "leads" | "both"
    leadBrand?: "rental" | "dorata"
}

function formatPhone(value?: string | null) {
    const digits = (value ?? "").replace(/\D/g, "")
    if (!digits) return ""

    if (digits.length === 11) {
        return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
    }
    if (digits.length === 10) {
        return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3")
    }
    return value ?? ""
}

export function LeadSelect({
    value,
    onChange,
    onSelectLead,
    onSelectContact,
    mode = "both",
    leadBrand,
}: LeadSelectProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const [leads, setLeads] = React.useState<Lead[]>([])
    const [contacts, setContacts] = React.useState<Contact[]>([])
    const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null)
    const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null)
    const [sourceFilter, setSourceFilter] = React.useState<"all" | "contacts" | "leads">(
        mode === "both" ? "contacts" : "all"
    )
    const debouncedSearch = useDebounce(search, 250)

    const showLeads = mode === "leads" || (mode === "both" && sourceFilter !== "contacts")
    const showContacts = mode === "contacts" || (mode === "both" && sourceFilter !== "leads")

    const getContactName = React.useCallback((contact: Contact) => {
        return (
            contact.full_name
            || [contact.first_name, contact.last_name].filter(Boolean).join(" ")
            || contact.email
            || contact.whatsapp
            || contact.phone
            || contact.mobile
            || "Contato"
        )
    }, [])

    React.useEffect(() => {
        if (mode === "both") {
            setSourceFilter("contacts")
            return
        }
        setSourceFilter("all")
    }, [mode])

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

    React.useEffect(() => {
        let mounted = true
        async function fetchClients() {
            const [leadData, contactData] = await Promise.all([
                showLeads ? searchTaskLeads(debouncedSearch, leadBrand) : Promise.resolve([]),
                showContacts ? searchTaskContacts(debouncedSearch) : Promise.resolve([]),
            ])

            if (!mounted) return
            setLeads(leadData ?? [])
            setContacts(contactData ?? [])
        }

        void fetchClients()
        return () => {
            mounted = false
        }
    }, [debouncedSearch, leadBrand, showContacts, showLeads])

    const selectedLabel = React.useMemo(() => {
        if (selectedLead) {
            return `${selectedLead.nome}${selectedLead.documento ? ` - ${selectedLead.documento}` : ""}`
        }
        if (selectedContact) {
            return getContactName(selectedContact)
        }
        return "Buscar cliente..."
    }, [getContactName, selectedContact, selectedLead])

    const handleSelectLead = (lead: Lead) => {
        onChange(lead.id)
        onSelectLead?.(lead, "indicacao")
        setSelectedLead(lead)
        setSelectedContact(null)
        setOpen(false)
    }

    const handleSelectContact = (contact: Contact) => {
        const name = getContactName(contact)

        onChange(mode === "contacts" ? contact.id : undefined)
        onSelectLead?.(
            {
                id: contact.id,
                nome: name,
                documento: null,
                unidade_consumidora: null,
                codigo_cliente: null,
                codigo_instalacao: null,
            },
            "contact"
        )
        onSelectContact?.(contact)
        setSelectedContact(contact)
        setSelectedLead(null)
        setOpen(false)
    }

    const hasVisibleItems = (showContacts && contacts.length > 0) || (showLeads && leads.length > 0)

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
                {mode === "both" ? (
                    <div className="flex items-center gap-1 border-b bg-muted/30 p-2">
                        <button
                            type="button"
                            className={cn(
                                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                                sourceFilter === "contacts"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                            onClick={() => setSourceFilter("contacts")}
                        >
                            Contatos
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                                sourceFilter === "leads"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                            onClick={() => setSourceFilter("leads")}
                        >
                            Indicações
                        </button>
                        <button
                            type="button"
                            className={cn(
                                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                                sourceFilter === "all"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                            onClick={() => setSourceFilter("all")}
                        >
                            Todos
                        </button>
                    </div>
                ) : null}

                <div className="border-b p-2">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar cliente por nome..."
                    />
                </div>

                <div className="max-h-[320px] overflow-y-auto p-2">
                    {!hasVisibleItems ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            Nenhum cliente encontrado.
                        </div>
                    ) : null}

                    {showContacts ? (
                        <div className="space-y-1">
                            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Contatos</p>
                            {contacts.length > 0 ? (
                                contacts.map((contact) => {
                                    const name = getContactName(contact)
                                    const subtitle = [
                                        "Contato",
                                        contact.email || formatPhone(contact.whatsapp) || formatPhone(contact.phone) || formatPhone(contact.mobile),
                                    ]
                                        .filter(Boolean)
                                        .join(" • ")
                                    const isSelected =
                                        (mode === "contacts" ? value === contact.id : selectedContact?.id === contact.id)

                                    return (
                                        <button
                                            key={`contact-${contact.id}`}
                                            type="button"
                                            onClick={() => handleSelectContact(contact)}
                                            className={cn(
                                                "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                                                isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                                            )}
                                        >
                                            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate">{name}</span>
                                                <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                                            </span>
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                    Nenhum contato encontrado.
                                </div>
                            )}
                        </div>
                    ) : null}

                    {showLeads ? (
                        <div className={cn("space-y-1", showContacts ? "mt-3" : "")}>
                            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Indicações</p>
                            {leads.length > 0 ? (
                                leads.map((lead) => {
                                    const subtitle = [
                                        `Indicação • Doc: ${lead.documento || "N/A"}`,
                                        lead.unidade_consumidora ? `UC: ${lead.unidade_consumidora}` : null,
                                        lead.codigo_cliente ? `Cód: ${lead.codigo_cliente}` : null,
                                        lead.codigo_instalacao ? `Inst: ${lead.codigo_instalacao}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" • ")
                                    const isSelected = value === lead.id

                                    return (
                                        <button
                                            key={`lead-${lead.id}`}
                                            type="button"
                                            onClick={() => handleSelectLead(lead)}
                                            className={cn(
                                                "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                                                isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                                            )}
                                        >
                                            <Check className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate">{lead.nome}</span>
                                                <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                                            </span>
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                    Nenhuma indicação encontrada.
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    )
}
