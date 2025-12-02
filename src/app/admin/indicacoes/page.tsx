import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { IndicationStatusSelect } from "@/components/admin/indication-status-select"
import { getProfile } from "@/lib/auth"
import { IndicationFlags } from "@/components/admin/indication-flags"
import { IndicationFillButton } from "@/components/admin/indication-fill-button"
import { IndicationValueEdit } from "@/components/admin/indication-value-edit"
import { IndicationDetailsDialog } from "@/components/admin/indication-details-dialog"

export const dynamic = "force-dynamic"

export default async function AdminIndicacoesPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const role = profile?.role

    if (role !== "adm_mestre") {
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h2 className="text-lg font-bold">Acesso Negado</h2>
                    <p>Apenas Administradores Mestre podem acessar esta página.</p>
                </div>
            </div>
        )
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: indicacoes, error } = await supabaseAdmin
        .from("indicacoes")
        .select("*, users(email, name)") // Assuming users relation exists or we just use the ID if not
        // Note: The relation 'users' might not exist if 'user_id' references auth.users directly and not public.users
        // If public.users exists and has a foreign key, this works.
        // Based on previous context, public.users exists.
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar indicações:", error)
        return (
            <div className="container mx-auto py-10">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <h3 className="font-bold">Erro ao carregar indicações</h3>
                    <p className="text-sm">{error.message}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-10">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Gerenciar Indicações</h1>
                <p className="text-muted-foreground">
                    Visualize e atualize o status de todas as indicações.
                </p>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Marca</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Valor Compensado</TableHead>
                            <TableHead>Assinatura / Compensação</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {indicacoes?.map((ind) => {
                            // Try to get vendor info if available, otherwise fallback to ID
                            const vendedorInfo = (ind.users as any)?.name || (ind.users as any)?.email || ind.user_id

                            return (
                                <TableRow key={ind.id}>
                                    <TableCell>
                                        {new Intl.DateTimeFormat("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        }).format(new Date(ind.created_at))}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={ind.marca === "rental" ? "default" : "secondary"}>
                                            {ind.marca.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{ind.nome}</span>
                                            <span className="text-xs text-muted-foreground">{ind.email}</span>
                                            <span className="text-xs text-muted-foreground">{ind.telefone}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={vendedorInfo}>
                                        {vendedorInfo}
                                    </TableCell>
                                    <TableCell>
                                        <div className="w-[180px]">
                                            <IndicationStatusSelect id={ind.id} initialStatus={ind.status} />
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <IndicationValueEdit id={ind.id} initialValue={ind.valor} />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <IndicationDetailsDialog indicationId={ind.id} userId={ind.user_id} />
                                            <IndicationFlags
                                                id={ind.id}
                                                assinadaEm={(ind as any).assinada_em ?? null}
                                                compensadaEm={(ind as any).compensada_em ?? null}
                                            />
                                            <IndicationFillButton
                                                indication={{
                                                    tipo: ind.tipo,
                                                    nome: ind.nome,
                                                    email: ind.email,
                                                    telefone: ind.telefone,
                                                    documento: ind.documento,
                                                }}
                                                vendedorName={vendedorInfo}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {indicacoes?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    Nenhuma indicação encontrada.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div >
        </div >
    )
}
