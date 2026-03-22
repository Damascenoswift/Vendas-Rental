import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import mammoth from "mammoth"
import { loadTemplateDocx } from "./template-loader"

// This function will be called from the Server Action
export async function generateContractHtml(
    templateName: string, // 'rental_pf', 'rental_pj', etc.
    data: Record<string, unknown>, // The data to fill placeholders
): Promise<string> {

    // 1. Load the template (local first, then HTTP fallback)
    const content = await loadTemplateDocx(templateName)
    const zip = new PizZip(content)

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    })

    // 2. Render the document (Fill placeholders)
    try {
        doc.render(data)
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
        console.error("Docxtemplater Error:", error)
        throw new Error("Erro ao gerar documento: " + errorMessage)
    }

    const buf = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    })

    // 3. Convert Filled DOCX to HTML for the Editor
    // Mammoth handles this well
    const result = await mammoth.convertToHtml({ buffer: buf })

    if (result.messages && result.messages.length > 0) {
        console.warn("Mammoth messages:", result.messages)
    }

    return result.value
}
