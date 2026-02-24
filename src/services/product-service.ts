"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { revalidatePath } from "next/cache"
import { Database } from "@/types/database"

export type Product = Database['public']['Tables']['products']['Row']
export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type ProductUpdate = Database['public']['Tables']['products']['Update']
export type ProductType = Database['public']['Enums']['product_type_enum']

export type StockMovement = Database['public']['Tables']['stock_movements']['Row']
export type StockMovementInsert = Database['public']['Tables']['stock_movements']['Insert']
export type StockMovementType = Database['public']['Enums']['stock_movement_type']

export type ProductWorkSale = {
    id: string
    product_id: string
    quantity: number
    sold_at: string
    proposal_id: string
    work_id: string
    work_title: string | null
    customer_name: string | null
    installation_code: string | null
}

export type ProductInventoryDynamicStat = {
    product_id: string
    manual_in: number
    manual_out: number
    manual_reserved: number
    manual_released: number
    sold_from_works: number
    last_sale_at: string | null
    last_sale_to: string | null
}

export type ProductRealtimeInfo = {
    id: string
    name: string
    manufacturer: string | null
    model: string | null
    power: number | null
    stock_total: number
    stock_reserved: number
    stock_available: number
}

type ProductActionResult = { data: Product | null; error?: string }

function buildEmptyDynamicStat(productId: string): ProductInventoryDynamicStat {
    return {
        product_id: productId,
        manual_in: 0,
        manual_out: 0,
        manual_reserved: 0,
        manual_released: 0,
        sold_from_works: 0,
        last_sale_at: null,
        last_sale_to: null,
    }
}

function resolveWorkCustomerName(work: {
    title?: string | null
    indicacao?: { nome?: string | null } | null
    contact?: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null
} | null) {
    if (!work) return null
    const contactFullName = work.contact?.full_name?.trim()
    if (contactFullName) return contactFullName

    const contactByParts = [work.contact?.first_name, work.contact?.last_name]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .trim()
    if (contactByParts) return contactByParts

    const indicacaoName = work.indicacao?.nome?.trim()
    if (indicacaoName) return indicacaoName

    const workTitle = work.title?.trim()
    if (workTitle) return workTitle

    return null
}

async function getWorkSalesFromObras(productFilter?: Set<string>) {
    const supabaseAdmin = createSupabaseServiceClient()
    const { data, error } = await supabaseAdmin
        .from("obra_card_proposals" as any)
        .select(`
            proposal_id,
            linked_at,
            obra:obra_cards(
                id,
                title,
                codigo_instalacao,
                installation_key,
                indicacao:indicacoes(nome),
                contact:contacts(full_name, first_name, last_name)
            ),
            proposal:proposals(
                id,
                proposal_items(product_id, quantity)
            )
        `)
        .eq("is_primary", true)
        .order("linked_at", { ascending: false })

    if (error) {
        console.error("Erro ao buscar vendas vinculadas a Obras:", error)
        return [] as ProductWorkSale[]
    }

    const sales: ProductWorkSale[] = []

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const proposalId = typeof row.proposal_id === "string" ? row.proposal_id : null
        const soldAt = typeof row.linked_at === "string" ? row.linked_at : new Date().toISOString()
        const work = (row.obra && typeof row.obra === "object") ? (row.obra as Record<string, unknown>) : null
        const proposal = (row.proposal && typeof row.proposal === "object") ? (row.proposal as Record<string, unknown>) : null
        const items = Array.isArray(proposal?.proposal_items) ? proposal?.proposal_items : []
        const workId = typeof work?.id === "string" ? work.id : null

        if (!proposalId || !workId) continue

        const customerName = resolveWorkCustomerName({
            title: typeof work?.title === "string" ? work.title : null,
            indicacao: work?.indicacao && typeof work.indicacao === "object"
                ? { nome: typeof (work.indicacao as Record<string, unknown>).nome === "string" ? (work.indicacao as Record<string, unknown>).nome : null }
                : null,
            contact: work?.contact && typeof work.contact === "object"
                ? {
                    full_name: typeof (work.contact as Record<string, unknown>).full_name === "string"
                        ? (work.contact as Record<string, unknown>).full_name
                        : null,
                    first_name: typeof (work.contact as Record<string, unknown>).first_name === "string"
                        ? (work.contact as Record<string, unknown>).first_name
                        : null,
                    last_name: typeof (work.contact as Record<string, unknown>).last_name === "string"
                        ? (work.contact as Record<string, unknown>).last_name
                        : null,
                }
                : null,
        })

        const workTitle = typeof work?.title === "string" ? work.title : null
        const installationCode = typeof work?.codigo_instalacao === "string"
            ? work.codigo_instalacao
            : typeof work?.installation_key === "string"
                ? work.installation_key
                : null

        for (let index = 0; index < items.length; index += 1) {
            const item = items[index]
            if (!item || typeof item !== "object") continue
            const productId = typeof (item as Record<string, unknown>).product_id === "string"
                ? (item as Record<string, unknown>).product_id
                : null
            if (!productId) continue
            if (productFilter && !productFilter.has(productId)) continue

            const quantityRaw = Number((item as Record<string, unknown>).quantity)
            const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 0
            if (quantity <= 0) continue

            sales.push({
                id: `${workId}:${proposalId}:${productId}:${index}`,
                product_id: productId,
                quantity,
                sold_at: soldAt,
                proposal_id: proposalId,
                work_id: workId,
                work_title: workTitle,
                customer_name: customerName,
                installation_code: installationCode,
            })
        }
    }

    return sales
}

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

