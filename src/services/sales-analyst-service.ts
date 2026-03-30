// src/services/sales-analyst-service.ts
import OpenAI from "openai"
import type { Database } from "@/types/database"

export type NegotiationStatus =
  Database['public']['Enums']['negotiation_status_enum']

export type ConversationMessage = {
  role: "analyst" | "user"
  content: string
  status_suggestion?: NegotiationStatus | null
  created_at: string
}

export type ProposalContext = {
  proposalId: string
  clientName: string
  totalValue: number | null
  profitMargin: number | null
  totalPower: number | null
  daysSinceUpdate: number
  negotiationStatus: NegotiationStatus
  clientSignal: string | null
  objections: string | null
  followupDate: string | null
  conversationHistory: ConversationMessage[]
}

const SALES_ANALYST_SYSTEM_PROMPT = `
Você é o Analista de Vendas da Dorata Solar, um supervisor experiente e exigente.
Seu papel é questionar o vendedor sobre o andamento de cada negociação — não aceitar respostas vagas.

Foque sempre em um desses três eixos por vez:
1. Sinal do cliente: O que o cliente sinalizou? Está buscando preço ou qualidade?
2. Próximo passo: Há quanto tempo sem contato? Qual é o plano de ação?
3. Objeção ao fechamento: O que está travando? O que ainda não foi apresentado?

Regras de comportamento:
- Faça UMA pergunta direta por vez. Não faça múltiplas perguntas.
- Se a resposta for vaga ("tá bem", "vou ver"), pressione por especificidade.
- Quando identificar que o status mudou (ex: cliente pediu para ligar depois), inclua no final da sua resposta exatamente: [SUGESTÃO_STATUS: followup] — substituindo o valor pelo status adequado.
- Status possíveis: sem_contato, em_negociacao, followup, parado, perdido, convertido
- Responda sempre em português.
- Não use emojis.
- Seja direto e profissional.
`

function buildUserPromptContext(ctx: ProposalContext): string {
  const lines: string[] = [
    `Orçamento: ${ctx.clientName}`,
    `Valor total: ${ctx.totalValue != null ? `R$ ${ctx.totalValue.toLocaleString('pt-BR')}` : 'não informado'}`,
    `Margem: ${ctx.profitMargin != null ? `${ctx.profitMargin}%` : 'não informada'}`,
    `Potência: ${ctx.totalPower != null ? `${ctx.totalPower} kWp` : 'não informada'}`,
    `Dias sem atualização: ${ctx.daysSinceUpdate}`,
    `Status atual: ${ctx.negotiationStatus}`,
  ]
  if (ctx.clientSignal) lines.push(`Sinal do cliente registrado: ${ctx.clientSignal}`)
  if (ctx.objections) lines.push(`Objeções registradas: ${ctx.objections}`)
  if (ctx.followupDate) lines.push(`Followup agendado para: ${ctx.followupDate}`)
  return lines.join('\n')
}

function extractStatusSuggestion(text: string): NegotiationStatus | null {
  const match = text.match(/\[SUGESTÃO_STATUS:\s*([\w_]+)\]/i)
  if (!match) return null
  const candidate = match[1] as NegotiationStatus
  const valid: NegotiationStatus[] = [
    'sem_contato', 'em_negociacao', 'followup', 'parado', 'perdido', 'convertido'
  ]
  return valid.includes(candidate) ? candidate : null
}

function cleanResponseText(text: string): string {
  return text.replace(/\[SUGESTÃO_STATUS:\s*[\w_]+\]/gi, '').trim()
}

export type SalesAnalystResponse = {
  reply: string
  status_suggestion: NegotiationStatus | null
}

export async function runSalesAnalyst(
  ctx: ProposalContext
): Promise<SalesAnalystResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")

  const openai = new OpenAI({ apiKey })
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"

  const contextMessage = buildUserPromptContext(ctx)

  // Build message history from stored conversation (already includes the latest user message)
  // Slice before mapping to avoid duplicating messages added in the route before calling the service
  const historyMessages = ctx.conversationHistory.slice(-10).map((m) => ({
    role: m.role === 'analyst' ? 'assistant' as const : 'user' as const,
    content: m.content,
  }))

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SALES_ANALYST_SYSTEM_PROMPT },
    { role: 'user', content: `Contexto do orçamento:\n${contextMessage}` },
    ...historyMessages,
  ]

  // If no history at all, trigger the analyst's opening question
  if (ctx.conversationHistory.length === 0) {
    messages.push({
      role: 'user',
      content: 'Analise este orçamento e me faça sua primeira pergunta.',
    })
  }

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: 400,
    temperature: 0.7,
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  const status_suggestion = extractStatusSuggestion(raw)
  const reply = cleanResponseText(raw)

  return { reply, status_suggestion }
}
