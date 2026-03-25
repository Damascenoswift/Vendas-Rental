
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ContactNameEditor } from "@/components/admin/contacts/contact-name-editor"
import { DeleteContactButton } from "@/components/admin/contacts/delete-contact-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

const allowedRoles = [
    "adm_mestre",
    "adm_dorata",
    "supervisor",
    "suporte_tecnico",
    "suporte_limitado",
    "funcionario_n1",
    "funcionario_n2",
]

type ContactRow = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    whatsapp: string | null
    phone: string | null
    mobile: string | null
    city: string | null
    state: string | null
    source: string | null
    external_id: string | null
    source_created_at: string | null
    created_at: string
}

type IndicationRow = {
    id: string
    nome: string | null
    status: string | null
    marca: "rental" | "dorata" | null
    codigo_instalacao: string | null
    created_at: string
}

type ProposalRow = {
    id: string
    client_id: string | null
    contact_id: string | null
    status: string | null
    total_value: number | null
    created_at: string
    valid_until: string | null
    seller: { name: string | null; email: string | null } | null
    client: IndicationRow | null
}

type TaskRow = {
    id: string
    title: string
    status: string
    priority: string
    due_date: string | null
    created_at: string
    brand: "rental" | "dorata" | null
    department: string | null
    client_name: string | null
    codigo_instalacao: string | null
    indicacao_id: string | null
    contact_id: string | null
    proposal_id: string | null
    assignee: { name: string | null; email: string | null } | null
}

type CrmCardRow = {
    id: string
    title: string | null
    created_at: string
    indicacao_id: string
    stage_name: string | null
    pipeline_name: string | null
    pipeline_brand: "rental" | "dorata" | null
    indication_name: string | null
    indication_status: string | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatDate(value?: string | null) {
    if (!value) return "-"
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value))
    } catch {
        return "-"
    }
}

