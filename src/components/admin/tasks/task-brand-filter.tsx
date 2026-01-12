"use client"

import { Button } from "@/components/ui/button"
import { useRouter, useSearchParams } from "next/navigation"

export function TaskBrandFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentBrand = searchParams.get('brand') || 'all'

    const setBrand = (brand: string) => {
        const params = new URLSearchParams(searchParams)
        if (brand === 'all') {
            params.delete('brand')
        } else {
            params.set('brand', brand)
        }
        router.push(`?${params.toString()}`)
    }

    return (
        <div className="flex bg-muted p-1 rounded-lg">
            <Button
                variant={currentBrand === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBrand('all')}
                className="h-8"
            >
                Todas
            </Button>
            <Button
                variant={currentBrand === 'rental' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBrand('rental')}
                className="h-8"
            >
                Rental
            </Button>
            <Button
                variant={currentBrand === 'dorata' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setBrand('dorata')}
                className="h-8"
            >
                Dorata
            </Button>
        </div>
    )
}
