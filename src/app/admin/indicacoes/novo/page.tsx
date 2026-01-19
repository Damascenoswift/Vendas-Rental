
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { IndicacaoForm } from "@/components/forms/indicacao-form"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function NewIndicacaoPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)

    if (!profile) {
        redirect("/login")
    }

    // Pass allowed brands from profile
    const allowedBrands = profile.allowedBrands || ["rental"]

    // Fetch subordinates if supervisor
    let subordinates: any[] = []
    if (profile.role === 'supervisor') {
        const { getSubordinates } = await import('@/app/actions/auth-admin')
        subordinates = await getSubordinates(user.id)
    }

    return (
        <div className="container mx-auto py-10 max-w-4xl">
            <div className="mb-6">
                <Button variant="ghost" asChild className="pl-0 hover:pl-0 hover:bg-transparent">
                    <Link href="/admin/indicacoes">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Voltar para lista
                    </Link>
                </Button>
            </div>

            <div className="mb-8">
                <h1 className="text-3xl font-bold">Registro Manual de Cliente</h1>
                <p className="text-muted-foreground">
                    Cadastre clientes legados ou sem documentos imediatos.
                </p>
            </div>

            <IndicacaoForm
                userId={user.id}
                allowedBrands={allowedBrands}
                userRole={profile.role}
                subordinates={subordinates}
                isInternalRegistration={true}
            />
        </div>
    )
}
