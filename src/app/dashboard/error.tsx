"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function ErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Dashboard Error:", error)
    }, [error])

    return (
        <div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-6 p-4">
            <div className="flex flex-col items-center gap-2 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <h2 className="text-xl font-semibold text-foreground">
                    Ops! Algo deu errado no Dashboard.
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                    Ocorreu um erro ao carregar esta página.
                </p>
            </div>

            <div className="w-full max-w-lg rounded-lg border bg-muted/50 p-4 font-mono text-xs text-destructive overflow-auto max-h-[300px]">
                <p className="font-bold mb-2">{error.name}: {error.message}</p>
                <div className="whitespace-pre-wrap opacity-70">
                    {error.stack}
                </div>
            </div>

            <div className="flex gap-4">
                <Button
                    onClick={() => reset()}
                    variant="default"
                >
                    Tentar novamente
                </Button>
                <Button
                    onClick={() => window.location.href = '/'}
                    variant="outline"
                >
                    Voltar ao início
                </Button>
            </div>
        </div>
    )
}
