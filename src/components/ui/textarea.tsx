import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
    return (
        <textarea
            className={cn(
                "flex min-h-[60px] w-full rounded-lg border border-input bg-background/85 px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground transition-[border-color,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className
            )}
            ref={ref}
            {...props}
        />
    )
})
Textarea.displayName = "Textarea"

export { Textarea }