function formatCurrency(value?: number | null) {
    if (typeof value !== "number") return "-"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function sanitizeDigits(value?: string | null) {
    return (value ?? "").replace(/\D/g, "").trim()
}

function dedupeById<T extends { id: string }>(items: T[]) {
    return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function buildContactName(contact: ContactRow) {
    return (
        contact.full_name ||
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        contact.email ||
        contact.whatsapp ||
        contact.phone ||
        contact.mobile ||
        "Sem nome"
    )
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function asBrand(value: unknown): "rental" | "dorata" | null {
    return value === "rental" || value === "dorata" ? value : null
}

function asNullableString(value: unknown): string | null {
    return typeof value === "string" ? value : null
}

function asNullableNumber(value: unknown): number | null {
    return typeof value === "number" ? value : null
}

function mapProposalRow(row: Record<string, unknown>): ProposalRow {
    const sellerRaw = pickOne(row.seller as unknown)
    const sellerRecord = asRecord(sellerRaw)
    const clientRaw = pickOne(row.client as unknown)
    const clientRecord = asRecord(clientRaw)

    return {
        id: String(row.id ?? ""),
        client_id: asNullableString(row.client_id),
        contact_id: asNullableString(row.contact_id),
        status: asNullableString(row.status),
        total_value: asNullableNumber(row.total_value),
        created_at: String(row.created_at ?? ""),
        valid_until: asNullableString(row.valid_until),
        seller: sellerRecord
            ? {
                name: asNullableString(sellerRecord.name),
                email: asNullableString(sellerRecord.email),
            }
            : null,
        client: clientRecord
            ? {
                id: String(clientRecord.id ?? ""),
                nome: asNullableString(clientRecord.nome),
                status: asNullableString(clientRecord.status),
                marca: asBrand(clientRecord.marca),
                codigo_instalacao: asNullableString(clientRecord.codigo_instalacao),
                created_at: String(clientRecord.created_at ?? ""),
            }
            : null,
    }
}

function mapTaskRow(row: Record<string, unknown>): TaskRow {
    const assigneeRaw = pickOne(row.assignee as unknown)
    const assigneeRecord = asRecord(assigneeRaw)
    return {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        status: String(row.status ?? ""),
        priority: String(row.priority ?? ""),
        due_date: asNullableString(row.due_date),
        created_at: String(row.created_at ?? ""),
        brand: asBrand(row.brand),
        department: asNullableString(row.department),
        client_name: asNullableString(row.client_name),
        codigo_instalacao: asNullableString(row.codigo_instalacao),
        indicacao_id: asNullableString(row.indicacao_id),
        contact_id: asNullableString(row.contact_id),
        proposal_id: asNullableString(row.proposal_id),
        assignee: assigneeRecord
            ? {
                name: asNullableString(assigneeRecord.name),
                email: asNullableString(assigneeRecord.email),
            }
            : null,
    }
}

export default async function ContactDetailsPage({
    params,
}: {
    params: Promise<{ contactId: string }>
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role
    const canDeleteContacts = role === "adm_mestre" || role === "adm_dorata"
    const canEditContacts = Boolean(role && allowedRoles.includes(role))

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
    const { contactId } = await params

    const { data: contactData, error: contactError } = await supabaseAdmin
        .from("contacts")
        .select("id, full_name, first_name, last_name, email, whatsapp, phone, mobile, city, state, source, external_id, source_created_at, created_at")
        .eq("id", contactId)
        .maybeSingle()

    if (contactError) {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar contato</h3>
                    <p className="text-sm">{contactError.message}</p>
                </div>
            </div>
        )
    }

    if (!contactData) {
        notFound()
    }

    const contact = contactData as ContactRow
    const contactName = buildContactName(contact)

    const { data: directProposalsRaw } = await supabaseAdmin
        .from("proposals")
        .select(`
            id,
            client_id,
            contact_id,
            status,
            total_value,
            created_at,
            valid_until,
            seller:users(name, email),
            client:indicacoes!proposals_client_id_fkey(id, nome, status, marca, codigo_instalacao, created_at)
        `)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(120)

    const directProposals: ProposalRow[] = ((directProposalsRaw ?? []) as Array<Record<string, unknown>>).map(mapProposalRow)

    const { data: directTasksRaw } = await supabase
        .from("tasks")
        .select(`
            id,
            title,
            status,
            priority,
            due_date,
            created_at,
            brand,
            department,
            client_name,
            codigo_instalacao,
            indicacao_id,
            contact_id,
            proposal_id,
            assignee:users!tasks_assignee_id_fkey(name, email)
        `)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200)

    const directTasks: TaskRow[] = ((directTasksRaw ?? []) as Array<Record<string, unknown>>).map(mapTaskRow)

    const relatedIndicationIds = new Set<string>()
    directProposals.forEach((proposal) => {
        if (proposal.client_id) relatedIndicationIds.add(proposal.client_id)
    })
    directTasks.forEach((task) => {
        if (task.indicacao_id) relatedIndicationIds.add(task.indicacao_id)
    })

    const indicationMatches: IndicationRow[] = []
    const phoneCandidates = Array.from(
        new Set(
            [
                contact.whatsapp,
                contact.phone,
                contact.mobile,
                sanitizeDigits(contact.whatsapp),
                sanitizeDigits(contact.phone),
                sanitizeDigits(contact.mobile),
            ]
                .map((item) => item?.trim())
                .filter((item): item is string => Boolean(item))
        )
    )

    if (contact.email) {
        const { data } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, status, marca, codigo_instalacao, created_at")
            .ilike("email", contact.email)
            .limit(80)
        indicationMatches.push(...((data ?? []) as IndicationRow[]))
    }

    for (const phoneValue of phoneCandidates) {
        const { data } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, status, marca, codigo_instalacao, created_at")
            .eq("telefone", phoneValue)
            .limit(80)
        indicationMatches.push(...((data ?? []) as IndicationRow[]))
    }

    const matchedIndications = dedupeById(indicationMatches)
    matchedIndications.forEach((indication) => {
        relatedIndicationIds.add(indication.id)
    })

    let relatedIndications: IndicationRow[] = []
    if (relatedIndicationIds.size > 0) {
        const { data } = await supabaseAdmin
            .from("indicacoes")
            .select("id, nome, status, marca, codigo_instalacao, created_at")
            .in("id", Array.from(relatedIndicationIds))
            .order("created_at", { ascending: false })
        relatedIndications = (data ?? []) as IndicationRow[]
    }

    let allProposals = [...directProposals]
    if (relatedIndicationIds.size > 0) {
        const { data: linkedProposalsRaw } = await supabaseAdmin
            .from("proposals")
            .select(`
                id,
                client_id,
                contact_id,
                status,
                total_value,
                created_at,
                valid_until,
                seller:users(name, email),
                client:indicacoes!proposals_client_id_fkey(id, nome, status, marca, codigo_instalacao, created_at)
            `)
            .in("client_id", Array.from(relatedIndicationIds))
            .order("created_at", { ascending: false })
            .limit(200)

        const linkedProposals: ProposalRow[] = ((linkedProposalsRaw ?? []) as Array<Record<string, unknown>>).map(mapProposalRow)

        allProposals = dedupeById([...directProposals, ...linkedProposals]).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
    }

    const proposalIds = new Set(allProposals.map((proposal) => proposal.id))
    let allTasks = [...directTasks]
    const taskMatches: TaskRow[] = []

    if (relatedIndicationIds.size > 0) {
        const { data: tasksByIndicationRaw } = await supabase
            .from("tasks")
            .select(`
                id,
                title,
                status,
                priority,
                due_date,
                created_at,
                brand,
                department,
                client_name,
                codigo_instalacao,
                indicacao_id,
                contact_id,
                proposal_id,
                assignee:users!tasks_assignee_id_fkey(name, email)
            `)
            .in("indicacao_id", Array.from(relatedIndicationIds))
            .order("created_at", { ascending: false })
            .limit(220)

        taskMatches.push(
            ...(((tasksByIndicationRaw ?? []) as Array<Record<string, unknown>>).map(mapTaskRow))
        )
    }

    if (proposalIds.size > 0) {
        const { data: tasksByProposalRaw } = await supabase
            .from("tasks")
            .select(`
                id,
                title,
                status,
                priority,
                due_date,
                created_at,
                brand,
                department,
                client_name,
                codigo_instalacao,
                indicacao_id,
                contact_id,
                proposal_id,
                assignee:users!tasks_assignee_id_fkey(name, email)
            `)
            .in("proposal_id", Array.from(proposalIds))
            .order("created_at", { ascending: false })
            .limit(220)

        taskMatches.push(
            ...(((tasksByProposalRaw ?? []) as Array<Record<string, unknown>>).map(mapTaskRow))
        )
    }

    allTasks = dedupeById([...directTasks, ...taskMatches]).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    let crmCards: CrmCardRow[] = []
    if (relatedIndicationIds.size > 0) {
        const { data: crmCardsRaw } = await supabaseAdmin
            .from("crm_cards")
            .select("id, title, created_at, indicacao_id, stage_id, pipeline_id")
            .in("indicacao_id", Array.from(relatedIndicationIds))
            .order("created_at", { ascending: false })
            .limit(220)

        const cards = (crmCardsRaw ?? []) as {
            id: string
            title: string | null
            created_at: string
            indicacao_id: string
            stage_id: string
            pipeline_id: string
        }[]

        const stageIds = Array.from(new Set(cards.map((card) => card.stage_id)))
        const pipelineIds = Array.from(new Set(cards.map((card) => card.pipeline_id)))
        const indicationIds = Array.from(new Set(cards.map((card) => card.indicacao_id)))

        const [stagesResult, pipelinesResult, indicationsResult] = await Promise.all([
            stageIds.length > 0
                ? supabaseAdmin.from("crm_stages").select("id, name").in("id", stageIds)
                : Promise.resolve({ data: [], error: null }),
            pipelineIds.length > 0
                ? supabaseAdmin.from("crm_pipelines").select("id, name, brand").in("id", pipelineIds)
                : Promise.resolve({ data: [], error: null }),
            indicationIds.length > 0
                ? supabaseAdmin.from("indicacoes").select("id, nome, status").in("id", indicationIds)
                : Promise.resolve({ data: [], error: null }),
        ])

        const stageRows = (stagesResult.data ?? []) as Array<{ id: string; name: string }>
        const pipelineRows = (pipelinesResult.data ?? []) as Array<{ id: string; name: string; brand: "rental" | "dorata" }>
        const indicationRows = (indicationsResult.data ?? []) as Array<{ id: string; nome: string | null; status: string | null }>

        const stageMap = new Map(stageRows.map((row) => [row.id, row.name]))
        const pipelineMap = new Map(
            pipelineRows.map((row) => [row.id, { name: row.name, brand: row.brand }])
        )
        const indicationMap = new Map(
            indicationRows.map((row) => [row.id, { nome: row.nome, status: row.status }])
        )

        crmCards = cards.map((card) => {
            const pipeline = pipelineMap.get(card.pipeline_id)
            const indication = indicationMap.get(card.indicacao_id)
            return {
                id: card.id,
                title: card.title,
                created_at: card.created_at,
                indicacao_id: card.indicacao_id,
                stage_name: stageMap.get(card.stage_id) ?? null,
                pipeline_name: pipeline?.name ?? null,
                pipeline_brand: pipeline?.brand ?? null,
                indication_name: indication?.nome ?? null,
                indication_status: indication?.status ?? null,
            }
        })
    }

    const openTasks = allTasks.filter((task) => task.status !== "DONE").length
    const doneTasks = allTasks.length - openTasks
    const dorataProposals = allProposals.filter((proposal) => proposal.client?.marca === "dorata").length
    const rentalProposals = allProposals.filter((proposal) => proposal.client?.marca === "rental").length

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold">Contato 360</h1>
                    <p className="text-muted-foreground">{contactName}</p>
                    {canEditContacts ? (
                        <ContactNameEditor
                            contactId={contact.id}
                            initialName={contactName}
                        />
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/admin/contatos">Voltar aos contatos</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/admin/tarefas">Abrir tarefas</Link>
                    </Button>
                    {canDeleteContacts ? (
                        <DeleteContactButton contactId={contact.id} contactName={contactName} />
                    ) : null}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <Card>
                    <CardHeader>
                        <CardTitle>Resumo de relacionamento</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Tarefas abertas</p>
                            <p className="text-2xl font-bold">{openTasks}</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Tarefas concluídas</p>
                            <p className="text-2xl font-bold">{doneTasks}</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Orçamentos Dorata</p>
                            <p className="text-2xl font-bold">{dorataProposals}</p>
                        </div>
                        <div className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">Orçamentos Rental</p>
                            <p className="text-2xl font-bold">{rentalProposals}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Dados do contato</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Email:</span> {contact.email || "-"}</p>
                        <p><span className="text-muted-foreground">WhatsApp:</span> {contact.whatsapp || "-"}</p>
                        <p><span className="text-muted-foreground">Telefone:</span> {contact.phone || contact.mobile || "-"}</p>
                        <p><span className="text-muted-foreground">Cidade:</span> {[contact.city, contact.state].filter(Boolean).join(" / ") || "-"}</p>
                        <p><span className="text-muted-foreground">Origem:</span> {contact.source || "-"}</p>
                        <p><span className="text-muted-foreground">ID externo:</span> {contact.external_id || "-"}</p>
                        <p><span className="text-muted-foreground">Criado em:</span> {formatDate(contact.source_created_at ?? contact.created_at)}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Tarefas relacionadas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Título</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Prazo</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Vínculos</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allTasks.map((task) => (
                                <TableRow key={task.id}>
                                    <TableCell className="font-medium">
                                        <div className="space-y-1">
                                            <p>{task.title}</p>
                                            {task.client_name ? (
                                                <p className="text-xs text-muted-foreground">{task.client_name}</p>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell>{task.status}</TableCell>
                                    <TableCell>{task.assignee?.name || task.assignee?.email || "-"}</TableCell>
                                    <TableCell>{task.due_date ? formatDate(task.due_date) : "-"}</TableCell>
                                    <TableCell>{task.brand || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {task.contact_id === contact.id ? <Badge variant="secondary">Contato</Badge> : null}
                                            {task.proposal_id ? <Badge variant="outline">Orçamento</Badge> : null}
                                            {task.indicacao_id ? <Badge variant="outline">CRM</Badge> : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {allTasks.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                        Nenhuma tarefa relacionada encontrada.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Orçamentos relacionados</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Vendedor</TableHead>
                                <TableHead>Criado em</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allProposals.map((proposal) => (
                                <TableRow key={proposal.id}>
                                    <TableCell className="font-medium">#{proposal.id.slice(0, 8)}</TableCell>
                                    <TableCell>{proposal.client?.nome || "-"}</TableCell>
                                    <TableCell>{proposal.client?.marca || "-"}</TableCell>
                                    <TableCell>{proposal.status || "-"}</TableCell>
                                    <TableCell>{formatCurrency(proposal.total_value)}</TableCell>
                                    <TableCell>{proposal.seller?.name || proposal.seller?.email || "-"}</TableCell>
                                    <TableCell>{formatDate(proposal.created_at)}</TableCell>
                                </TableRow>
                            ))}
                            {allProposals.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                                        Nenhum orçamento relacionado encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>CRM relacionado</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Card</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Pipeline</TableHead>
                                <TableHead>Etapa</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Criado em</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {crmCards.map((card) => (
                                <TableRow key={card.id}>
                                    <TableCell className="font-medium">
                                        {card.title || `Card ${card.id.slice(0, 8)}`}
                                    </TableCell>
                                    <TableCell>{card.indication_name || "-"}</TableCell>
                                    <TableCell>{card.pipeline_name || card.pipeline_brand || "-"}</TableCell>
                                    <TableCell>{card.stage_name || "-"}</TableCell>
                                    <TableCell>{card.indication_status || "-"}</TableCell>
                                    <TableCell>{formatDate(card.created_at)}</TableCell>
                                </TableRow>
                            ))}
                            {crmCards.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                                        Nenhum card de CRM relacionado encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Indicações relacionadas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Marca</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Instalação</TableHead>
                                <TableHead>Criada em</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {relatedIndications.map((indication) => (
                                <TableRow key={indication.id}>
                                    <TableCell className="font-medium">{indication.nome || "-"}</TableCell>
                                    <TableCell>{indication.marca || "-"}</TableCell>
                                    <TableCell>{indication.status || "-"}</TableCell>
                                    <TableCell>{indication.codigo_instalacao || "-"}</TableCell>
                                    <TableCell>{formatDate(indication.created_at)}</TableCell>
                                </TableRow>
                            ))}
                            {relatedIndications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                                        Nenhuma indicação relacionada encontrada.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
