import { GoogleGenerativeAI } from "@google/generative-ai"
import { NextResponse } from "next/server"
import { tools, runTool } from "@/lib/ai/agent-tools"
import { createClient } from "@/lib/supabase/server"
import { getProfile, hasFullAccess } from "@/lib/auth"

// System prompt defining the AI's persona
const SYSTEM_PROMPT = `
Você é o "Jarvis", a inteligência central da Rental Solar.
Sua missão é ajudar os funcionários com dúvidas sobre o sistema, processos e dados.

Diretrizes de Personalidade:
- Profissional, educado e eficiente.
- Use emojis moderadamente.
- VOCÊ AGORA TEM ACESSO AO BANCO DE DADOS (Fase 2).
- Use as ferramentas disponíveis APENAS quando necessário.
- Se o usuário perguntar "Quem é o cliente X?", use a ferramenta 'check_client_status'.
- Se o usuário perguntar "Como estão as vendas?", use 'get_daily_sales'.
- Sempre dê a resposta final em português, analisando o retorno da ferramenta.
`

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        const profile = await getProfile(supabase, user.id)
        const role = profile?.role ?? (user.user_metadata?.role as string | undefined)
        const ownerId = process.env.USER_MANAGEMENT_OWNER_ID
        const ownerEmail = process.env.USER_MANAGEMENT_OWNER_EMAIL?.toLowerCase()
        const userEmail = (user.email ?? profile?.email ?? "").toLowerCase()
        const isOwner =
            (ownerId && user.id === ownerId) ||
            (ownerEmail && userEmail === ownerEmail) ||
            (!ownerId && !ownerEmail && hasFullAccess(role))

        const requiresOwner = Boolean(ownerId || ownerEmail)
        const canAccess = hasFullAccess(role) && (!requiresOwner || isOwner)

        if (!canAccess) {
            return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        }

        const apiKey = process.env.GOOGLE_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: "GOOGLE_API_KEY not configured" },
                { status: 500 }
            )
        }

        const body = await request.json()
        const { message, history } = body

        if (!message) {
            return NextResponse.json(
                { error: "Message is required" },
                { status: 400 }
            )
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        // Pass tool definitions to the model
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            tools: [{ functionDeclarations: tools as any }]
        })

        // Convert history to Gemini format (limiting to last 10 for performance)
        const recentHistory = history.slice(-10).map((msg: any) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        }))

        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: `SYSTEM_INSTRUCTION: ${SYSTEM_PROMPT}` }]
                },
                {
                    role: "model",
                    parts: [{ text: "Entendido! Jarvis online com acesso ao banco de dados." }]
                },
                ...recentHistory
            ]
        })

        // 1. Send user message
        const result = await chat.sendMessage(message)
        const response = result.response

        // 2. Check for function calls
        const functionCalls = response.functionCalls()

        let finalResponseText = ""

        if (functionCalls && functionCalls.length > 0) {
            // 3. Execute tools if requested
            const functionCall = functionCalls[0]
            const { name, args } = functionCall

            // Execute the tool
            const toolResult = await runTool(name, args)

            // 4. Send tool result back to Gemini
            const resultPart = [
                {
                    functionResponse: {
                        name: name,
                        response: {
                            name: name,
                            content: toolResult
                        }
                    }
                }
            ]

            const secondResponse = await chat.sendMessage(resultPart)
            finalResponseText = secondResponse.response.text()
        } else {
            // No tool used, just text
            finalResponseText = response.text()
        }

        return NextResponse.json({ response: finalResponseText })

    } catch (error: any) {
        console.error("AI Agent Error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to process message" },
            { status: 500 }
        )
    }
}
