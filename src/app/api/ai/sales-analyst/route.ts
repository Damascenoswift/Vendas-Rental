// src/app/api/ai/sales-analyst/route.ts
// Note: no "use server" directive — Next.js App Router route handlers are server-only by default
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import { runSalesAnalyst, type NegotiationStatus, type ProposalContext } from "@/services/sales-analyst-service"
import { differenceInDays, parseISO } from "date-fns"

const ALLOWED_ROLES: UserRole[] = ['adm_mestre', 'adm_dorata']

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const profile = await getProfile(supabase, user.id)
    const role = (profile?.role ?? user.user_metadata?.role) as UserRole | undefined
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const body = await request.json()
    const proposalId = typeof body?.proposal_id === "string" ? body.proposal_id.trim() : ""
    const message = typeof body?.message === "string" ? body.message.trim() : ""
    if (!proposalId) return NextResponse.json({ error: "proposal_id obrigatório" }, { status: 400 })

    const service = createSupabaseServiceClient()

    // Load proposal — include profit_margin and total_power as top-level columns
    const { data: proposal, error: propError } = await service
      .from("proposals")
      .select("id, total_value, profit_margin, total_power, calculation, updated_at, client_id, seller_id, contato:contacts(full_name)")
      .eq("id", proposalId)
      .single()
    if (propError || !proposal) {
      return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 })
    }

    // Load or create negotiation record
    const { data: negotiation } = await service
      .from("proposal_negotiations")
      .select("*")
      .eq("proposal_id", proposalId)
      .maybeSingle()

    // Load conversation history
    const { data: history } = await service
      .from("proposal_analyst_conversations")
      .select("role, content, status_suggestion, created_at")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true })
      .limit(20)

    // Client name
    type ContactRow = { full_name?: string | null }
    const contactArr = Array.isArray(proposal.contato) ? proposal.contato : proposal.contato ? [proposal.contato] : []
    const clientName = (contactArr[0] as ContactRow)?.full_name ?? "Cliente"

    const daysSinceUpdate = proposal.updated_at
      ? differenceInDays(new Date(), parseISO(proposal.updated_at))
      : 0

    const ctx: ProposalContext = {
      proposalId,
      clientName,
      totalValue: proposal.total_value,
      profitMargin: proposal.profit_margin ?? null,   // top-level column, not from JSON
      totalPower: proposal.total_power ?? null,         // top-level column
      daysSinceUpdate,
      negotiationStatus: negotiation?.negotiation_status ?? 'sem_contato',
      clientSignal: negotiation?.client_signal ?? null,
      objections: negotiation?.objections ?? null,
      followupDate: negotiation?.followup_date ?? null,
      conversationHistory: (history ?? []).map((m) => ({
        role: m.role as "analyst" | "user",
        content: m.content,
        status_suggestion: m.status_suggestion as NegotiationStatus | null,
        created_at: m.created_at,
      })),
    }

    // If user sent a message, save it first
    const userId = (await service
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single()).data?.id ?? null

    if (message) {
      await service.from("proposal_analyst_conversations").insert({
        proposal_id: proposalId,
        user_id: userId,
        role: "user",
        content: message,
      })
      ctx.conversationHistory.push({
        role: "user",
        content: message,
        created_at: new Date().toISOString(),
      })
    }

    const result = await runSalesAnalyst(ctx)

    // Save analyst reply
    await service.from("proposal_analyst_conversations").insert({
      proposal_id: proposalId,
      user_id: null,
      role: "analyst",
      content: result.reply,
      status_suggestion: result.status_suggestion,
    })

    // Ensure negotiation record exists
    if (!negotiation) {
      await service.from("proposal_negotiations").insert({
        proposal_id: proposalId,
        negotiation_status: 'sem_contato',
        updated_by: userId,
      })
    }

    return NextResponse.json({ reply: result.reply, status_suggestion: result.status_suggestion })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro interno"
    console.error("Sales Analyst Error:", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
