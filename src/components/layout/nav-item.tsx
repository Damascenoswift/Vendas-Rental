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
    exactMatch?: boolean
    badgeCount?: number | null
    collapsed?: boolean
    onClick?: () => void
}

export function NavItem({
    href,
    label,
    icon: Icon,
    exactMatch = false,
    badgeCount,
    collapsed = false,
    onClick,
}: NavItemProps) {
    const pathname = usePathname()
    const isActive = exactMatch
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`)

    return (
        <Link
            href={href}
            onClick={onClick}
            title={label}
            aria-label={label}
            className={cn(
                "relative flex items-center rounded-md text-sm font-medium transition-all duration-200 group",
                collapsed ? "mx-auto h-10 w-10 justify-center px-0 py-0" : "gap-3 px-3 py-2",
                isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
        >
            <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-current" : "text-muted-foreground group-hover:text-current")} />
            {!collapsed && <span>{label}</span>}
            {typeof badgeCount === "number" && badgeCount > 0 && (
                <span
                    className={cn(
                        "rounded-full text-[10px] font-semibold leading-none",
                        collapsed
                            ? isActive
                                ? "absolute right-0 top-0 min-w-4 px-1 py-0.5 bg-sidebar-primary-foreground text-sidebar-primary"
                                : "absolute right-0 top-0 min-w-4 px-1 py-0.5 bg-primary text-primary-foreground"
                            : isActive
                              ? "ml-auto px-1.5 py-0.5 bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                              : "ml-auto px-1.5 py-0.5 bg-primary/10 text-primary"
                    )}
                >
                    {badgeCount > 99 ? "99+" : badgeCount}
                </span>
            )}
            {isActive && (
                <div className="absolute left-0 h-8 w-1 rounded-r-full bg-primary lg:hidden" />
            )}
        </Link>
    )
}
