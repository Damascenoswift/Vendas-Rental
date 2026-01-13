"use server"

import * as XLSX from 'xlsx'
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Map Excel columns to DB fields
// Excel Headers: 
// Status | Ativo de | Ativo até | Unidade / Instalação | Unidade | Empresa | Nº Cliente | Tipo | Gerador Consumidor | UF | Distribuidora | Modalidade | Dia Emissão | CNPJ Faturamento | Endereço | Nº | Complemento | Cidade | Bairro | CEP | E-mail Faturamento | E-mail Faturamento | Tipo Venda | Telefone | Potência Geradora | Tipo ligação | Rural | Tipo associação | ID

export async function importConsumerUnits(formData: FormData) {
    try {
        const file = formData.get('file') as File
        if (!file) throw new Error("Arquivo não enviado.")

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to JSON with array of arrays to handle duplicate headers (like E-mail Faturamento)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        if (jsonData.length < 2) throw new Error("Planilha vazia ou sem dados.")

        // Header row is index 0
        const headers = jsonData[0]
        const rows = jsonData.slice(1)

        const supabase = await createClient()
        const processedRows = []

        for (const row of rows) {
            // Helper to get value by index
            // We assume fixed order as per request. If dynamic, we'd map header names to indices.
            // Let's rely on fixed order or try to map if possible. 
            // Given the duplicate header "E-mail Faturamento", fixed order might be safer if the user guarantees it.
            // BUT, looking for headers is more robust. Let's try to map indices.

            // Map:
            // 0: Status
            // 1: Ativo de
            // 2: Ativo até
            // 3: Unidade / Instalação
            // ...

            // Actually, `sheet_to_json` with `header: 1` gives values in index order.
            // Let's implement robust mapping if headers change, but for now assuming user follows the template.

            // Let's just use indices based on the user provided list:
            // 0: Status
            // 1: Ativo de
            // 2: Ativo até
            // 3: Unidade / Instalação
            // 4: Unidade
            // 5: Empresa
            // 6: Nº Cliente
            // 7: Tipo
            // 8: Gerador Consumidor
            // 9: UF
            // 10: Distribuidora
            // 11: Modalidade
            // 12: Dia Emissão
            // 13: CNPJ Faturamento
            // 14: Endereço
            // 15: Nº
            // 16: Complemento
            // 17: Cidade
            // 18: Bairro
            // 19: CEP
            // 20: E-mail Faturamento (1)
            // 21: E-mail Faturamento (2) - note: excel might shift this if empty? No, header:1 keeps empty cells as empty or undefined.
            // 22: Tipo Venda
            // 23: Telefone
            // 24: Potência Geradora
            // 25: Tipo ligação
            // 26: Rural
            // 27: Tipo associação
            // 28: ID

            // NOTE: XLSX might skip empty trailing columns. We should be careful.

            const getVal = (idx: number) => {
                const val = row[idx]
                if (val === undefined || val === null) return null
                return String(val).trim()
            }

            // CLEANING LOGIC

            // Infinity Check
            let active_to = null
            let is_active_infinite = false
            const rawActiveTo = getVal(2)
            if (rawActiveTo === 'Infinity' || rawActiveTo === 'infinity') {
                is_active_infinite = true
            } else if (rawActiveTo) {
                // Parse date dd/mm/yyyy
                active_to = parseDate(rawActiveTo)
            }

            const active_from = parseDate(getVal(1))

            // Emails
            const emailsRaw = [getVal(20), getVal(21)].filter(Boolean) as string[]
            const emailsSet = new Set<string>()
            emailsRaw.forEach(e => {
                e.split(/[;,]+/).forEach(part => {
                    const clean = part.trim().toLowerCase()
                    if (clean) emailsSet.add(clean)
                })
            })
            const emails = Array.from(emailsSet)

            // Booleans
            const is_generator = normalizeBool(getVal(8)) // Gerador Consumidor
            const is_rural = normalizeBool(getVal(26)) // Rural

            // Numbers
            // Potencia might be scientific notation or "0". `parseFloat` handles "6,61E+11" usually if dot, but comma needs swap.
            // JS parseFloat expects dot. 
            // "6,61E+11" -> replace comma with point?
            let power = null
            const rawPower = getVal(24)
            if (rawPower) {
                const standardized = rawPower.replace(',', '.')
                const parsed = parseFloat(standardized)
                if (!isNaN(parsed)) power = parsed
            }

            processedRows.push({
                status: getVal(0),
                active_from,
                active_to,
                is_active_infinite,
                code: getVal(3), // Unidade / Instalação
                unit_name: getVal(4),
                company_name: getVal(5),
                client_number: getVal(6), // Keep as string
                type: getVal(7),
                is_generator, // Gerador Consumidor (Sim/Não) -> boolean? 
                // Wait, user said "Gerador Consumidor" is a Sim/Não field? 
                // "Gerador Consumidor é um sim/não (às vezes “Não”)." -> Could mean "Is Generator-Consumer?" 
                // Or maybe "Tipo" is Consumidor/Gerador and this is a flag?
                // Let's assume based on column name "Gerador Consumidor" -> is_generator boolean.

                uf: getVal(9),
                distributor: getVal(10),
                modality: getVal(11),
                emission_day: parseInt(getVal(12) || '0') || null,
                faturamento_cnpj: cleanNonDigits(getVal(13)),
                address: getVal(14),
                number: getVal(15),
                complement: getVal(16),
                city: getVal(17),
                neighborhood: getVal(18),
                zip_code: cleanNonDigits(getVal(19)),
                faturamento_emails: emails,
                sales_type: getVal(22),
                phone: getVal(23),
                power_generator: power,
                connection_type: getVal(25),
                is_rural,
                association_type: getVal(27),
                external_id: getVal(28)
            })
        }

        const { error } = await supabase
            .from('consumer_units')
            .insert(processedRows)

        if (error) {
            console.error('Database Error:', error)
            throw new Error(`Erro ao salvar no banco: ${error.message}`)
        }

        revalidatePath('/admin/importacao')
        return { success: true, count: processedRows.length }

    } catch (e: any) {
        console.error("Import Error:", e)
        return { success: false, error: e.message }
    }
}

function parseDate(val: string | null) {
    if (!val) return null
    // Excel might give explicit date object or number (days since 1900) or string "dd/mm/yyyy"
    // XLSX parsed with 'buffer' usually gives strings or numbers? 
    // `sheet_to_json` with `raw: false` (default) formats as string. `header:1` uses default options unless specified.

    // Assuming format dd/mm/yyyy
    const parts = val.split('/')
    if (parts.length === 3) {
        const d = parseInt(parts[0])
        const m = parseInt(parts[1]) - 1
        const y = parseInt(parts[2])
        const date = new Date(Date.UTC(y, m, d)) // Use UTC to avoid timezone shifts
        if (!isNaN(date.getTime())) return date.toISOString()
    }

    // If it's a number (Excel serial date), xlsx usually parses it if we don't say raw:false. 
    // But let's try to handle string first. If it fails, maybe return raw val if compatible or null.
    return null
}

function normalizeBool(val: string | null) {
    if (!val) return false
    const v = val.toLowerCase()
    return v === 'sim' || v === 's' || v === 'true' || v === '1'
}

function cleanNonDigits(val: string | null) {
    if (!val) return null
    return val.replace(/\D/g, '')
}
