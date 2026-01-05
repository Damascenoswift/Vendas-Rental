"use client"

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface UserBadgeProps {
    name?: string | null
    email?: string | null
    showName?: boolean
}

function stringToColor(str: string) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase()
    return "#" + "00000".substring(0, 6 - c.length) + c
}

// Better approach: HSL for consistent pastel/vibrant tones
function stringToHsl(str: string) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const h = hash % 360
    return `hsl(${h}, 70%, 50%)` // Saturation 70%, Lightness 50%
}

export function UserBadge({ name, email, showName = false }: UserBadgeProps) {
    const displayName = name || email || "Sistema"
    const color = stringToHsl(displayName)

    // Initials
    const initials = displayName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                        {/* The Dot / Badge */}
                        <div
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-1 ring-white"
                            style={{ backgroundColor: color }}
                        >
                            {initials}
                        </div>
                        {showName && <span className="text-sm text-muted-foreground">{displayName}</span>}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">Criado/Editado por: <span className="font-semibold">{displayName}</span></p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
