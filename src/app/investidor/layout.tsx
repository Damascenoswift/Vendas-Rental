import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { InvestorSidebar } from "@/components/investor/investor-sidebar"
import { ToastContainer } from "@/components/ui/toaster"

export default async function InvestorLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch profile to verify role
    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const effectiveRole = profile?.role ?? (user.user_metadata?.role as string | undefined)
    const canAccess = ['investidor', 'adm_mestre', 'funcionario_n1', 'funcionario_n2'].includes(effectiveRole ?? '')

    if (!canAccess) {
        redirect("/dashboard")
    }

    return (
        <div className="flex min-h-screen bg-background">
            <InvestorSidebar />
            <main className="flex-1 p-8 bg-slate-50/50">
                <div className="max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
            <ToastContainer />
        </div>
    )
}
