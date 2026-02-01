import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { UcForm } from "@/components/forms/uc-form"

export const dynamic = "force-dynamic"

export default async function NovaUcPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: clientes } = await supabase
        .from("indicacoes")
        .select("id, nome")
        .in("status", ["APROVADA", "CONCLUIDA"])
        .order("nome")

    return (
        <div className="max-w-2xl mx-auto py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Nova UC</h1>
                <p className="text-muted-foreground">
                    Cadastre a unidade consumidora vinculada ao cliente.
                </p>
            </div>

            <UcForm clientes={clientes || []} />
        </div>
    )
}
