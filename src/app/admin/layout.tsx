import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar" // Import Sidebar
import { ToastContainer } from "@/components/ui/toaster"
import { Bell } from "lucide-react"
import { NotificationSoundListener } from "@/components/layout/notification-sound-listener"
import { getProfile } from "@/lib/auth"
import { hasWorksOnlyScope } from "@/lib/department-access"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const profile = await getProfile(supabase, user.id)
    const worksOnlyScope = hasWorksOnlyScope(profile?.department)

    let unreadNotifications = 0
    if (!worksOnlyScope) {
        const { count: unreadCount, error: unreadError } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient_user_id", user.id)
            .eq("is_read", false)

        if (unreadError) {
            console.error("Erro ao buscar notificações não lidas:", unreadError)
        } else {
            unreadNotifications = unreadCount ?? 0
        }
    }

    return (
        <div className="flex min-h-screen">
            <NotificationSoundListener />
            <Sidebar /> {/* Add Sidebar here */}
            <div className="flex flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6 shadow-sm">
                    <div className="flex flex-1 items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                            <span className="text-lg">Painel Administrativo</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                                {user.email}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!worksOnlyScope ? (
                                <>
                                    <Link href="/admin/notificacoes">
                                        <Button variant="outline" size="sm">
                                            <Bell className="mr-2 h-4 w-4" />
                                            Notificações
                                            {unreadNotifications > 0 && (
                                                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                                    {unreadNotifications}
                                                </span>
                                            )}
                                        </Button>
                                    </Link>
                                    <Link href="/dashboard">
                                        <Button variant="outline" size="sm">
                                            Voltar ao Dashboard
                                        </Button>
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link href="/admin/chat">
                                        <Button variant="outline" size="sm">
                                            Chat Interno
                                        </Button>
                                    </Link>
                                    <Link href="/admin/obras">
                                        <Button variant="outline" size="sm">
                                            Voltar ao Obras
                                        </Button>
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </header>
                <main className="flex-1 bg-slate-50/50 p-6">
                    {children}
                </main>
            </div>
            <ToastContainer />
        </div>
    )
}
