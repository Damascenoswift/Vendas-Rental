"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface NavItemProps {
    href: string
    label: string
    icon: LucideIcon
    active?: boolean
    onClick?: () => void
}

export function NavItem({ href, label, icon: Icon, onClick }: NavItemProps) {
    const pathname = usePathname()
    // Check exact match or sub-paths for admin sections, but accurate for dashboard root
    const isActive = href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(href)

    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 group",
                isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-current" : "text-muted-foreground group-hover:text-current")} />
            <span>{label}</span>
            {isActive && (
                <div className="absolute left-0 h-8 w-1 rounded-r-full bg-primary lg:hidden" />
            )}
        </Link>
    )
}
