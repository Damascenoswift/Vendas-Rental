"use client"

import { useAuthSession } from "@/hooks/use-auth-session"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
// Note: We are reusing the Sidebar component content for mobile sheet, 
// but we need to adapt it slightly or create a MobileNav variant. 
// For now, let's just create a header that shows user info.

export function Header() {
    const { session, profile } = useAuthSession()

    // Derived from original layout
    const email = session?.user.email
    const name = session?.user.user_metadata?.nome || email?.split('@')[0] || "Usuário"
    const companyDisplay =
        profile?.supervisedCompanyName ||
        profile?.companyName ||
        email ||
        "—"

    return (
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6 lg:h-[60px]">
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 lg:hidden">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0">
                    <Sidebar className="block w-full border-none h-full" />
                </SheetContent>
            </Sheet>
            <div className="w-full flex-1">
                {/* Breadcrumb or Page Title placeholder */}
                {/* <h1 className="text-lg font-semibold md:text-xl">Dashboard</h1> */}
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                    <p className="text-sm font-medium leading-none">{name}</p>
                    <p className="text-xs text-muted-foreground">{companyDisplay}</p>
                </div>
                {/* Provide a simple avatar fallback */}
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold ring-2 ring-background">
                    {name.substring(0, 2).toUpperCase()}
                </div>
            </div>
        </header>
    )
}
