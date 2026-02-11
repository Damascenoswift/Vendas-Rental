"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Factory, Users, FileText, Zap, PlugZap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const sidebarItems = [
    {
        title: "Dashboard",
        href: "/admin/energia",
        icon: BarChart3,
    },
    {
        title: "Usinas",
        href: "/admin/energia/usinas",
        icon: Factory,
    },
    {
        title: "UCs",
        href: "/admin/energia/ucs",
        icon: PlugZap,
    },
    {
        title: "Alocações",
        href: "/admin/energia/alocacoes",
        icon: Users,
    },
    {
        title: "Produção",
        href: "/admin/energia/producao",
        icon: Zap,
    },
    {
        title: "Faturas",
        href: "/admin/energia/faturas",
        icon: FileText,
    },
]

export function EnergySidebar() {
    const pathname = usePathname()

    return (
        <nav className="w-64 border-r bg-muted/10 min-h-screen p-4 space-y-2">
            <div className="mb-6 px-4">
                <h2 className="text-lg font-bold tracking-tight">Gestão de Energia</h2>
                <p className="text-xs text-muted-foreground">Rental Energia</p>
            </div>

            {sidebarItems.map((item) => (
                <Link key={item.href} href={item.href}>
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-2",
                            pathname === item.href && "bg-secondary"
                        )}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.title}
                    </Button>
                </Link>
            ))}

            <div className="pt-4 mt-4 border-t">
                <Link href="/dashboard">
                    <Button variant="outline" size="sm" className="w-full">
                        Voltar ao Dashboard
                    </Button>
                </Link>
            </div>
        </nav>
    )
}
