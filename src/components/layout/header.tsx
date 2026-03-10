"use client"

import { useAuthSession } from "@/hooks/use-auth-session"
import { Menu, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"

export function Header() {
    const { session, profile } = useAuthSession()

    const email = session?.user.email
    const name = session?.user.user_metadata?.nome || email?.split('@')[0] || "Usuário"
    const companyDisplay =
        profile?.supervisedCompanyName ||
        profile?.companyName ||
        email ||
        "—"
    const todayLabel = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
    }).format(new Date())

    return (
        <header className="glass-surface sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/60 px-3 sm:px-6 lg:h-[68px]">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="border-r border-border/60 p-0">
                    <Sidebar className="block w-full border-none h-full" />
                </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Central de Operações
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <p className="truncate text-sm font-medium text-foreground/90">
                        {todayLabel}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="hidden rounded-2xl border border-border/60 bg-background/70 px-3 py-2 text-right md:block">
                    <p className="text-sm font-semibold leading-none">{name}</p>
                    <p className="text-xs text-muted-foreground">{companyDisplay}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-secondary text-xs font-bold ring-2 ring-background">
                    {name.substring(0, 2).toUpperCase()}
                </div>
            </div>
        </header>
    )
}
