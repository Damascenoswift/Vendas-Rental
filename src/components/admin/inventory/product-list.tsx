"use client"

import { useState } from "react"
import { Product } from "@/services/product-service"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Search, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { deleteProduct } from "@/services/product-service"
import { useToast } from "@/hooks/use-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ProductListProps {
    initialProducts: Product[]
}

export function ProductList({ initialProducts }: ProductListProps) {
    const { showToast } = useToast()
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState("")

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            const result = await deleteProduct(deletingId)
            if (result.error) {
                throw new Error(result.error)
            }
            showToast({
                title: "Sucesso",
                description: "Produto excluído com sucesso.",
                variant: "success",
            })
            setDeletingId(null)
        } catch (error) {
            showToast({
                title: "Erro",
                description: "Erro ao excluir produto.",
                variant: "error",
            })
        }
    }

    const filteredProducts = initialProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.manufacturer && product.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="space-y-4">
            <div className="flex items-center">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar produtos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Fabricante</TableHead>
                            <TableHead>Preço</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[70px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredProducts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Nenhum produto encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredProducts.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium">{product.name}</TableCell>
                                    <TableCell className="capitalize">{translatedType(product.type)}</TableCell>
                                    <TableCell>{product.manufacturer || '-'}</TableCell>
                                    <TableCell>{formatCurrency(product.price)}</TableCell>
                                    <TableCell>
                                        <Badge variant={product.active ? "default" : "secondary"}>
                                            {product.active ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                        {/* Low Stock Warning */}
                                        {/* @ts-ignore */}
                                        {((product.stock_total || 0) - (product.stock_reserved || 0)) < (product.min_stock ?? 5) && product.active && (
                                            <div className="flex items-center text-red-600 text-xs mt-1 font-semibold">
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                Baixo Est.
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Abrir menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                <Link href={`/admin/estoque/${product.id}`}>
                                                    <DropdownMenuItem>Editar</DropdownMenuItem>
                                                </Link>
                                                <DropdownMenuItem
                                                    className="text-red-600 cursor-pointer"
                                                    onSelect={() => setDeletingId(product.id)}
                                                >
                                                    Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o produto do estoque.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value)
}

function translatedType(type: string) {
    const map: Record<string, string> = {
        'module': 'Módulo',
        'inverter': 'Inversor',
        'structure': 'Estrutura',
        'cable': 'Cabo',
        'transformer': 'Transformador',
        'other': 'Outro'
    }
    return map[type] || type
}
