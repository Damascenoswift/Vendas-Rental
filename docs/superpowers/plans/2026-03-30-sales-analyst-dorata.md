# Sales Analyst Dorata — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated AI sales analyst for Dorata proposals — with negotiation status tracking, a prioritized analyst tab, a panorama dashboard, and a per-proposal chat panel where the AI challenges the salesperson like a supervisor.

**Architecture:** New dedicated service (`sales-analyst-service.ts`) following the `task-analyst-service` pattern. Two new DB tables (`proposal_negotiations`, `proposal_analyst_conversations`). The proposals page gains three tabs (Lista, Analista, Panorama); each individual proposal gains a chat panel. Status can be updated manually via pills or by confirming the analyst's suggestion.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + RLS), OpenAI API (same pattern as `/api/ai/agent`), Tailwind CSS, Lucide icons, `date-fns`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/127_proposal_negotiations.sql` | Create | negotiation_status enum + proposal_negotiations table + RLS + grants |
| `supabase/migrations/128_proposal_analyst_conversations.sql` | Create | proposal_analyst_conversations table + RLS + grants |
| `src/types/database.ts` | Modify | Add types for both new tables and the negotiation_status enum |
| `src/services/sales-analyst-service.ts` | Create | Core service: builds AI context, calls OpenAI, detects status suggestions |
| `src/app/api/ai/sales-analyst/route.ts` | Create | POST endpoint: auth guard + calls service + saves conversation |
| `src/app/actions/sales-analyst.ts` | Create | Server Actions: load conversation, update status, panorama aggregation |
| `src/components/admin/proposals/proposals-tabs-client.tsx` | Create | Client component: tab switcher (Lista / Analista / Panorama) |
| `src/components/admin/proposals/proposals-list-tab.tsx` | Create | Lista tab: existing list refactored with negotiation_status badge + margin bar |
| `src/components/admin/proposals/proposals-analyst-tab.tsx` | Create | Analista tab: prioritized list + alerts + analyst preview question |
| `src/components/admin/proposals/proposals-panorama-tab.tsx` | Create | Panorama tab: KPI cards + list + conversion time chart |
| `src/components/admin/proposals/proposal-analyst-chat.tsx` | Create | Chat panel: conversation, status pills, status suggestion card |
| `src/app/admin/orcamentos/page.tsx` | Modify | Wrap content in `ProposalsTabsClient`; pass proposal + negotiation data |
| `src/app/admin/orcamentos/[id]/editar/page.tsx` | Modify | Add `ProposalAnalystChat` panel alongside existing calculator |

---

## Chunk 1: Database Migrations

### Task 1: Migration 127 — proposal_negotiations

**Files:**
- Create: `supabase/migrations/127_proposal_negotiations.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/127_proposal_negotiations.sql

-- 1. Enum
create type public.negotiation_status_enum as enum (
  'sem_contato',
  'em_negociacao',
  'followup',
  'parado',
  'perdido',
  'convertido'
);

-- 2. Table
create table public.proposal_negotiations (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  negotiation_status public.negotiation_status_enum not null default 'sem_contato',
  followup_date date,
  client_signal text,
  objections    text,
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint proposal_negotiations_proposal_id_unique unique (proposal_id)
);

-- 3. RLS
alter table public.proposal_negotiations enable row level security;

-- Vendedor: lê negociações dos seus próprios orçamentos
create policy "proposal_negotiations_seller_select"
  on public.proposal_negotiations
  for select
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = (select id from public.users where auth_id = auth.uid())
    )
  );

-- Vendedor: insere e atualiza (não deleta)
create policy "proposal_negotiations_seller_write"
  on public.proposal_negotiations
  for insert
  with check (
    proposal_id in (
      select id from public.proposals
      where seller_id = (select id from public.users where auth_id = auth.uid())
    )
  );

create policy "proposal_negotiations_seller_update"
  on public.proposal_negotiations
  for update
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = (select id from public.users where auth_id = auth.uid())
    )
  );

-- Admins: acesso total
create policy "proposal_negotiations_admin_access"
  on public.proposal_negotiations
  for all
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  );

-- 4. Service role grants
grant select, insert, update, delete on public.proposal_negotiations to service_role;
grant usage on type public.negotiation_status_enum to service_role, authenticated;
```

- [ ] **Step 2: Apply via Supabase dashboard or CLI**

```bash
# Via CLI (if linked):
supabase db push
# OR apply SQL manually in the Supabase dashboard SQL editor
```

