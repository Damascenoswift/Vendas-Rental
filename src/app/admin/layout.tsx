import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar" // Import Sidebar
import { ToastContainer } from "@/components/ui/toaster"

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

    return (
        <div className="flex min-h-screen">
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
                        <Link href="/dashboard">
                            <Button variant="outline" size="sm">
                                Voltar ao Dashboard
                            </Button>
                        </Link>
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
