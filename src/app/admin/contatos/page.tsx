import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ContactsImportCard } from "@/components/admin/contacts/contacts-import-card"

export const dynamic = "force-dynamic"

type SearchParams = {
    q?: string
    page?: string
}

const allowedRoles = [
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
]

export default async function AdminContactsPage({
    searchParams,
}: {
    searchParams?: SearchParams
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (!role || !allowedRoles.includes(role)) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Você não tem permissão para acessar esta página.</p>
                </div>
            </div>
        )
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const queryText = typeof searchParams?.q === "string" ? searchParams.q.trim() : ""

    const page = Number.parseInt(searchParams?.page ?? "1", 10) || 1
    const perPage = 50
    const from = (page - 1) * perPage
    const to = from + perPage - 1

    let query = supabaseAdmin
        .from("contacts")
        .select(
            "id, external_id, full_name, first_name, last_name, email, whatsapp, phone, mobile, city, state, source_created_at, created_at",
            { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, to)

    if (queryText) {
        const sanitized = queryText.replace(/[(),']/g, " ").trim()
        if (sanitized) {
            query = query.or(
                `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,whatsapp.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,mobile.ilike.%${sanitized}%,external_id.eq.${sanitized}`
            )
        }
    }

    const { data: contacts, error, count } = await query

    if (error) {
        console.error("Erro ao buscar contatos:", error)
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar contatos</h3>
                    <p className="text-sm">{error.message}</p>
                </div>
            </div>
        )
    }

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const currentPage = Math.min(Math.max(page, 1), totalPages)
    const showFrom = total === 0 ? 0 : from + 1
    const showTo = total === 0 ? 0 : Math.min(from + perPage, total)

    const buildPageLink = (targetPage: number) => {
        const params = new URLSearchParams()
        if (queryText) params.set("q", queryText)
        if (targetPage > 1) params.set("page", String(targetPage))
        const queryString = params.toString()
        return queryString ? `/admin/contatos?${queryString}` : "/admin/contatos"
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold">Contatos</h1>
                <p className="text-muted-foreground">
                    Busque, visualize e importe contatos para o CRM.
                </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <form action="/admin/contatos" method="GET" className="flex w-full max-w-xl gap-2">
                    <Input
                        name="q"
                        placeholder="Buscar por nome, email ou telefone"
                        defaultValue={queryText}
                    />
                    <Button type="submit">Buscar</Button>
                    {queryText && (
                        <Button asChild variant="outline">
                            <Link href="/admin/contatos">Limpar</Link>
                        </Button>
                    )}
                </form>
                <div className="text-sm text-muted-foreground">
                    {total} contato(s)
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-md border bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>WhatsApp</TableHead>
                                <TableHead>Telefone</TableHead>
                                <TableHead>Cidade</TableHead>
                                <TableHead>Criado em</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contacts?.map((contact) => {
                                const name =
                                    contact.full_name ||
                                    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
                                    contact.email ||
                                    "Sem nome"
                                const location =
                                    [contact.city, contact.state].filter(Boolean).join(" / ") || "-"
                                const dateValue = contact.source_created_at ?? contact.created_at
                                const formattedDate = dateValue
                                    ? new Intl.DateTimeFormat("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                    }).format(new Date(dateValue))
                                    : "-"

                                return (
                                    <TableRow key={contact.id}>
                                        <TableCell className="font-medium">
                                            <Link href={`/admin/contatos/${contact.id}`} className="hover:underline">
                                                {name}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{contact.email || "-"}</TableCell>
                                        <TableCell>{contact.whatsapp || "-"}</TableCell>
                                        <TableCell>{contact.phone || contact.mobile || "-"}</TableCell>
                                        <TableCell>{location}</TableCell>
                                        <TableCell>{formattedDate}</TableCell>
                                        <TableCell>{contact.external_id || "-"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild variant="outline" size="sm">
                                                <Link href={`/admin/contatos/${contact.id}`}>Ver 360</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {(!contacts || contacts.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        Nenhum contato encontrado.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                <ContactsImportCard />
            </div>

            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="text-sm text-muted-foreground">
                    Mostrando {showFrom}-{showTo} de {total}
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
                        <Link href={buildPageLink(currentPage - 1)}>Anterior</Link>
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Página {currentPage} de {totalPages}
                    </span>
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                    >
                        <Link href={buildPageLink(currentPage + 1)}>Próxima</Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
