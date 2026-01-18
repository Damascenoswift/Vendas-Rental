"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import HTMLtoDOCX from "html-to-docx"
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function saveContractDraft(contractId: string, htmlContent: string) {
    const supabase = await createClient()

    // Validate permission
    // ...

    const { error } = await supabase
        .from('contracts')
        .update({ html_content: htmlContent, version: 2 }) // Increment version logic needed?
        .eq('id', contractId)

    if (error) {
        console.error("Erro ao salvar rascunho:", error)
        return { success: false, message: "Erro ao salvar." }
    }

    revalidatePath(`/admin/contratos/${contractId}/editor`)
    return { success: true }
}

export async function approveContract(contractId: string, htmlContent: string) {
    const supabase = await createClient()
    const supabaseAdmin = createSupabaseServiceClient() // Need admin for storage upload sometimes? Or just authorized user.

    // 1. Convert HTML to DOCX Buffer
    let docxBuffer: Buffer
    try {
        // html-to-docx expects string, null, options, header/footer
        // It wraps content in a basic doc structure.
        docxBuffer = await HTMLtoDOCX(htmlContent, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        })
    } catch (e: any) {
        console.error("HTML to DOCX error:", e)
        return { success: false, message: "Erro na conversão do documento." }
    }

    // 2. Upload to Storage
    const fileName = `contracts/${contractId}_final.docx`
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('documents') // ensure this bucket exists!
        .upload(fileName, docxBuffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true
        })

    if (uploadError) {
        console.error("Storage upload error:", uploadError)
        return { success: false, message: "Erro ao salvar arquivo final." }
    }

    // 3. Get Public URL (or signed)
    const { data: { publicUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(fileName)

    // 4. Update Database
    const { error: dbError } = await supabase
        .from('contracts')
        .update({
            html_content: htmlContent,
            status: 'APPROVED',
            docx_url: publicUrl,
            approved_by: (await supabase.auth.getUser()).data.user?.id,
            expires_at: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString() // + 120 days
        })
        .eq('id', contractId)

    if (dbError) {
        console.error("DB Update error:", dbError)
        return { success: false, message: "Erro ao finalizar contrato no banco." }
    }

    revalidatePath(`/admin/contratos`)
    return { success: true }
}
