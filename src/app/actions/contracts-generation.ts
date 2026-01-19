"use server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { generateContractHtml } from "@/lib/documents"
import HTMLtoDOCX from "html-to-docx" // Wait, I need DOCX->DOCX filler, not HTML->DOCX converter for this flow.
// The previous flow was DOCX -> HTML (Input) -> HTML (Edit) -> DOCX (Output).
// The user now wants: Template DOCX -> Filled DOCX directly. 
// "Usar Docxtemplater para preencher DOCX diretamente (sem editor HTML)."
// So I don't need HTMLtoDOCX. I just need Docxtemplater to output a buffer and upload it.
// I need to refactor `generateContractHtml` to just `generateContractDocx` or similar.

import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import * as fs from "fs"
import path from "path"
import { revalidatePath } from "next/cache"

// TYPES 
interface ContractValues {
    CM_total: number
    valor_locacao_total: number
    placas_total: number
    preco_kwh_final: number
}

// 1. Helper to load and fill template
async function fillDocxTemplate(templateName: string, data: any): Promise<Buffer> {
    const templatePath = path.join(process.cwd(), "public", "templates", `${templateName}.docx`)

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}. (Procurei em public/templates/)`)
    }

    const content = fs.readFileSync(templatePath, "binary")
    const zip = new PizZip(content)

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }
    })

    doc.render(data)

    const buf = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    })

    return buf
}

// 2. Main Action
export async function generateContractFromIndication(indicacaoId: string) {
    const supabase = await createClient()
    const supabaseAdmin = createSupabaseServiceClient() // For bypassing RLS on storage/insert if needed

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: "Não autorizado" }

    // A. Fetch Indication Data
    const { data: indicacao, error: indError } = await supabase
        .from('indicacoes')
        .select('*')
        .eq('id', indicacaoId)
        .single()

    if (indError || !indicacao) return { success: false, message: "Indicação não encontrada." }

    // B. Fetch Metadata (JSON) from Storage
    // Path format: "{userId}/{indicacaoId}/metadata.json"
    // We need the owner ID. The indicacao has `user_id`.
    const ownerId = indicacao.user_id
    const metadataPath = `${ownerId}/${indicacaoId}/metadata.json`

    const { data: jsonBlob, error: storageError } = await supabaseAdmin.storage
        .from('indicacoes')
        .download(metadataPath)

    let metadata: any = {}
    if (jsonBlob) {
        const text = await jsonBlob.text()
        metadata = JSON.parse(text)
    } else {
        console.warn("Metadata not found, using generic data from columns")
    }

    // C. Extract Calculation Parameters
    // Fallbacks: Price 0.95, Discount 20%
    const priceKwh = Number(metadata.precoKwh) || 0.95
    const discountPercent = Number(metadata.desconto) || 20 // integer 20
    const discountFactor = discountPercent / 100

    // Consumption Logic
    // "CM_unidade = soma(consumos_kwh_disponiveis) / qtd_meses"
    // metadata.consumos might be an array if added. Or we use consumoMedioPF/consumoMedioKwh as a single calculated value if list is missing.
    // If list exists:
    let cmTotal = 0
    if (metadata.consumos && Array.isArray(metadata.consumos) && metadata.consumos.length > 0) {
        const valid = metadata.consumos.filter((n: any) => Number(n) > 0).map(Number)
        if (valid.length > 0) {
            const avg = valid.reduce((a: number, b: number) => a + b, 0) / valid.length
            cmTotal = avg
        } else {
            cmTotal = Number(metadata.consumoMedioPF || metadata.consumoMedioKwh || 0)
        }
    } else {
        // Fallback to single average field
        cmTotal = Number(metadata.consumoMedioPF || metadata.consumoMedioKwh || 0)
    }

    // "CM_total = soma(CM_unidade de todas as unidades)" 
    // If we support multiple units here in the future, we sum them. Current form is mostly single unit logic unless 'units' array exists.
    // Assuming single unit for simplicity of this indication form.

    // D. Run Formulas
    // preco_kwh_desc = preco_kwh * (1 - desconto)
    const priceKwhDesc = priceKwh * (1 - discountFactor)

    // valor_locacao_total = CM_total * preco_kwh_desc (truncar)
    const valorLocacaoTotal = Math.floor(cmTotal * priceKwhDesc)

    // placas_total = CM_total / 66 (truncar)
    const placasTotal = Math.floor(cmTotal / 66)

    // E. Select Template
    const brand = (indicacao.marca || 'rental').toLowerCase()
    const type = (indicacao.tipo || 'PF').toUpperCase() // PF or PJ
    const templateName = `${brand}_${type.toLowerCase()}` // e.g. rental_pf

    // F. Prepare Data for Template
    // Mapping rules:
    // 1. Existing lowercase keys (for compatibility with other templates)
    // 2. Uppercase keys (as seen in User's template image: {{NOME}}, {{CPF}}, {{RG}}, etc.)
    const templateData = {
        // --- Lowercase (standard) ---
        cliente_nome: indicacao.nome,
        cliente_doc: indicacao.documento,
        cliente_endereco: metadata.endereco || "",
        cliente_cidade: metadata.cidade || "",
        cliente_estado: metadata.estado || "",
        cliente_cep: metadata.cep || "",

        // --- Uppercase (from User Image) ---
        NOME: indicacao.nome,
        CPF: indicacao.documento, // Assuming document is CPF for PF
        CNPJ: indicacao.documento, // Provided for PJ templates just in case
        RG: metadata.rg || "", // RG might not be in base table, check metadata
        LOGRADOURO: metadata.logradouro || metadata.endereco || "", // Try specific then generic
        "NÚMERO ENDEREÇO": metadata.numero || "",
        "NÚMERO": metadata.numero || "", // Variation
        BAIRRO: metadata.bairro || "",
        CIDADE: metadata.cidade || indicacao.cidade || "",
        Estado: metadata.estado || indicacao.estado || "", // Note: Image had "Estado" (Title Case)
        ESTADO: metadata.estado || indicacao.estado || "", // Provide UPPER too
        CEP: metadata.cep || "",
        "E-mail do Signatário": indicacao.email,
        EMAIL: indicacao.email,
        TELEFONE: indicacao.telefone,

        // --- Calculated Values (Uppercased for consistency) ---
        // Image didn't show these, but good to have
        CM_TOTAL: cmTotal.toFixed(0),
        PRECO_KWH: priceKwh.toFixed(2),
        DESCONTO_PERCENT: discountPercent,
        VALOR_LOCACAO_TOTAL: valorLocacaoTotal.toLocaleString('pt-BR'),
        PLACAS_TOTAL: placasTotal,

        // --- Original Calculated ---
        CM_total: cmTotal.toFixed(0),
        preco_kwh: priceKwh.toFixed(2),
        desconto_percent: discountPercent,
        valor_locacao_total: valorLocacaoTotal.toLocaleString('pt-BR'),
        placas_total: placasTotal,

        // Dates
        data_hoje: new Date().toLocaleDateString('pt-BR'),
        DATA_HOJE: new Date().toLocaleDateString('pt-BR'),
        ANO_ATUAL: new Date().getFullYear(),
    }

    // G. Generate DOCX
    let docBuffer: Buffer
    try {
        docBuffer = await fillDocxTemplate(templateName, templateData)
    } catch (e: any) {
        console.error("Template Error:", e)
        return { success: false, message: `Erro no template: ${e.message}` }
    }

    // H. Upload to Storage
    const fileName = `contracts/${indicacaoId}_${Date.now()}.docx`
    const { error: uploadError } = await supabaseAdmin.storage
        .from('documents') // ensure 'documents' bucket exists
        .upload(fileName, docBuffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true
        })

    if (uploadError) return { success: false, message: "Erro upload Storage" }

    const { data: { publicUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(fileName)

    // I. Save Record
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 120) // +120 days

    const { error: dbError } = await supabase.from('contracts').insert({
        indicacao_id: indicacaoId,
        type: `${brand.toUpperCase()}_${type}`,
        brand: brand.toUpperCase(),
        status: 'APPROVED', // Auto-approved in this flow? Or just generated? "System handles download".
        client_data: {
            name: indicacao.nome,
            doc: indicacao.documento
        },
        calculation_data: {
            cmTotal, valorLocacaoTotal, placasTotal, priceKwh, discountPercent
        },
        docx_url: publicUrl,
        created_by: user.id,
        expires_at: expiresAt.toISOString()
    })

    if (dbError) {
        console.error(dbError)
        return { success: false, message: "Erro ao salvar registro de contrato." }
    }

    revalidatePath(`/admin/indicacoes`)
    return { success: true, message: "Contrato gerado com sucesso!", url: publicUrl }
}