Expected: table `proposal_negotiations` and enum `negotiation_status_enum` exist in public schema.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/127_proposal_negotiations.sql
git commit -m "feat(db): add proposal_negotiations table and negotiation_status_enum"
```

---

### Task 2: Migration 128 — proposal_analyst_conversations

**Files:**
- Create: `supabase/migrations/128_proposal_analyst_conversations.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/128_proposal_analyst_conversations.sql

-- 1. Role enum for conversation messages
create type public.analyst_conversation_role_enum as enum ('analyst', 'user');

-- 2. Table
create table public.proposal_analyst_conversations (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references public.proposals(id) on delete cascade,
  user_id          uuid references public.users(id) on delete set null,
  role             public.analyst_conversation_role_enum not null,
  content          text not null,
  status_suggestion public.negotiation_status_enum,
  created_at       timestamptz not null default now()
);

create index proposal_analyst_conversations_proposal_id_idx
  on public.proposal_analyst_conversations(proposal_id, created_at);

-- 3. RLS
alter table public.proposal_analyst_conversations enable row level security;

-- Vendedor: lê e insere mensagens dos seus orçamentos
create policy "pac_seller_access"
  on public.proposal_analyst_conversations
  for all
  using (
    proposal_id in (
      select id from public.proposals
      where seller_id = (select id from public.users where auth_id = auth.uid())
    )
  )
  with check (
    proposal_id in (
      select id from public.proposals
      where seller_id = (select id from public.users where auth_id = auth.uid())
    )
  );

-- Admins: acesso total
create policy "pac_admin_access"
  on public.proposal_analyst_conversations
  for all
  using (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where auth_id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  );

