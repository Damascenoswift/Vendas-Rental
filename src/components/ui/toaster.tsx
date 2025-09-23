"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { useToastStore } from "@/hooks/use-toast"

const variantStyles: Record<string, string> = {
  success:
    "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100",
  error:
    "border-rose-300/60 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-100",
  info:
    "border-sky-300/60 bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-100",
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const dismissToast = useToastStore((state) => state.dismissToast)

  useEffect(() => {
    // Clean up toasts when unmounting container (e.g., leaving layout)
    return () => {
      const currentToasts = useToastStore.getState().toasts
      currentToasts.forEach((toast) => dismissToast(toast.id))
    }
  }, [dismissToast])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[1000] mx-auto flex w-full max-w-md flex-col gap-3 px-4 sm:right-4 sm:top-4 sm:left-auto sm:mx-0">
      {toasts.map((toast) => {
        const variantClass = variantStyles[toast.variant ?? "info"]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg transition-all ${variantClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                {toast.title ? (
                  <p className="text-sm font-semibold leading-none">{toast.title}</p>
                ) : null}
                {toast.description ? (
                  <p className="text-sm text-foreground/80 dark:text-foreground">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <Button
                aria-label="Fechar alerta"
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 rounded-full"
                onClick={() => dismissToast(toast.id)}
              >
                x
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
