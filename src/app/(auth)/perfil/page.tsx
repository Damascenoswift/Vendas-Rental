import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/auth"
import { ProfileForm } from "@/components/profile/profile-form"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)

    if (!profile) {
        return <div>Erro ao carregar perfil.</div>
    }

    return (
        <div className="container mx-auto py-10 max-w-2xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Meu Perfil</h1>
                <p className="text-muted-foreground">
                    Gerencie suas informações pessoais.
                </p>
            </div>

            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                <ProfileForm
                    initialName={profile.name || ""}
                    initialPhone={profile.phone || ""}
                    email={profile.email || user.email || ""}
                />
            </div>
        </div>
    )
}
