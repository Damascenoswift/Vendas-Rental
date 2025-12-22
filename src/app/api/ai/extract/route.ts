import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const apiKey = process.env.GOOGLE_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: "GOOGLE_API_KEY not configured" },
                { status: 500 }
            )
        }

        const formData = await request.formData()
        const file = formData.get("file") as File

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            )
        }

        // Convert file to base64
        const arrayBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(arrayBuffer).toString("base64")
        const mimeType = file.type

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

        const prompt = `
        Analyze this document (CNH, RG, or Utility Bill) and extract the following information into a strict JSON format.
        If a field is not found, return null or empty string. Do not invent data.

        Fields to extract:
        - nome (Full Name)
        - cpf (formatted 000.000.000-00)
        - rg (RG number)
        - endereco (Street name and number)
        - cidade (City)
        - uf (State 2 letter code)
        - cep (Zip code)
        - consumo (Energy consumption in kWh, just the number)
        - valor (Bill value, just the number e.g. 150.50)
        - data_vencimento (Due date YYYY-MM-DD)
        - codigo_conta_energia (Account number/Unique ID)

        Return ONLY the JSON.
        `

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType,
                },
            },
        ])

        const response = await result.response
        let text = response.text()

        // Cleanup markdown code blocks if present
        text = text.replace(/```json/g, "").replace(/```/g, "").trim()

        const data = JSON.parse(text)

        return NextResponse.json({ success: true, data })

    } catch (error: any) {
        console.error("AI Extraction Error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to process document" },
            { status: 500 }
        )
    }
}