export async function getProductRealtimeInfo(id: string): Promise<ProductRealtimeInfo | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('products')
        .select('id, name, manufacturer, model, power, stock_total, stock_reserved')
        .eq('id', id)
        .maybeSingle()

    if (error || !data) {
        if (error) {
            console.error('Error fetching product realtime info:', error)
        }
        return null
    }

    const stockTotal = Number(data.stock_total || 0)
    const stockReserved = Number(data.stock_reserved || 0)

    return {
        id: data.id,
        name: data.name,
        manufacturer: data.manufacturer,
        model: data.model,
        power: data.power,
        stock_total: stockTotal,
        stock_reserved: stockReserved,
        stock_available: stockTotal - stockReserved,
    }
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

export async function getWorkSalesForProduct(productId: string) {
    const filteredSales = await getWorkSalesFromObras(new Set([productId]))
    return filteredSales.sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime())
}

export async function getInventoryDynamicStats(productIds?: string[]) {
    const normalizedIds = Array.isArray(productIds)
        ? productIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id))
        : []

    const filterSet = normalizedIds.length > 0 ? new Set(normalizedIds) : null
    const supabaseAdmin = createSupabaseServiceClient()

    let stockMovementsQuery = supabaseAdmin
        .from("stock_movements")
        .select("product_id, type, quantity")

    if (normalizedIds.length > 0) {
        stockMovementsQuery = stockMovementsQuery.in("product_id", normalizedIds)
    }

    const [{ data: movementRows, error: movementError }, workSales] = await Promise.all([
        stockMovementsQuery,
        getWorkSalesFromObras(filterSet ?? undefined),
    ])

    if (movementError) {
        console.error("Erro ao buscar movimentações para relatório dinâmico de estoque:", movementError)
    }

    const statsByProduct = new Map<string, ProductInventoryDynamicStat>()
    const ensureStat = (productId: string) => {
        const current = statsByProduct.get(productId)
        if (current) return current
        const next = buildEmptyDynamicStat(productId)
        statsByProduct.set(productId, next)
        return next
    }

    for (const row of (movementRows ?? []) as Array<{ product_id: string | null; type: StockMovementType; quantity: number }>) {
        const productId = row.product_id
        if (!productId) continue
        if (filterSet && !filterSet.has(productId)) continue
        const stat = ensureStat(productId)
        const quantity = Number(row.quantity || 0)
        if (!Number.isFinite(quantity) || quantity <= 0) continue

        if (row.type === "IN") stat.manual_in += quantity
        if (row.type === "OUT") stat.manual_out += quantity
        if (row.type === "RESERVE") stat.manual_reserved += quantity
        if (row.type === "RELEASE") stat.manual_released += quantity
    }

    for (const sale of workSales) {
        const stat = ensureStat(sale.product_id)
        stat.sold_from_works += sale.quantity

        const currentDate = stat.last_sale_at ? new Date(stat.last_sale_at).getTime() : 0
        const saleDate = sale.sold_at ? new Date(sale.sold_at).getTime() : 0
        if (saleDate >= currentDate) {
            stat.last_sale_at = sale.sold_at
            stat.last_sale_to = sale.customer_name ?? stat.last_sale_to
        }
    }

    return Array.from(statsByProduct.values())
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
    revalidatePath('/admin/estoque')
    return movementData
}