-- 4. Service role grants
grant select, insert, update, delete on public.proposal_analyst_conversations to service_role;
grant usage on type public.analyst_conversation_role_enum to service_role, authenticated;
```

- [ ] **Step 2: Apply migration**

Apply the SQL in the Supabase dashboard or via `supabase db push`.

Expected: table `proposal_analyst_conversations` exists with index on `(proposal_id, created_at)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/128_proposal_analyst_conversations.sql
git commit -m "feat(db): add proposal_analyst_conversations table"
```

---

### Task 3: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add new types to the Enums section**

In `src/types/database.ts`, find the line:
```ts
proposal_status_enum: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
```
Add the two new enums directly after that line:

```ts
negotiation_status_enum: 'sem_contato' | 'em_negociacao' | 'followup' | 'parado' | 'perdido' | 'convertido'
analyst_conversation_role_enum: 'analyst' | 'user'
```

- [ ] **Step 2: Add proposal_negotiations table type**

In the `Tables` section, add after `proposals`:

```ts
proposal_negotiations: {
  Row: {
    id: string
    proposal_id: string
    negotiation_status: Database['public']['Enums']['negotiation_status_enum']
    followup_date: string | null
    client_signal: string | null
    objections: string | null
    updated_by: string | null
    updated_at: string
    created_at: string
  }
  Insert: {
    id?: string
    proposal_id: string
    negotiation_status?: Database['public']['Enums']['negotiation_status_enum']
    followup_date?: string | null
    client_signal?: string | null
    objections?: string | null
    updated_by?: string | null
    updated_at?: string
    created_at?: string
  }
  Update: {
    negotiation_status?: Database['public']['Enums']['negotiation_status_enum']
    followup_date?: string | null
    client_signal?: string | null
    objections?: string | null
    updated_by?: string | null
    updated_at?: string
  }
  Relationships: [
    { foreignKeyName: "proposal_negotiations_proposal_id_fkey"; columns: ["proposal_id"]; referencedRelation: "proposals"; referencedColumns: ["id"] },
    { foreignKeyName: "proposal_negotiations_updated_by_fkey"; columns: ["updated_by"]; referencedRelation: "users"; referencedColumns: ["id"] }
  ]
}
```

- [ ] **Step 3: Add proposal_analyst_conversations table type**

```ts
proposal_analyst_conversations: {
  Row: {
    id: string
    proposal_id: string
    user_id: string | null
    role: Database['public']['Enums']['analyst_conversation_role_enum']
    content: string
    status_suggestion: Database['public']['Enums']['negotiation_status_enum'] | null
    created_at: string
  }
  Insert: {
    id?: string
    proposal_id: string
    user_id?: string | null
    role: Database['public']['Enums']['analyst_conversation_role_enum']
    content: string
    status_suggestion?: Database['public']['Enums']['negotiation_status_enum'] | null
    created_at?: string
  }
  Update: {
    content?: string
    status_suggestion?: Database['public']['Enums']['negotiation_status_enum'] | null
  }
  Relationships: [
    { foreignKeyName: "pac_proposal_id_fkey"; columns: ["proposal_id"]; referencedRelation: "proposals"; referencedColumns: ["id"] },
    { foreignKeyName: "pac_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] }
  ]
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the new types.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add proposal_negotiations and proposal_analyst_conversations types"
```

---

## Chunk 2: Backend — Service, API Route, Server Actions

### Task 4: Sales Analyst Service

**Files:**
- Create: `src/services/sales-analyst-service.ts`

- [ ] **Step 1: Create the service file**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "sales-analyst-service"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/sales-analyst-service.ts
git commit -m "feat(service): add sales-analyst-service with OpenAI integration"
```

---

### Task 5: API Route

**Files:**
- Create: `src/app/api/ai/sales-analyst/route.ts`

- [ ] **Step 1: Create the route**

```ts
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "sales-analyst/route"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/sales-analyst/route.ts
git commit -m "feat(api): add /api/ai/sales-analyst route"
```

---

### Task 6: Server Actions

**Files:**
- Create: `src/app/actions/sales-analyst.ts`

- [ ] **Step 1: Create server actions file**

```ts
// src/app/actions/sales-analyst.ts
"use server"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { differenceInDays, parseISO } from "date-fns"

const ALLOWED_ROLES: UserRole[] = ['adm_mestre', 'adm_dorata']

async function assertAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Não autenticado")
  const profile = await getProfile(supabase, user.id)
  const role = (profile?.role ?? user.user_metadata?.role) as UserRole | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) throw new Error("Acesso negado")
  const service = createSupabaseServiceClient()
  const { data: dbUser } = await service.from("users").select("id").eq("auth_id", user.id).single()
  return { userId: dbUser?.id ?? null, role, service }
}

export async function getSalesAnalystConversation(proposalId: string) {
  const { service } = await assertAccess()
  const { data, error } = await service
    .from("proposal_analyst_conversations")
    .select("id, role, content, status_suggestion, created_at, user_id")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getNegotiationRecord(proposalId: string) {
  const { service } = await assertAccess()
  const { data } = await service
    .from("proposal_negotiations")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle()
  return data
}

// confirmStatusSuggestion is a named alias for updateNegotiationStatus — used when
// the analyst suggests a status change and the user confirms via the chat UI.
// Keeping it as a distinct export preserves the semantic distinction for future audit logging.
export async function confirmStatusSuggestion(
  proposalId: string,
  status: NegotiationStatus
) {
  return updateNegotiationStatus(proposalId, status)
}

export async function updateNegotiationStatus(
  proposalId: string,
  status: NegotiationStatus
) {
  const { userId, service } = await assertAccess()
  const { data: existing } = await service
    .from("proposal_negotiations")
    .select("id")
    .eq("proposal_id", proposalId)
    .maybeSingle()

  if (existing) {
    await service
      .from("proposal_negotiations")
      .update({ negotiation_status: status, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("proposal_id", proposalId)
  } else {
    await service
      .from("proposal_negotiations")
      .insert({ proposal_id: proposalId, negotiation_status: status, updated_by: userId })
  }
}

export type PanoramaKpis = {
  totalAberto: number
  totalFechamento: number
  totalConcluido: number
  qtdParados: number
}

export type PanoramaProposal = {
  id: string
  clientName: string
  negotiationStatus: NegotiationStatus
  totalValue: number | null
  profitMargin: number | null
  totalPower: number | null
  daysSinceUpdate: number
}

export type PanoramaData = {
  kpis: PanoramaKpis
  proposals: PanoramaProposal[]
  conversionByMonth: { month: string; avgDays: number }[]
}

export async function getSalesAnalystPanorama(): Promise<PanoramaData> {
  const { service } = await assertAccess()

  // Load proposals with their negotiations.
  // The `proposals` table has no `marca` column — brand scoping is handled by RLS
  // (adm_dorata users can only see their brand's proposals via seller_id policies).
  // adm_mestre sees all; if stricter filtering is needed later, add a `marca` column migration.
  const { data: proposals } = await service
    .from("proposals")
    .select(`
      id,
      total_value,
      profit_margin,
      total_power,
      updated_at,
      created_at,
      contato:contacts(full_name),
      proposal_negotiations(negotiation_status, updated_at)
    `)
    .order("updated_at", { ascending: false })

  if (!proposals) return { kpis: { totalAberto: 0, totalFechamento: 0, totalConcluido: 0, qtdParados: 0 }, proposals: [], conversionByMonth: [] }

  type ContactRow = { full_name?: string | null }
  type NegRow = { negotiation_status: string; updated_at: string } | null

  const FECHAMENTO_STATUSES: NegotiationStatus[] = ['em_negociacao', 'followup']
  const CONCLUIDO_STATUSES: NegotiationStatus[] = ['convertido']
  const PARADO_STATUSES: NegotiationStatus[] = ['parado', 'perdido']

  let totalAberto = 0, totalFechamento = 0, totalConcluido = 0, qtdParados = 0
  const panoramaProposals: PanoramaProposal[] = []

  for (const p of proposals) {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    const status = (neg?.negotiation_status ?? 'sem_contato') as NegotiationStatus
    const value = p.total_value ?? 0
    const profitMargin = p.profit_margin ?? null    // use top-level column
    const contactArr = Array.isArray(p.contato) ? p.contato : p.contato ? [p.contato] : []
    const clientName = (contactArr[0] as ContactRow)?.full_name ?? "Cliente"
    const daysSinceUpdate = p.updated_at ? differenceInDays(new Date(), parseISO(p.updated_at)) : 0

    if (CONCLUIDO_STATUSES.includes(status)) totalConcluido += value
    else if (FECHAMENTO_STATUSES.includes(status)) { totalAberto += value; totalFechamento += value }
    else { totalAberto += value }

    if (PARADO_STATUSES.includes(status)) qtdParados++

    panoramaProposals.push({ id: p.id, clientName, negotiationStatus: status, totalValue: p.total_value, profitMargin, daysSinceUpdate, totalPower: p.total_power ?? null })
  }

  // Conversion time by month: proposals that are 'convertido', days from created_at to updated_at
  const converted = proposals.filter((p) => {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    return neg?.negotiation_status === 'convertido'
  })

  const byMonth: Record<string, number[]> = {}
  for (const p of converted) {
    if (!p.created_at || !p.updated_at) continue
    const days = differenceInDays(parseISO(p.updated_at), parseISO(p.created_at))
    const month = p.updated_at.slice(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(days)
  }

  const conversionByMonth = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, days]) => ({
      month,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    }))

  return {
    kpis: { totalAberto, totalFechamento, totalConcluido, qtdParados },
    proposals: panoramaProposals,
    conversionByMonth,
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "actions/sales-analyst"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/sales-analyst.ts
git commit -m "feat(actions): add sales-analyst server actions"
```

---

## Chunk 3: UI — Proposals Page Tabs

### Task 7: Proposals Tabs Client (tab switcher)

**Files:**
- Create: `src/components/admin/proposals/proposals-tabs-client.tsx`

- [ ] **Step 1: Create tabs client component**

```tsx
// src/components/admin/proposals/proposals-tabs-client.tsx
"use client"
import { useState } from "react"
import { BarChart2, MessageSquare, List } from "lucide-react"

export type TabKey = "lista" | "analista" | "panorama"

type ProposalsTabsClientProps = {
  listaContent: React.ReactNode
  analistaContent: React.ReactNode
  panoramaContent: React.ReactNode
  defaultTab?: TabKey
}

const TABS = [
  { key: "lista" as TabKey, label: "Lista", Icon: List },
  { key: "analista" as TabKey, label: "Analista", Icon: MessageSquare },
  { key: "panorama" as TabKey, label: "Panorama", Icon: BarChart2 },
]

export function ProposalsTabsClient({
  listaContent,
  analistaContent,
  panoramaContent,
  defaultTab = "lista",
}: ProposalsTabsClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)

  return (
    <div>
      <div className="flex border-b border-border bg-background mb-4">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      {activeTab === "lista" && listaContent}
      {activeTab === "analista" && analistaContent}
      {activeTab === "panorama" && panoramaContent}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/proposals/proposals-tabs-client.tsx
git commit -m "feat(ui): add ProposalsTabsClient tab switcher"
```

---

### Task 8: Proposals List Tab (with negotiation status + margin bar)

**Files:**
- Create: `src/components/admin/proposals/proposals-list-tab.tsx`

- [ ] **Step 1: Create component**

```tsx
// src/components/admin/proposals/proposals-list-tab.tsx
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import type { NegotiationStatus } from "@/services/sales-analyst-service"

export type ProposalListItem = {
  id: string
  clientName: string
  totalValue: number | null
  profitMargin: number | null
  daysSinceUpdate: number
  negotiationStatus: NegotiationStatus
}

export const STATUS_LABELS: Record<NegotiationStatus, string> = {
  sem_contato: "Sem contato",
  em_negociacao: "Em negociação",
  followup: "Followup",
  parado: "Parado",
  perdido: "Perdido",
  convertido: "Convertido",
}

export const STATUS_VARIANTS: Record<NegotiationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  sem_contato: "outline",
  em_negociacao: "default",
  followup: "secondary",
  parado: "destructive",
  perdido: "destructive",
  convertido: "default",
}

function MarginBar({ margin }: { margin: number | null }) {
  if (margin == null) return <span className="text-xs text-muted-foreground">—</span>
  const pct = Math.min(Math.max(margin, 0), 40)
  const color = margin >= 18 ? "bg-emerald-500" : margin >= 10 ? "bg-amber-500" : "bg-red-500"
  const textColor = margin >= 18 ? "text-emerald-600" : margin >= 10 ? "text-amber-600" : "text-red-600"
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(pct / 40) * 100}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{margin}%</span>
    </div>
  )
}

export function ProposalsListTab({ proposals }: { proposals: ProposalListItem[] }) {
  if (proposals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Nenhum orçamento encontrado.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {proposals.map((p) => (
        <Link
          key={p.id}
          href={`/admin/orcamentos/${p.id}/editar`}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">{p.clientName}</span>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[p.negotiationStatus]} className="text-xs">
                {STATUS_LABELS[p.negotiationStatus]}
              </Badge>
              {p.daysSinceUpdate > 0 && (
                <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : p.daysSinceUpdate > 5 ? "text-amber-500" : "text-muted-foreground"}`}>
                  {p.daysSinceUpdate} dias
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm font-bold text-primary">
              {p.totalValue != null
                ? `R$ ${p.totalValue.toLocaleString("pt-BR")}`
                : "—"}
            </span>
            <MarginBar margin={p.profitMargin} />
          </div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/proposals/proposals-list-tab.tsx
git commit -m "feat(ui): add ProposalsListTab with negotiation status and margin bar"
```

---

### Task 9: Analista Tab

**Files:**
- Create: `src/components/admin/proposals/proposals-analyst-tab.tsx`

- [ ] **Step 1: Create component**

```tsx
// src/components/admin/proposals/proposals-analyst-tab.tsx
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ProposalListItem } from "./proposals-list-tab"
import { STATUS_LABELS, STATUS_VARIANTS } from "./proposals-list-tab"

