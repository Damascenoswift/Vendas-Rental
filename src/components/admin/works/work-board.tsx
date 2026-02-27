"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { WorkCard } from "@/services/work-cards-service"
import { WorkCardItem } from "@/components/admin/works/work-card"
import { WorkDetailsDialog } from "@/components/admin/works/work-details-dialog"

export function WorkBoard({
    initialCards,
    initialOpenWorkId = null,
}: {
    initialCards: WorkCard[]
    initialOpenWorkId?: string | null
}) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [selectedWorkId, setSelectedWorkId] = useState<string | null>(initialOpenWorkId)

    useEffect(() => {
        if (!initialOpenWorkId) return
        setSelectedWorkId(initialOpenWorkId)
    }, [initialOpenWorkId])

    const replaceOpenWorkInUrl = (workId: string | null) => {
        const nextParams = new URLSearchParams(searchParams?.toString() ?? "")
        if (workId) {
            nextParams.set("openWork", workId)
        } else {
            nextParams.delete("openWork")
        }

        const nextQuery = nextParams.toString()
        const nextPath = nextQuery ? `${pathname}?${nextQuery}` : pathname
        router.replace(nextPath, { scroll: false })
    }

    if (initialCards.length === 0) {
        return (
            <div className="rounded-md border bg-white p-8 text-center text-sm text-muted-foreground">
                Nenhuma obra encontrada para os filtros atuais.
            </div>
        )
    }

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {initialCards.map((item) => (
                    <WorkCardItem
                        key={item.id}
                        item={item}
                        onClick={() => {
                            setSelectedWorkId(item.id)
                            replaceOpenWorkInUrl(item.id)
                        }}
                    />
                ))}
            </div>

            <WorkDetailsDialog
                workId={selectedWorkId}
                open={Boolean(selectedWorkId)}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedWorkId(null)
                        replaceOpenWorkInUrl(null)
                    }
                }}
                onChanged={() => router.refresh()}
            />
        </>
    )
}
