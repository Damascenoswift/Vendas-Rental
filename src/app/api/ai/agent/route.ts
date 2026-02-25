import { NextResponse } from "next/server"
import OpenAI from "openai"
import { tools, runTool } from "@/lib/ai/agent-tools"
import { createClient } from "@/lib/supabase/server"
import { getProfile, type UserRole } from "@/lib/auth"
import { hasSalesAccess } from "@/lib/sales-access"

// System prompt defining the AI's persona
const SYSTEM_PROMPT = `
Você é o "Jarvis", a inteligência central da Rental Solar.
Sua missão é ajudar os funcionários com dúvidas sobre o sistema, processos e dados.

Diretrizes de Personalidade:
- Profissional, educado e eficiente.
- Use emojis moderadamente.
- Use as ferramentas disponíveis APENAS quando necessário.
- Para dúvidas de uso do sistema, processos e contratos, use preferencialmente a ferramenta 'search_knowledge_base'.
- Se o usuário perguntar "Quem é o cliente X?", use a ferramenta 'check_client_status'.
- Se o usuário perguntar "Como estão as vendas?", use 'get_daily_sales'.
- Nunca invente cláusulas/regras que não vieram das ferramentas.
- Sempre dê a resposta final em português, analisando o retorno da ferramenta e citando as fontes quando existirem.
`

type ChatHistoryMessage = {
    role?: "user" | "assistant" | "system"
    content?: string
}

type OpenAiFunctionCall = {
    type: "function_call"
    name: string
    arguments?: string
    call_id: string
}

function normalizeSchema(schema: unknown): unknown {
    if (Array.isArray(schema)) {
        return schema.map((item) => normalizeSchema(item))
    }

    if (schema && typeof schema === "object") {
        const normalized: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(schema)) {
            if (key === "type" && typeof value === "string") {
                normalized[key] = value.toLowerCase()
                continue
            }
            normalized[key] = normalizeSchema(value)
        }
        return normalized
    }

    return schema
}

function extractOutputText(response: any): string {
    if (typeof response?.output_text === "string" && response.output_text.trim().length > 0) {
        return response.output_text.trim()
    }

    const outputItems = Array.isArray(response?.output) ? response.output : []
    const chunks: string[] = []
    for (const item of outputItems) {
        if (item?.type !== "message" || !Array.isArray(item.content)) continue
        for (const part of item.content) {
            if (part?.type === "output_text" && typeof part.text === "string") {
                chunks.push(part.text)
            }
        }
    }

    return chunks.join("\n").trim()
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        const profile = await getProfile(supabase, user.id)
        const role = (profile?.role ?? user.user_metadata?.role) as UserRole | undefined
        const allowedBrands =
            Array.isArray(profile?.allowedBrands)
                ? profile.allowedBrands
                : Array.isArray(user.user_metadata?.allowed_brands)
                    ? (user.user_metadata?.allowed_brands as string[])
                    : []
        const profileSalesAccess =
            typeof profile?.salesAccess === "boolean"
                ? profile.salesAccess
                : typeof user.user_metadata?.sales_access === "boolean"
                    ? (user.user_metadata?.sales_access as boolean)
                    : null
        const canAccess = hasSalesAccess({ role, sales_access: profileSalesAccess })

        if (!canAccess) {
            return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        }

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            return NextResponse.json(
                { error: "OPENAI_API_KEY not configured" },
                { status: 500 }
            )
        }

        const body = await request.json()
        const message = typeof body?.message === "string" ? body.message.trim() : ""
        const history = Array.isArray(body?.history) ? (body.history as ChatHistoryMessage[]) : []

        if (!message) {
            return NextResponse.json(
                { error: "Message is required" },
                { status: 400 }
            )
        }

        const openai = new OpenAI({ apiKey })
        const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
        const recentHistory = history.slice(-10).filter((msg) => {
            return (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string"
        })

        const inputMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...recentHistory.map((msg) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content as string,
            })),
            { role: "user", content: message },
        ]

        const openAiTools = tools.map((tool) => ({
            type: "function" as const,
            name: tool.name,
            description: tool.description,
            parameters: normalizeSchema(tool.parameters),
        }))

        let response = await openai.responses.create({
            model,
            input: inputMessages as any,
            tools: openAiTools as any,
        })

        for (let step = 0; step < 4; step++) {
            const functionCalls = (Array.isArray(response.output) ? response.output : []).filter(
                (item): item is OpenAiFunctionCall => item?.type === "function_call"
            )

            if (functionCalls.length === 0) break

            const toolOutputs: Array<{
                type: "function_call_output"
                call_id: string
                output: string
            }> = []

            for (const functionCall of functionCalls) {
                let parsedArgs: Record<string, unknown> = {}
                if (functionCall.arguments) {
                    try {
                        parsedArgs = JSON.parse(functionCall.arguments)
                    } catch {
                        parsedArgs = {}
                    }
                }

                const toolResult = await runTool(functionCall.name, parsedArgs, {
                    userId: user.id,
                    role,
                    allowedBrands,
                })
                toolOutputs.push({
                    type: "function_call_output",
                    call_id: functionCall.call_id,
                    output: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
                })
            }

            response = await openai.responses.create({
                model,
                previous_response_id: response.id,
                input: toolOutputs,
            })
        }

        const finalResponseText =
            extractOutputText(response) ||
            "Não consegui gerar uma resposta agora. Tente reformular a pergunta."

        return NextResponse.json({ response: finalResponseText })

    } catch (error: any) {
        console.error("AI Agent Error:", error)
        return NextResponse.json(
            { error: error.message || "Failed to process message" },
            { status: 500 }
        )
    }
}
