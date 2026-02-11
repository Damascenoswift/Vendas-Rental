"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Database } from "@/types/database"

export type Product = Database['public']['Tables']['products']['Row']
export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type ProductUpdate = Database['public']['Tables']['products']['Update']
export type ProductType = Database['public']['Enums']['product_type_enum']

export type StockMovement = Database['public']['Tables']['stock_movements']['Row']
export type StockMovementInsert = Database['public']['Tables']['stock_movements']['Insert']
export type StockMovementType = Database['public']['Enums']['stock_movement_type']

type ProductActionResult = { data: Product | null; error?: string }

export async function getProducts(filters?: { active?: boolean, type?: ProductType }) {
    const supabase = await createClient()

    let query = supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true })

    if (filters?.active !== undefined) {
        query = query.eq('active', filters.active)
    }

    if (filters?.type) {
        query = query.eq('type', filters.type)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching products:', error)
        throw new Error('Failed to fetch products')
    }

    return data as Product[]
}

export async function getProduct(id: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        console.error('Error fetching product:', error)
        return null
    }

    return data as Product
}

export async function createProduct(product: ProductInsert) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single()

    if (error) {
        console.error('Error creating product:', error)
        return { data: null, error: error.message || 'Erro ao criar produto.' } satisfies ProductActionResult
    }

    revalidatePath('/admin/estoque')
    return { data: data as Product } satisfies ProductActionResult
}

export async function updateProduct(id: string, updates: ProductUpdate) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating product:', error)
        return { data: null, error: error.message || 'Erro ao atualizar produto.' } satisfies ProductActionResult
    }

    revalidatePath('/admin/estoque')
    return { data: data as Product } satisfies ProductActionResult
}

export async function deleteProduct(id: string) {
    const supabase = await createClient()

    // Soft delete usually better, but for now we implement active toggle or hard delete
    // Let's implement hard delete for now as requested "Delete", but we might want to just set active=false

    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting product:', error)
        return { error: error.message || 'Erro ao excluir produto.' }
    }

    revalidatePath('/admin/estoque')
    return { error: undefined }
}

export async function getStockMovements(productId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching stock movements:', error)
        return []
    }

    return data as StockMovement[]
}

export async function createStockMovement(movement: StockMovementInsert) {
    const supabase = await createClient()

    // We should ideally use a transaction or RPC, but effectively we will update product stock here too.
    // Fetch current product to check stock? Supabase atomicity is better with RPC.
    // For MVP, we Insert Movement THEN Update Product.

    const { data: movementData, error: movementError } = await supabase
        .from('stock_movements')
        .insert(movement)
        .select()
        .single()

    if (movementError) {
        console.error('Error creating stock movement:', movementError)
        throw new Error('Failed to create stock movement')
    }

    // Update Product Stock
    // This is naive concurrency, but okay for MVP.
    const { data: product } = await supabase.from('products').select('stock_total, stock_reserved').eq('id', movement.product_id!).single()

    if (product) {
        const updates: Partial<Product> = {}
        const qty = movement.quantity

        if (movement.type === 'IN') {
            updates.stock_total = (product.stock_total || 0) + qty
        } else if (movement.type === 'OUT') {
            updates.stock_total = (product.stock_total || 0) - qty
        } else if (movement.type === 'RESERVE') {
            updates.stock_reserved = (product.stock_reserved || 0) + qty
        } else if (movement.type === 'RELEASE') {
            updates.stock_reserved = (product.stock_reserved || 0) - qty
        }

        if (Object.keys(updates).length > 0) {
            await supabase.from('products').update(updates).eq('id', movement.product_id!)
        }
    }

    revalidatePath(`/admin/estoque/${movement.product_id}`)
    return movementData
}
