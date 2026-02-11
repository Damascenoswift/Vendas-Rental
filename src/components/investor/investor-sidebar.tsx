"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Factory, PiggyBank, LogOut, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

const sidebarItems = [
    {
        title: "Visão Geral",
        href: "/investidor",
        icon: BarChart3,
    },
    {
        title: "Minhas Usinas",
        href: "/investidor/usinas",
        icon: Factory,
    },
    {
        title: "Meus Clientes",
        href: "/investidor/clientes",
        icon: Users,
    },
    {
        title: "Financeiro",
        href: "/investidor/financeiro",
        icon: PiggyBank,
    },
]

export function InvestorSidebar() {
    const pathname = usePathname()
    const router = useRouter()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.replace("/login")
    }

    return (
        <nav className="w-64 border-r bg-muted/10 min-h-screen p-4 flex flex-col">
            <div className="mb-6 px-4">
                <h2 className="text-lg font-bold tracking-tight text-blue-900">Portal do Investidor</h2>
                <p className="text-xs text-muted-foreground">Rental Energia</p>
            </div>

            <div className="space-y-2 flex-1">
                {sidebarItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start gap-2",
                                pathname === item.href && "bg-blue-50 text-blue-700"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.title}
                        </Button>
                    </Link>
                ))}
            </div>

            <div className="pt-4 mt-4 border-t">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleSignOut}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                </Button>
            </div>
        </nav>
    )
}
