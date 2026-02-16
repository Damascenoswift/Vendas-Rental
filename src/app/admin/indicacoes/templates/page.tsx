import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { IndicationTemplateManager } from "@/components/admin/indicacao-template-manager"
import { hasSalesAccess } from "@/lib/sales-access"

export const dynamic = "force-dynamic"

export default async function IndicationTemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role

  const allowedRoles = ["adm_mestre", "adm_dorata", "supervisor", "funcionario_n1", "funcionario_n2"]
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

  const { data: templates } = await supabase
    .from("indicacao_templates")
    .select("id, name, vendedor_id, created_at, base_payload")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  let vendors: Array<{ id: string; name?: string | null; email?: string | null }> = []

  if (role === "supervisor") {
    const { getSubordinates } = await import("@/app/actions/auth-admin")
    const subordinates = await getSubordinates(user.id)
    vendors = []
    if (hasSalesAccess({ role: profile?.role, sales_access: profile?.salesAccess ?? null })) {
      vendors.push({ id: user.id, name: profile?.name ?? user.email, email: user.email })
    }
    vendors.push(...subordinates)
  } else {
    const supabaseAdmin = createSupabaseServiceClient()
    let { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, status, sales_access")
      .in("status", ["active", "ATIVO"])
      .order("name", { ascending: true })

    if (usersError && /could not find the 'sales_access' column/i.test(usersError.message ?? "")) {
      const fallback = await supabaseAdmin
        .from("users")
        .select("id, name, email, role, status")
        .in("status", ["active", "ATIVO"])
        .order("name", { ascending: true })
      users = fallback.data as typeof users
      usersError = fallback.error as typeof usersError
    }

    if (usersError) {
      console.error("Erro ao buscar vendedores para templates:", usersError)
      vendors = []
    } else {
      vendors = (users ?? [])
        .filter((row) => hasSalesAccess(row as { role?: string | null; sales_access?: boolean | null }))
        .map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
        }))
    }
  }

  vendors = vendors.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
  }))

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Templates de Indicação</h1>
        <p className="text-muted-foreground">
          Crie um template e importe UCs para gerar indicações em massa.
        </p>
      </div>

      <IndicationTemplateManager
        initialTemplates={templates ?? []}
        vendors={vendors}
        currentUserId={user.id}
      />
    </div>
  )
}
