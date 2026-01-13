"use client"

import { useState, useEffect } from "react"
import { Product } from "@/services/product-service"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProductItem {
    id: string
    quantity: number
    price: number
    power?: number // for panels
}

interface ProductSelectorProps {
    label: string
    products: Product[]
    selectedItems: ProductItem[]
    onChange: (items: ProductItem[]) => void
    singleItem?: boolean
}

export function ProductSelector({
    label,
    products,
    selectedItems,
    onChange,
    singleItem = false
}: ProductSelectorProps) {
    const [selectedProductId, setSelectedProductId] = useState<string>("")
    const [quantity, setQuantity] = useState<number>(1)

    const handleAdd = () => {
        if (!selectedProductId) return

        const product = products.find(p => p.id === selectedProductId)
        if (!product) return

        if (singleItem) {
            onChange([{
                id: product.id,
                quantity: quantity,
                price: product.price,
                power: product.power || 0
            }])
        } else {
            // Find if already exists
            const existingIndex = selectedItems.findIndex(i => i.id === product.id)
            if (existingIndex >= 0) {
                const newItems = [...selectedItems]
                newItems[existingIndex].quantity += quantity
                onChange(newItems)
            } else {
                onChange([...selectedItems, {
                    id: product.id,
                    quantity: quantity,
                    price: product.price,
                    power: product.power || 0
                }])
            }
        }

        // Reset if multi
        if (!singleItem) {
            setQuantity(1)
            setSelectedProductId("")
        }
    }

    const handleRemove = (index: number) => {
        const newItems = [...selectedItems]
        newItems.splice(index, 1)
        onChange(newItems)
    }

    const getProductName = (id: string) => products.find(p => p.id === id)?.name || id

    return (
        <div className="space-y-4 rounded-md border p-4">
            <h4 className="font-medium text-sm">{label}</h4>

            <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                    <Label className="text-xs">Produto</Label>
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                            {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name} - {p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    {(p.stock_total || 0) > 0 && ` (Estoque: ${p.stock_total})`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-20 space-y-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                    />
                </div>
                <Button onClick={handleAdd} variant="secondary" disabled={!selectedProductId}>
                    {singleItem && selectedItems.length > 0 ? "Substituir" : "Adicionar"}
                </Button>
            </div>

            {selectedItems.length > 0 && (
                <div className="space-y-2 mt-4">
                    {selectedItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm bg-muted/50 p-2 rounded">
                            <span>
                                {item.quantity}x {getProductName(item.id)}
                            </span>
                            <div className="flex items-center gap-4">
                                <span>{(item.quantity * item.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                {!singleItem && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => handleRemove(idx)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
