import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function DiagnosticPage() {
    const supabaseAdmin = createSupabaseServiceClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Check User Role (Public Table)
    let userProfile = null
    if (user) {
        userProfile = await getProfile(supabaseAdmin, user.id)
    }

    // 2. List Files in Storage (Service Role - Bypasses RLS)
    // List root folders
    const { data: rootFolders, error: rootError } = await supabaseAdmin.storage
        .from("indicacoes")
        .list()

    // Deep check (first 5 folders)
    const fileStructure: any[] = []
    if (rootFolders) {
        for (const folder of rootFolders.slice(0, 5)) {
            const { data: items } = await supabaseAdmin.storage
                .from("indicacoes")
                .list(folder.name)

            const children = []
            if (items) {
                for (const item of items) {
                    // If it looks like a folder (no dot), list inside
                    if (!item.name.includes('.')) {
                        const { data: subFiles } = await supabaseAdmin.storage
                            .from("indicacoes")
                            .list(`${folder.name}/${item.name}`)
                        children.push({ name: item.name, type: 'folder', children: subFiles })
                    } else {
                        children.push({ name: item.name, type: 'file', size: item.metadata?.size })
                    }
                }
            }
            fileStructure.push({ name: folder.name, children })
        }
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <h1 className="text-2xl font-bold">Diagnóstico do Sistema</h1>

            <div className="p-4 border rounded bg-muted/50">
                <h2 className="text-xl font-semibold mb-2">1. Seu Usuário</h2>
                <pre className="text-xs bg-black text-white p-4 rounded overflow-auto">
                    {JSON.stringify({
                        auth_id: user?.id,
                        role: userProfile?.role,
                        allowed_brands: userProfile?.allowedBrands
                    }, null, 2)}
                </pre>
            </div>

            <div className="p-4 border rounded bg-muted/50">
                <h2 className="text-xl font-semibold mb-2">2. Arquivos no Storage (Visão do Admin)</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Listando estrutura real do bucket "indicacoes" (bypassing RLS).
                </p>

                {rootError ? (
                    <div className="text-red-500">Erro ao listar: {JSON.stringify(rootError)}</div>
                ) : (
                    <pre className="text-xs bg-black text-white p-4 rounded overflow-auto max-h-[500px]">
                        {JSON.stringify(fileStructure, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    )
}
