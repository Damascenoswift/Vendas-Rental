"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { Database } from "@/types/database"

export type Product = Database['public']['Tables']['products']['Row']
export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type ProductUpdate = Database['public']['Tables']['products']['Update']
export type ProductType = Database['public']['Enums']['product_type_enum']

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
        throw new Error('Failed to create product')
    }

    revalidatePath('/admin/estoque')
    return data as Product
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
        throw new Error('Failed to update product')
    }

    revalidatePath('/admin/estoque')
    return data as Product
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
        throw new Error('Failed to delete product')
    }

    revalidatePath('/admin/estoque')
}
