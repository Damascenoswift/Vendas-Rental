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
                "group relative flex items-center overflow-hidden rounded-xl text-sm font-medium transition-all duration-200",
                collapsed ? "mx-auto h-10 w-10 justify-center px-0 py-0" : "h-10 gap-3 px-3 py-2",
                isActive
                    ? "bg-gradient-to-r from-sidebar-primary/95 via-sidebar-primary to-sidebar-primary/85 text-sidebar-primary-foreground shadow-[0_10px_24px_-18px_rgba(0,0,0,0.8)]"
                    : "text-sidebar-foreground/76 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
            )}
        >
            <Icon
                className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    isActive ? "text-current" : "text-sidebar-foreground/70 group-hover:text-current group-hover:-translate-y-0.5"
                )}
            />
            {!collapsed && <span>{label}</span>}
            {typeof badgeCount === "number" && badgeCount > 0 && (
                <span
                    className={cn(
                        "rounded-full text-[10px] font-semibold leading-none shadow-sm",
                        collapsed
                            ? isActive
                                ? "absolute right-0.5 top-0.5 min-w-4 px-1 py-0.5 bg-sidebar-primary-foreground text-sidebar-primary"
                                : "absolute right-0.5 top-0.5 min-w-4 px-1 py-0.5 bg-primary text-primary-foreground"
                            : isActive
                              ? "ml-auto border border-sidebar-primary-foreground/25 bg-sidebar-primary-foreground/20 px-1.5 py-0.5 text-sidebar-primary-foreground"
                              : "ml-auto border border-sidebar-primary/35 bg-primary/20 px-1.5 py-0.5 text-primary"
                    )}
                >
                    {badgeCount > 99 ? "99+" : badgeCount}
                </span>
            )}
            {isActive && (
                <div className="absolute left-0 top-1/2 hidden h-7 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary-foreground/80 lg:block" />
            )}
        </Link>
    )
}
