"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Plus, ArrowDown, ArrowUp, Lock, Unlock, Building2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createStockMovement, StockMovement, StockMovementType, type ProductWorkSale } from "@/services/product-service"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface StockMovementsProps {
    productId: string
    movements: StockMovement[]
    workSales?: ProductWorkSale[]
}

type TimelineItem = {
    id: string
    created_at: string
    type: StockMovementType | "WORK_SALE"
    quantity: number
    entity_name: string | null
    reference: string | null
}

export function StockMovements({ productId, movements, workSales = [] }: StockMovementsProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [type, setType] = useState<StockMovementType>("IN")
    const [quantity, setQuantity] = useState(1)
    const [entityName, setEntityName] = useState("")

    const { showToast } = useToast()
    const router = useRouter()

    async function handleSave() {
        if (quantity <= 0) {
            showToast({
                title: "Erro",
                description: "Quantidade deve ser maior que 0",
                variant: "error"
            })
            return
        }

        try {
            setLoading(true)
            await createStockMovement({
                product_id: productId,
                type,
                quantity,
                entity_name: entityName,
                date: new Date().toISOString().split('T')[0] // today
            })

            showToast({
                title: "Sucesso",
                description: "Movimentação registrada!",
                variant: "success"
            })
            setOpen(false)
            setQuantity(1)
            setEntityName("")
            router.refresh()
        } catch {
            showToast({
                title: "Erro",
                description: "Falha ao registrar movimentação.",
                variant: "error"
            })
        } finally {
            setLoading(false)
        }
    }

    const timeline = [
        ...movements.map((move) => ({
            id: move.id,
            created_at: move.created_at ?? new Date().toISOString(),
            type: move.type,
            quantity: Number(move.quantity || 0),
            entity_name: move.entity_name || null,
            reference: null,
        }) satisfies TimelineItem),
        ...workSales.map((sale) => ({
            id: sale.id,
            created_at: sale.sold_at,
            type: "WORK_SALE",
            quantity: Number(sale.quantity || 0),
            entity_name: sale.customer_name || sale.work_title || null,
            reference: [
                sale.work_title ? `Obra: ${sale.work_title}` : null,
                sale.installation_code ? `Instalação: ${sale.installation_code}` : null,
                sale.proposal_id ? `Proposta: ${sale.proposal_id.slice(0, 8)}` : null,
            ].filter(Boolean).join(" • ") || null,
        }) satisfies TimelineItem),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Histórico Dinâmico de Movimentações</h3>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Nova Movimentação
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Registrar Movimentação</DialogTitle>
                            <DialogDescription>
                                Adicione uma entrada, saída ou ajuste de estoque manual.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="type" className="text-right">
                                    Tipo
                                </Label>
                                <Select value={type} onValueChange={(val: StockMovementType) => setType(val)}>
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="IN">Entrada (+)</SelectItem>
                                        <SelectItem value="OUT">Saída (-)</SelectItem>
                                        <SelectItem value="RESERVE">Reservar (Block)</SelectItem>
                                        <SelectItem value="RELEASE">Liberar Reserva</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="quantity" className="text-right">
                                    Qtd.
                                </Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                                    className="col-span-3"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="entity" className="text-right">
                                    Ref. / Nome
                                </Label>
                                <Input
                                    id="entity"
                                    placeholder="Ex: Fornecedor X ou Cliente Y"
                                    value={entityName}
                                    onChange={(e) => setEntityName(e.target.value)}
                                    className="col-span-3"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSave} disabled={loading}>
                                {loading ? "Salvando..." : "Salvar"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Destino / Entidade</TableHead>
                            <TableHead>Origem</TableHead>
                            <TableHead className="text-right">Qtd.</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {timeline.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                    Nenhuma movimentação registrada.
                                </TableCell>
                            </TableRow>
                        ) : (
                            timeline.map((move) => (
                                <TableRow key={move.id}>
                                    <TableCell>{move.created_at ? format(new Date(move.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {move.type === 'IN' && <ArrowDown className="text-green-500 h-4 w-4" />}
                                            {move.type === 'OUT' && <ArrowUp className="text-red-500 h-4 w-4" />}
                                            {move.type === 'RESERVE' && <Lock className="text-orange-500 h-4 w-4" />}
                                            {move.type === 'RELEASE' && <Unlock className="text-blue-500 h-4 w-4" />}
                                            {move.type === 'WORK_SALE' && <Building2 className="text-violet-600 h-4 w-4" />}
                                            <span className="capitalize text-sm font-medium">
                                                {move.type === 'IN' ? 'Entrada' :
                                                    move.type === 'OUT' ? 'Saída' :
                                                        move.type === 'RESERVE' ? 'Reserva' :
                                                            move.type === 'RELEASE' ? 'Liberação' : 'Venda (Obra)'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{move.entity_name || '-'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{move.reference || '-'}</TableCell>
                                    <TableCell className="text-right font-mono">{move.quantity}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
