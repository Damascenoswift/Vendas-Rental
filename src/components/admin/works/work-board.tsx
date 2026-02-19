"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { WorkCard } from "@/services/work-cards-service"
import { WorkCardItem } from "@/components/admin/works/work-card"
import { WorkDetailsDialog } from "@/components/admin/works/work-details-dialog"

export function WorkBoard({ initialCards }: { initialCards: WorkCard[] }) {
    const router = useRouter()
    const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)

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
                        onClick={() => setSelectedWorkId(item.id)}
                    />
                ))}
            </div>

            <WorkDetailsDialog
                workId={selectedWorkId}
                open={Boolean(selectedWorkId)}
                onOpenChange={(open) => {
                    if (!open) setSelectedWorkId(null)
                }}
                onChanged={() => router.refresh()}
            />
        </>
    )
}
