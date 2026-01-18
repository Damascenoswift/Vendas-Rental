"use server"

import { createClient } from "@/lib/supabase/server"
import { ContractType, Brand } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { generateContractHtml } from "@/lib/documents"
import { z } from "zod"

// -- TYPES --
export interface UnitData {
    unit_name: string
    consumptions_kwh: number[] // array of valid monthly consumptions
    // calculated
    consumption_avg_unit: number
}

export interface ContractCalculationData {
    units: UnitData[]
    consumption_avg_total: number
    price_kwh: number
    discount_percent: number // e.g., 0.20 for 20%
    price_kwh_final: number
    valor_locacao_total: number
    placas_total: number
}

// -- SCHEMAS --
const contractFormSchema = z.object({
    type: z.enum(['RENTAL_PF', 'RENTAL_PJ', 'DORATA_PF', 'DORATA_PJ']),
    brand: z.enum(['RENTAL', 'DORATA']),
    clientName: z.string().min(1),
    clientDoc: z.string().min(1), // CPF/CNPJ
    clientContact: z.string().optional(),
    clientAddress: z.string().optional(),
    priceKwh: z.number().positive(),
    discountPercent: z.number().min(0).max(1), // 0 to 1
    units: z.array(z.object({
        name: z.string(),
        consumptions: z.array(z.number())
    })).min(1)
})

export type CreateContractState = {
    success: boolean
    message: string
    errors?: any
    contractId?: string
}

// -- CALCULATION LOGIC --
export async function calculateContractValues(data: {
    units: { name: string, consumptions: number[] }[],
    priceKwh: number,
    discountPercent: number
}): Promise<ContractCalculationData> {

    const unitsCalculated: UnitData[] = data.units.map(u => {
        // CM_unidade = soma(consumos) / qtd_meses
        // Filter out 0 or negatives just in case, though requirements say "meses completos disponiveis"
        const validConsumptions = u.consumptions.filter(c => c > 0)
        const total = validConsumptions.reduce((acc, curr) => acc + curr, 0)
        const count = validConsumptions.length || 1 // avoid div/0
        const avg = total / count

        return {
            unit_name: u.name,
            consumptions_kwh: u.consumptions,
            consumption_avg_unit: avg
        }
    })

    // CM_total = soma(CM_unidade de todas as unidades)
    const consumption_avg_total = unitsCalculated.reduce((acc, curr) => acc + curr.consumption_avg_unit, 0)

    // Preço com desconto: preco_kwh_desc = preco_kwh * (1 - desconto)
    const price_kwh_final = data.priceKwh * (1 - data.discountPercent)

    // Valor locação total: valor_locacao_total = CM_total * preco_kwh_desc
    // Truncar (ex.: 455,58 -> 455). Math.floor ensures truncation.
    const valor_locacao_total = Math.floor(consumption_avg_total * price_kwh_final)

    // Placas total: placas_total = CM_total / 120 / 0,55 (equivale a CM_total / 66)
    // Truncar (ex.: 22,84 -> 22)
    const placas_total = Math.floor(consumption_avg_total / 66)

    return {
        units: unitsCalculated,
        consumption_avg_total,
        price_kwh: data.priceKwh,
        discount_percent: data.discountPercent,
        price_kwh_final,
        valor_locacao_total,
        placas_total
    }
}

// -- SERVER ACTION --
export async function createContract(prevState: CreateContractState, formData: FormData): Promise<CreateContractState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, message: "Não autorizado" }

    // Parse Form Data
    const rawUnits = formData.get("units_json")?.toString()
    if (!rawUnits) return { success: false, message: "Erro: Unidades não fornecidas." }

    const unitsParsed = JSON.parse(rawUnits)

    const rawData = {
        type: formData.get("type"),
        brand: formData.get("brand"),
        clientName: formData.get("clientName"),
        clientDoc: formData.get("clientDoc"),
        clientContact: formData.get("clientContact"),
        clientAddress: formData.get("clientAddress"),
        priceKwh: Number(formData.get("priceKwh")),
        discountPercent: Number(formData.get("discountPercent")) / 100, // Form sends 20 for 20%
        units: unitsParsed
    }

    const validated = contractFormSchema.safeParse(rawData)

    if (!validated.success) {
        return {
            success: false,
            message: "Dados inválidos",
            errors: validated.error.flatten().fieldErrors
        }
    }

    const { type, brand, clientName, clientDoc, clientAddress, clientContact, priceKwh, discountPercent, units } = validated.data

    // 1. Calculate Values
    const calculationData = await calculateContractValues({ units, priceKwh, discountPercent })

    // 2. Generate Draft HTML
    // Map data to match template placeholders
    const templateData = {
        cliente_nome: clientName,
        cliente_doc: clientDoc,
        cliente_endereco: clientAddress || "",
        CM_total: calculationData.consumption_avg_total.toFixed(0),
        valor_locacao_total: calculationData.valor_locacao_total.toLocaleString('pt-BR'),
        placas_total: calculationData.placas_total,
        data_hoje: new Date().toLocaleDateString('pt-BR'),
        // Add more fields as needed based on the actual DOCX template
        unidades: units.map(u => ({ nome: u.name, media: u.consumptions.reduce((a, b) => a + b, 0) / u.consumptions.length })),
    }

    // Choose template file based on type
    // type is RENTAL_PF, RENTAL_PJ... we assume file is rental_pf.docx
    const templateName = type.toLowerCase()

    let draftHtml = ""
    try {
        draftHtml = await generateContractHtml(templateName, templateData)
    } catch (error: any) {
        console.error("Error generating HTML:", error)
        // Fallback or Error?
        // If template is missing, we might want to fail or just show a warning.
        // For now, let's fail to alert the user they need the template.
        return { success: false, message: `Erro: ${error.message}` }
    }

    // 3. Save to DB
    const { data: contract, error } = await supabase
        .from('contracts')
        .insert({
            type,
            brand,
            status: 'DRAFT',
            client_data: { name: clientName, doc: clientDoc, contact: clientContact, address: clientAddress },
            calculation_data: calculationData,
            html_content: draftHtml,
            created_by: user.id,
            version: 1
        })
        .select()
        .single()

    if (error) {
        console.error("Erro ao criar contrato:", error)
        return { success: false, message: "Erro ao salvar contrato." }
    }

    // 4. Save Units
    const unitsToInsert = calculationData.units.map(u => ({
        contract_id: contract.id,
        unit_name: u.unit_name,
        consumption_avg: u.consumption_avg_unit,
        consumptions: u.consumptions_kwh
    }))

    const { error: errorUnits } = await supabase.from('contract_units').insert(unitsToInsert)

    if (errorUnits) {
        console.error("Erro ao salvar unidades:", errorUnits)
        // Clean up contract?
    }

    revalidatePath("/admin/contratos")
    return { success: true, message: "Contrato criado com sucesso!", contractId: contract.id }
}