// Analyst preview question per status
function analystPreview(p: ProposalListItem): string {
  switch (p.negotiationStatus) {
    case "sem_contato": return "Orçamento novo. Quando vai fazer o primeiro contato?"
    case "em_negociacao": return "O que o cliente sinalizou sobre prazo de decisão?"
    case "followup": return "Followup pendente. Já preparou a abordagem?"
    case "parado": return "Sem progresso. Qual foi a última objeção apresentada?"
    case "perdido": return "Marcado como perdido. O que levou o cliente à concorrência?"
    case "convertido": return "Convertido. O que foi decisivo para o fechamento?"
  }
}

export function ProposalsAnalystTab({ proposals }: { proposals: ProposalListItem[] }) {
  const critical = proposals.filter(
    (p) => (p.negotiationStatus === "parado" || p.negotiationStatus === "sem_contato") && p.daysSinceUpdate > 7
  )

  const sorted = [...proposals].sort((a, b) => {
    const urgency: Record<string, number> = { parado: 0, sem_contato: 1, followup: 2, em_negociacao: 3, perdido: 4, convertido: 5 }
    const uA = urgency[a.negotiationStatus] ?? 9
    const uB = urgency[b.negotiationStatus] ?? 9
    if (uA !== uB) return uA - uB
    return b.daysSinceUpdate - a.daysSinceUpdate
  })

  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{critical[0].clientName}</strong>
            {critical.length > 1 ? ` e mais ${critical.length - 1}` : ""} sem atualização há mais de 7 dias. Ação necessária.
          </span>
        </div>
      )}

      {sorted.map((p) => (
        <Link
          key={p.id}
          href={`/admin/orcamentos/${p.id}/editar`}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
        >
          <div className="flex flex-col gap-1 flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{p.clientName}</span>
              <Badge variant={STATUS_VARIANTS[p.negotiationStatus]} className="text-xs">
                {STATUS_LABELS[p.negotiationStatus]}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground truncate">{analystPreview(p)}</span>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs font-bold ${p.daysSinceUpdate > 10 ? "text-red-500" : p.daysSinceUpdate > 5 ? "text-amber-500" : "text-emerald-600"}`}>
              {p.daysSinceUpdate} dias
            </span>
            <span className="text-xs text-muted-foreground">
              {p.totalValue != null ? `R$ ${(p.totalValue / 1000).toFixed(0)}k` : "—"}
              {p.profitMargin != null ? ` · ${p.profitMargin}%` : ""}
            </span>
          </div>
        </Link>
      ))}

      {sorted.length === 0 && (
        <p className="text-center py-12 text-muted-foreground text-sm">Nenhum orçamento para analisar.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify exports** — `STATUS_LABELS` and `STATUS_VARIANTS` are already declared with `export` in Task 8's code. Confirm the `export` keywords are present before committing.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/proposals/proposals-analyst-tab.tsx
git commit -m "feat(ui): add ProposalsAnalystTab with prioritized list and alert"
```

---

### Task 10: Panorama Tab

**Files:**
- Create: `src/components/admin/proposals/proposals-panorama-tab.tsx`

- [ ] **Step 1: Create component**

```tsx
// src/components/admin/proposals/proposals-panorama-tab.tsx
import { Badge } from "@/components/ui/badge"
import type { PanoramaData } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { STATUS_LABELS, STATUS_VARIANTS } from "./proposals-list-tab"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex-1 rounded-xl p-4 ${color}`}>
      <div className="text-2xl font-black leading-none">{value}</div>
      <div className="text-xs font-medium mt-1 opacity-80">{label}</div>
    </div>
  )
}

function formatBRL(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
  return `R$ ${value.toLocaleString("pt-BR")}`
}

// Import MarginBar from proposals-list-tab (already exported from Task 8) — do NOT redeclare it here.
// Add to imports at top of this file:
//   import { MarginBar } from "./proposals-list-tab"

export function ProposalsPanoramaTab({ data }: { data: PanoramaData }) {
  const maxDays = Math.max(...data.conversionByMonth.map((m) => m.avgDays), 1)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard label="Em aberto" value={formatBRL(data.kpis.totalAberto)} color="bg-blue-50 text-blue-800" />
        <KpiCard label="Em fechamento" value={formatBRL(data.kpis.totalFechamento)} color="bg-amber-50 text-amber-800" />
        <KpiCard label="Concluído" value={formatBRL(data.kpis.totalConcluido)} color="bg-emerald-50 text-emerald-800" />
        <KpiCard label="Parados" value={String(data.kpis.qtdParados)} color="bg-red-50 text-red-800" />
      </div>

      {/* Proposals list */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          Orçamentos em aberto
        </h3>
        <div className="space-y-2">
          {data.proposals
            .filter((p) => p.negotiationStatus !== "convertido" && p.negotiationStatus !== "perdido")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{p.clientName}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANTS[p.negotiationStatus as NegotiationStatus]} className="text-xs">
                      {STATUS_LABELS[p.negotiationStatus as NegotiationStatus]}
                    </Badge>
                    <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : "text-muted-foreground"}`}>
                      {p.daysSinceUpdate} dias
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold text-primary">
                    {p.totalValue != null ? formatBRL(p.totalValue) : "—"}
                  </span>
                  <MarginBar margin={p.profitMargin} />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Conversion chart */}
      {data.conversionByMonth.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
            Tempo médio até conversão (dias)
          </h3>
          <div className="space-y-2">
            {data.conversionByMonth.map(({ month, avgDays }) => {
              const label = format(parseISO(`${month}-01`), "MMMM", { locale: ptBR })
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 text-right capitalize">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(avgDays / maxDays) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-foreground w-8">{avgDays}d</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/proposals/proposals-panorama-tab.tsx
git commit -m "feat(ui): add ProposalsPanoramaTab with KPIs, list, and conversion chart"
```

---

### Task 11: Wire up the proposals page

**Files:**
- Modify: `src/app/admin/orcamentos/page.tsx`

- [ ] **Step 1: Import the new actions and components at the top of the page file**

Add these imports after the existing ones:

```tsx
import { ProposalsTabsClient } from "@/components/admin/proposals/proposals-tabs-client"
import { ProposalsListTab } from "@/components/admin/proposals/proposals-list-tab"
import { ProposalsAnalystTab } from "@/components/admin/proposals/proposals-analyst-tab"
import { ProposalsPanoramaTab } from "@/components/admin/proposals/proposals-panorama-tab"
import { getSalesAnalystPanorama } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
```

- [ ] **Step 2: Fetch negotiation data alongside proposals**

Inside the page's data-fetching block (after proposals are loaded), add:

```tsx
// Load negotiation statuses for all proposals
const proposalIds = (proposals ?? []).map((p) => p.id)
let negotiationMap: Record<string, NegotiationStatus> = {}
if (proposalIds.length > 0) {
  const { data: negotiations } = await serviceClient
    .from("proposal_negotiations")
    .select("proposal_id, negotiation_status")
    .in("proposal_id", proposalIds)
  for (const n of negotiations ?? []) {
    negotiationMap[n.proposal_id] = n.negotiation_status as NegotiationStatus
  }
}

// Panorama data (only for admin roles)
const isAdmin = role === "adm_mestre" || role === "adm_dorata"
const panoramaData = isAdmin ? await getSalesAnalystPanorama().catch(() => null) : null
```

- [ ] **Step 3: Build ProposalListItem array from loaded proposals**

After building existing table rows, also build the list item array:

```tsx
const proposalListItems = (proposals ?? []).map((p) => {
  const calc = p.calculation as { output?: { profit_margin?: number } } | null
  return {
    id: p.id,
    clientName: (() => {
      const arr = Array.isArray(p.contato) ? p.contato : p.contato ? [p.contato] : []
      const c = arr[0] as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | undefined
      if (!c) return "Cliente"
      if (c.full_name?.trim()) return c.full_name.trim()
      return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Cliente"
    })(),
    totalValue: p.total_value ?? null,
    profitMargin: p.profit_margin ?? null,  // use top-level column directly
    daysSinceUpdate: p.updated_at ? differenceInDays(new Date(), parseISO(p.updated_at)) : 0,
    negotiationStatus: negotiationMap[p.id] ?? "sem_contato" as NegotiationStatus,
  }
})
```

- [ ] **Step 4: Wrap the page return in `ProposalsTabsClient`**

Replace the existing table JSX with:

```tsx
<ProposalsTabsClient
  listaContent={<ProposalsListTab proposals={proposalListItems} />}
  analistaContent={<ProposalsAnalystTab proposals={proposalListItems} />}
  panoramaContent={
    panoramaData
      ? <ProposalsPanoramaTab data={panoramaData} />
      : <p className="text-center py-12 text-muted-foreground text-sm">Sem acesso ao panorama.</p>
  }
/>
```

- [ ] **Step 5: Verify TypeScript + dev server**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Visit `/admin/orcamentos` and verify all three tabs render.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/orcamentos/page.tsx
git commit -m "feat(ui): wire proposals page tabs with negotiation status and panorama"
```

---

## Chunk 4: UI — Per-Proposal Chat Panel

### Task 12: Proposal Analyst Chat component

**Files:**
- Create: `src/components/admin/proposals/proposal-analyst-chat.tsx`

- [ ] **Step 1: Create the chat component**

```tsx
// src/components/admin/proposals/proposal-analyst-chat.tsx
"use client"
import { useState, useEffect, useRef, useTransition } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateNegotiationStatus } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"

type Message = {
  role: "analyst" | "user"
  content: string
  status_suggestion?: NegotiationStatus | null
  created_at: string
}

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  sem_contato: "Sem contato",
  em_negociacao: "Em negociação",
  followup: "Followup",
  parado: "Parado",
  perdido: "Perdido",
  convertido: "Convertido",
}

const ALL_STATUSES: NegotiationStatus[] = [
  "sem_contato", "em_negociacao", "followup", "parado", "perdido", "convertido",
]

type ProposalAnalystChatProps = {
  proposalId: string
  initialMessages: Message[]
  initialStatus: NegotiationStatus
}

export function ProposalAnalystChat({
  proposalId,
  initialMessages,
  initialStatus,
}: ProposalAnalystChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<NegotiationStatus>(initialStatus)
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-open: if no conversation yet, fetch first analyst message
  useEffect(() => {
    if (initialMessages.length === 0) {
      void sendMessage("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    setIsLoading(true)
    try {
      const res = await fetch("/api/ai/sales-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, message: text }),
      })
      const json = await res.json() as { reply?: string; status_suggestion?: NegotiationStatus; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido")

      const now = new Date().toISOString()
      const newMessages: Message[] = []
      if (text) {
        newMessages.push({ role: "user", content: text, created_at: now })
      }
      newMessages.push({
        role: "analyst",
        content: json.reply ?? "",
        status_suggestion: json.status_suggestion ?? null,
        created_at: now,
      })
      setMessages((prev) => [...prev, ...newMessages])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend() {
    if (!input.trim() || isLoading) return
    const text = input.trim()
    setInput("")
    void sendMessage(text)
  }

  function handleStatusChange(newStatus: NegotiationStatus) {
    setStatus(newStatus)
    startTransition(async () => {
      await updateNegotiationStatus(proposalId, newStatus)
    })
  }

  function handleConfirmSuggestion(suggested: NegotiationStatus) {
    handleStatusChange(suggested)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Status selector */}
      <div className="mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          Status da negociação
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={isPending}
              className={[
                "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50",
              ].join(" ")}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Chat label */}
      <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Analista</p>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "analyst" ? "space-y-1" : "flex justify-end"}>
            <div
              className={[
                "rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[90%]",
                m.role === "analyst"
                  ? "bg-primary text-primary-foreground rounded-tl-sm"
                  : "bg-card border border-border text-foreground rounded-tr-sm",
              ].join(" ")}
            >
              {m.content}
            </div>
            {m.role === "analyst" && m.status_suggestion && m.status_suggestion !== status && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-xs text-primary">
                  Sugestão: mudar para <strong>{STATUS_LABELS[m.status_suggestion]}</strong>
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleConfirmSuggestion(m.status_suggestion!)}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="bg-primary/10 rounded-xl px-3 py-2 text-sm text-primary w-fit animate-pulse">
            Analisando...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-center border border-border rounded-lg bg-background px-3 py-2">
        <input
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Responda ao analista..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-7 h-7 rounded-md bg-primary flex items-center justify-center disabled:opacity-40 transition-opacity"
        >
          <Send className="w-3.5 h-3.5 text-primary-foreground" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/proposals/proposal-analyst-chat.tsx
git commit -m "feat(ui): add ProposalAnalystChat component"
```

---

### Task 13: Wire chat into proposal edit page

**Files:**
- Modify: `src/app/admin/orcamentos/[id]/editar/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ProposalAnalystChat } from "@/components/admin/proposals/proposal-analyst-chat"
import { getSalesAnalystConversation, getNegotiationRecord } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
```

- [ ] **Step 2: Fetch conversation and negotiation data in the page**

After the existing data fetching (proposal + products), add:

```tsx
// Load analyst conversation and negotiation status
let analystMessages: Awaited<ReturnType<typeof getSalesAnalystConversation>> = []
let negotiationStatus: NegotiationStatus = "sem_contato"

try {
  const [msgs, neg] = await Promise.all([
    getSalesAnalystConversation(id),
    getNegotiationRecord(id),
  ])
  analystMessages = msgs
  negotiationStatus = (neg?.negotiation_status ?? "sem_contato") as NegotiationStatus
} catch {
  // Non-blocking — chat is additive, page still works without it
}
```

- [ ] **Step 3: Update the page return JSX to split-layout**

Wrap the existing `<ProposalCalculator>` in a two-column layout and add the chat panel:

```tsx
return (
  <div className="flex gap-4 h-[calc(100vh-4rem)] overflow-hidden">
    {/* Left: existing proposal calculator */}
    <div className="flex-1 overflow-y-auto">
      {/* Keep all existing ProposalCalculator props exactly as they are — do NOT modify the component */}
      <ProposalCalculator {...existingProps} />
    </div>

    {/* Right: analyst chat panel */}
    <div className="w-80 flex-shrink-0 border-l border-border bg-card px-4 py-4 overflow-hidden flex flex-col">
      <h2 className="text-sm font-bold text-foreground mb-3">Analista de Vendas</h2>
      <ProposalAnalystChat
        proposalId={id}
        initialMessages={analystMessages.map((m) => ({
          role: m.role as "analyst" | "user",
          content: m.content,
          status_suggestion: m.status_suggestion as NegotiationStatus | null,
          created_at: m.created_at,
        }))}
        initialStatus={negotiationStatus}
      />
    </div>
  </div>
)
```

- [ ] **Step 4: Verify TypeScript + dev server**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Visit `/admin/orcamentos/[id]/editar` — proposal calculator on the left, analyst chat on the right.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/orcamentos/[id]/editar/page.tsx
git commit -m "feat(ui): add analyst chat panel to proposal edit page"
```

---

## Final Verification

- [ ] Visit `/admin/orcamentos` — confirm Lista, Analista, and Panorama tabs render correctly
- [ ] Open any proposal — confirm split layout with chat panel on the right
- [ ] Send a message in the chat — confirm analyst replies in Portuguese
- [ ] Change status via pills — confirm it persists on page reload
- [ ] Receive a status suggestion from analyst — click "Confirmar" — confirm status pill updates
- [ ] Panorama tab shows correct KPI values summed from current proposals
- [ ] Commit any final fixes

```bash
git push origin claude/crazy-yalow
```
