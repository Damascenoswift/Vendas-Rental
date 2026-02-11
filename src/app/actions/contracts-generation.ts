"use server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { loadTemplateDocx } from "@/lib/template-loader"
import { numberToWordsPtBr } from "@/lib/number-to-words-ptbr"

import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
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
    const content = await loadTemplateDocx(templateName)
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
    const enderecoLogradouro = metadata.logradouro || metadata.endereco || ""
    const numeroEndereco = metadata.numero || ""
    const bairro = metadata.bairro || ""
    const cidade = metadata.cidade || indicacao.cidade || ""
    const estado = metadata.estado || indicacao.estado || ""
    const cep = metadata.cep || ""
    const dataHoje = new Date().toLocaleDateString("pt-BR")
    const valorLocacaoFormatado = valorLocacaoTotal.toLocaleString("pt-BR")
    const valorLocacaoExtenso = numberToWordsPtBr(valorLocacaoTotal)
    const cmTotalFormatado = cmTotal.toFixed(0)
    const outrasUcs = Array.isArray(metadata.outrasUcs) ? metadata.outrasUcs : []

    const templateData = {
        // --- Lowercase (standard) ---
        cliente_nome: indicacao.nome,
        cliente_doc: indicacao.documento,
        cliente_endereco: enderecoLogradouro,
        cliente_cidade: cidade,
        cliente_estado: estado,
        cliente_cep: cep,

        // --- Uppercase (from User Image) ---
        NOME: indicacao.nome,
        CPF: indicacao.documento, // Assuming document is CPF for PF
        CNPJ: indicacao.documento, // Provided for PJ templates just in case
        RG: metadata.rg || "", // RG might not be in base table, check metadata
        LOGRADOURO: enderecoLogradouro, // Try specific then generic
        Logradouro: enderecoLogradouro,
        "NÚMERO ENDEREÇO": numeroEndereco,
        "Número Endereço": numeroEndereco,
        "NÚMERO": metadata.numero || "", // Variation
        BAIRRO: bairro,
        Bairro: bairro,
        Cep: cep,
        CIDADE: cidade,
        Cidade: cidade,
        Estado: estado, // Note: Image had "Estado" (Title Case)
        ESTADO: estado, // Provide UPPER too
        CEP: cep,
        "E-mail do Signatário": indicacao.email,
        "e-mail do Signatário": indicacao.email,
        EMAIL: indicacao.email,
        TELEFONE: indicacao.telefone,
        telefone: indicacao.telefone,

        // --- Calculated Values (Uppercased for consistency) ---
        // Image didn't show these, but good to have
        CM_TOTAL: cmTotalFormatado,
        PRECO_KWH: priceKwh.toFixed(2),
        DESCONTO_PERCENT: discountPercent,
        VALOR_LOCACAO_TOTAL: valorLocacaoFormatado,
        PLACAS_TOTAL: placasTotal,

        // --- Original Calculated ---
        CM_total: cmTotalFormatado,
        preco_kwh: priceKwh.toFixed(2),
        desconto_percent: discountPercent,
        valor_locacao_total: valorLocacaoFormatado,
        placas_total: placasTotal,

        // Dates
        data_hoje: dataHoje,
        DATA_HOJE: dataHoje,
        ANO_ATUAL: new Date().getFullYear(),

        // --- Rental PF Template Fields ---
        "CONSUMO MEDIO": cmTotalFormatado,
        "Consumo Médio": cmTotalFormatado,
        "QTD MODULOS": placasTotal,
        "VALOR LOCAÇÃO": valorLocacaoFormatado,
        "VALOR LOCAÇÃO EXTENSO": valorLocacaoExtenso,
        "PRAZO DE CONTRATO": metadata.prazoContrato || "",
        "Aviso Prévio": metadata.avisoPrevio || "",
        "CODIGO INSTALAÇAO": metadata.codigoInstalacao || indicacao.codigo_instalacao || "",
        "LOCALIZAÇÃO UC": metadata.localizacaoUC || indicacao.unidade_consumidora || "",
        Data: dataHoje,

        // --- Extra UCs (2..10) ---
        CODINST2: outrasUcs[0]?.codigoInstalacao || "",
        CODINST3: outrasUcs[1]?.codigoInstalacao || "",
        CODINST4: outrasUcs[2]?.codigoInstalacao || "",
        CODINST5: outrasUcs[3]?.codigoInstalacao || "",
        CODINST6: outrasUcs[4]?.codigoInstalacao || "",
        CODINST7: outrasUcs[5]?.codigoInstalacao || "",
        CODINST8: outrasUcs[6]?.codigoInstalacao || "",
        CODINST9: outrasUcs[7]?.codigoInstalacao || "",
        CODINST10: outrasUcs[8]?.codigoInstalacao || "",
        LOCALUC2: outrasUcs[0]?.localizacaoUC || "",
        LOCALUC3: outrasUcs[1]?.localizacaoUC || "",
        LOCALUC4: outrasUcs[2]?.localizacaoUC || "",
        LOCALUC5: outrasUcs[3]?.localizacaoUC || "",
        LOCALUC6: outrasUcs[4]?.localizacaoUC || "",
        LOCALUC7: outrasUcs[5]?.localizacaoUC || "",
        LOCALUC8: outrasUcs[6]?.localizacaoUC || "",
        LOCALUC9: outrasUcs[7]?.localizacaoUC || "",
        LOCALUC10: outrasUcs[8]?.localizacaoUC || "",
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

    if (uploadError) {
        console.error("Upload Storage Error:", uploadError)
        return {
            success: false,
            message: `Erro upload Storage: ${uploadError.message ?? "desconhecido"}`,
        }
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(fileName)

    // I. Save Record
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 120) // +120 days

    const { error: dbError } = await supabaseAdmin.from('contracts').insert({
        indicacao_id: indicacaoId,
        type: `${brand.toUpperCase()}_${type}`,
        brand: brand.toUpperCase(),
        status: 'APPROVED',
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
        return {
            success: false,
            message: `Erro ao salvar registro de contrato: ${dbError.message ?? "desconhecido"}`,
        }
    }

    revalidatePath(`/admin/indicacoes`)
    return { success: true, message: "Contrato gerado com sucesso!", url: publicUrl }
}
