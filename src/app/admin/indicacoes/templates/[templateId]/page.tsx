import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { IndicationTemplateItems } from "@/components/admin/indicacao-template-items"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ templateId: string }>
}

export default async function IndicationTemplateDetailPage({ params }: PageProps) {
  const { templateId } = await params
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

  const { data: template, error: templateError } = await supabase
    .from("indicacao_templates")
    .select("id, name, vendedor_id, base_payload")
    .eq("id", templateId)
    .single()

  if (templateError || !template) {
    return (
      <div className="container mx-auto py-10">
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          <h2 className="text-lg font-bold">Template não encontrado</h2>
          <p>Verifique o link e tente novamente.</p>
        </div>
      </div>
    )
  }

  const { data: items } = await supabase
    .from("indicacao_template_items")
    .select("id, codigo_instalacao, codigo_cliente, unidade_consumidora, status, indicacao_id, error_message, created_at")
    .eq("template_id", template.id)
    .order("created_at", { ascending: true })

  const supabaseAdmin = createSupabaseServiceClient()
  const { data: vendor } = await supabaseAdmin
    .from("users")
    .select("id, name, email")
    .eq("id", template.vendedor_id)
    .single()

  return (
    <div className="container mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cadastro em Massa</h1>
        <p className="text-muted-foreground">
          Importe as UCs e gere indicações sem afetar o fluxo atual.
        </p>
      </div>

      <IndicationTemplateItems template={template} items={items ?? []} vendor={vendor ?? null} />
    </div>
  )
}
