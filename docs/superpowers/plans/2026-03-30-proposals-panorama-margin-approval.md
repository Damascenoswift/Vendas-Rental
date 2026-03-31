# Proposals: Panorama v2 + Margin Approval — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CRM contract date detection, average margin + installation breakdown KPIs to the Panorama tab, and a full vendedor→ADM margin approval flow with in-app notification.

**Architecture:** New `proposal_price_approvals` Supabase table stores the approval audit trail. Pure utility functions (tested with Vitest) handle the recalculation and installation-type derivation. Server actions in `price-approval.ts` own the approval flow; `sales-analyst.ts` is extended for the Panorama data. Two new Client Components (`proposal-price-approval.tsx`, `proposals-adm-approvals.tsx`) handle the UI, wired into the existing edit page and proposals page.

**Tech Stack:** Next.js 15 App Router (Server Actions, Server Components, Client Components), Supabase PostgreSQL + RLS, TypeScript, Tailwind CSS, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-30-proposals-panorama-margin-approval-design.md`

**Branch:** This work continues on the `claude/crazy-yalow` worktree at `.claude/worktrees/crazy-yalow`. All file paths below are relative to that worktree root. Run all commands from that directory.

---

## Chunk 1: Database + Types

### Task 1: Migration 129 — proposal_price_approvals table

**Files:**
- Create: `supabase/migrations/129_proposal_price_approvals.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/129_proposal_price_approvals.sql

create table public.proposal_price_approvals (
  id                uuid primary key default gen_random_uuid(),
  proposal_id       uuid not null references public.proposals(id) on delete cascade,
  requested_by      uuid not null references public.users(id) on delete cascade,
  approved_by       uuid references public.users(id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  vendedor_note     text,
  original_margin   numeric,
  original_value    numeric,
  adm_min_margin    numeric,
  new_value         numeric,
  adm_note          text,
  requested_at      timestamptz not null default now(),
  resolved_at       timestamptz
);

create index proposal_price_approvals_proposal_id_idx
  on public.proposal_price_approvals(proposal_id, requested_at desc);

alter table public.proposal_price_approvals enable row level security;

-- Vendedor: read own proposals' approvals
create policy "ppa_seller_select"
  on public.proposal_price_approvals
  for select
  using (
    proposal_id in (
      select id from public.proposals where seller_id = auth.uid()
    )
  );

-- Vendedor: insert for own proposals only
create policy "ppa_seller_insert"
  on public.proposal_price_approvals
  for insert
  with check (
    requested_by = auth.uid()
    and proposal_id in (
      select id from public.proposals where seller_id = auth.uid()
    )
  );

-- ADM: full access
create policy "ppa_admin_access"
  on public.proposal_price_approvals
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
      and role in ('adm_mestre', 'adm_dorata')
    )
  );

-- Service role: full access for server actions
grant select, insert, update, delete on public.proposal_price_approvals to service_role;
grant select, insert on public.proposal_price_approvals to authenticated;
```

- [ ] **Step 2: Verify the file was created**

```bash
cat supabase/migrations/129_proposal_price_approvals.sql
```

Expected: File contents shown without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/129_proposal_price_approvals.sql
git commit -m "feat: add proposal_price_approvals migration (129)"
```

---

### Task 2: Add proposal_price_approvals to database.ts

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Locate the insertion point**

Find the `proposal_negotiations` table entry in `src/types/database.ts`. The new type goes immediately after it (alphabetically `proposal_price_approvals` follows `proposal_negotiations`).

- [ ] **Step 2: Insert the new table type**

After the closing brace + `Relationships` block of `proposal_negotiations`, add:

```typescript
      proposal_price_approvals: {
        Row: {
          id: string
          proposal_id: string
          requested_by: string
          approved_by: string | null
          status: string
          vendedor_note: string | null
          original_margin: number | null
          original_value: number | null
          adm_min_margin: number | null
          new_value: number | null
          adm_note: string | null
          requested_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          proposal_id: string
          requested_by: string
          approved_by?: string | null
          status?: string
          vendedor_note?: string | null
          original_margin?: number | null
          original_value?: number | null
          adm_min_margin?: number | null
          new_value?: number | null
          adm_note?: string | null
          requested_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          proposal_id?: string
          requested_by?: string
          approved_by?: string | null
          status?: string
          vendedor_note?: string | null
          original_margin?: number | null
          original_value?: number | null
          adm_min_margin?: number | null
          new_value?: number | null
          adm_note?: string | null
          requested_at?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_price_approvals_proposal_id_fkey"
            columns: ["proposal_id"]
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_price_approvals_requested_by_fkey"
            columns: ["requested_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_price_approvals_approved_by_fkey"
            columns: ["approved_by"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors related to `proposal_price_approvals`.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add proposal_price_approvals to database types"
```

---

## Chunk 2: Pure Utilities + Server Actions

### Task 3: Pure utility — price approval recalculation

**Files:**
- Create: `src/lib/price-approval-utils.ts`
- Create: `src/lib/__tests__/price-approval-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/price-approval-utils.test.ts
import { describe, expect, it } from "vitest"
import { calcNewValue, getInstallationType } from "../price-approval-utils"

describe("calcNewValue", () => {
  it("uses itemised costs when all present", () => {
    // equipment=60000, labor=10000, additional=5000 → cost=75000
    // margin=15% → new_value = 75000 / (1 - 0.15) = 88235.29...
    const result = calcNewValue(60000, 10000, 5000, null, null, 15)
    expect(result).toBeCloseTo(88235.29, 0)
  })

  it("uses COALESCE for null cost columns (treats null as 0)", () => {
    // equipment=80000, labor=null, additional=null → cost=80000
    // margin=20% → new_value = 80000 / (1 - 0.20) = 100000
    const result = calcNewValue(80000, null, null, null, null, 20)
    expect(result).toBeCloseTo(100000, 0)
  })

  it("falls back to original_value + original_margin when all costs are null", () => {
    // original_value=100000, original_margin=20% → implied_cost = 80000
    // new margin=10% → new_value = 80000 / (1 - 0.10) = 88888.88...
    const result = calcNewValue(null, null, null, 100000, 20, 10)
    expect(result).toBeCloseTo(88888.89, 0)
  })

  it("returns 0 when all costs null and no original value/margin", () => {
    const result = calcNewValue(null, null, null, null, null, 15)
    expect(result).toBe(0)
  })

  it("handles zero costs correctly (falls back to original value path)", () => {
    // All zero is treated same as all null → fallback
    const result = calcNewValue(0, 0, 0, 100000, 20, 10)
    expect(result).toBeCloseTo(88888.89, 0)
  })
})

describe("getInstallationType", () => {
  it("returns 'solo' when only solo plates", () => {
    const calc = { input: { structure: { qtd_placas_solo: 10, qtd_placas_telhado: 0 } } }
    expect(getInstallationType(calc)).toBe("solo")
  })

  it("returns 'telhado' when only telhado plates", () => {
    const calc = { input: { structure: { qtd_placas_solo: 0, qtd_placas_telhado: 8 } } }
    expect(getInstallationType(calc)).toBe("telhado")
  })

  it("returns 'misto' when both", () => {
    const calc = { input: { structure: { qtd_placas_solo: 4, qtd_placas_telhado: 6 } } }
    expect(getInstallationType(calc)).toBe("misto")
  })

  it("returns null when neither field is present", () => {
    expect(getInstallationType({})).toBeNull()
    expect(getInstallationType(null)).toBeNull()
    expect(getInstallationType({ input: { structure: {} } })).toBeNull()
  })

  it("returns null when calculation is null/undefined", () => {
    expect(getInstallationType(null)).toBeNull()
    expect(getInstallationType(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests — verify they FAIL**

```bash
npx vitest run src/lib/__tests__/price-approval-utils.test.ts 2>&1
```

Expected: FAIL — `Cannot find module '../price-approval-utils'`

- [ ] **Step 3: Implement the utility functions**

```typescript
// src/lib/price-approval-utils.ts

/**
 * Recalculates the proposal total value for a given minimum margin.
 *
 * Priority:
 * 1. Use itemised costs if their sum is > 0 (null columns treated as 0 via COALESCE)
 * 2. Fall back to deriving cost from (original_value * (1 - original_margin/100))
 * 3. Return 0 if insufficient data
 */
export function calcNewValue(
  equipmentCost: number | null,
  laborCost: number | null,
  additionalCost: number | null,
  originalValue: number | null,
  originalMargin: number | null,
  admMinMargin: number
): number {
  const totalCost =
    (equipmentCost ?? 0) + (laborCost ?? 0) + (additionalCost ?? 0)

  if (totalCost > 0) {
    return totalCost / (1 - admMinMargin / 100)
  }

  // Fallback: reverse-engineer cost from original_value and original_margin
  if (originalValue != null && originalMargin != null) {
    const impliedCost = originalValue * (1 - originalMargin / 100)
    return impliedCost / (1 - admMinMargin / 100)
  }

  return 0
}

type InstallationType = "solo" | "telhado" | "misto"

/**
 * Derives installation type from the proposal's `calculation` JSON column.
 * The path is: calculation.input.structure.qtd_placas_solo / qtd_placas_telhado
 */
export function getInstallationType(calculation: unknown): InstallationType | null {
  if (!calculation || typeof calculation !== "object") return null
  const calc = calculation as Record<string, unknown>
  const input = calc.input
  if (!input || typeof input !== "object") return null
  const structure = (input as Record<string, unknown>).structure
  if (!structure || typeof structure !== "object") return null
  const s = structure as Record<string, unknown>
  const solo = Number(s.qtd_placas_solo ?? 0)
  const telhado = Number(s.qtd_placas_telhado ?? 0)
  if (solo > 0 && telhado === 0) return "solo"
  if (telhado > 0 && solo === 0) return "telhado"
  if (solo > 0 && telhado > 0) return "misto"
  return null
}
```

- [ ] **Step 4: Run the tests — verify they PASS**

```bash
npx vitest run src/lib/__tests__/price-approval-utils.test.ts 2>&1
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/price-approval-utils.ts src/lib/__tests__/price-approval-utils.test.ts
git commit -m "feat: add price-approval-utils (calcNewValue, getInstallationType)"
```

---

### Task 4: Server actions — price-approval.ts

**Files:**
- Create: `src/app/actions/price-approval.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/actions/price-approval.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { getProfile, type UserRole } from "@/lib/auth"
import { dispatchNotificationEvent } from "@/services/notification-service"
import { calcNewValue } from "@/lib/price-approval-utils"
import { revalidatePath } from "next/cache"

const ADM_ROLES: UserRole[] = ["adm_mestre", "adm_dorata"]

async function assertAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Não autenticado")
  return { userId: user.id, supabase }
}

async function assertAdm() {
  const { userId, supabase } = await assertAuth()
  const profile = await getProfile(supabase, userId)
  const role = (profile?.role ?? null) as UserRole | null
  if (!role || !ADM_ROLES.includes(role)) throw new Error("Acesso negado")
  const service = createSupabaseServiceClient()
  return { userId, role, service }
}

export type PriceApprovalStatus = "pending" | "approved" | "rejected"

export type PriceApprovalRecord = {
  id: string
  proposal_id: string
  requested_by: string
  approved_by: string | null
  status: PriceApprovalStatus
  vendedor_note: string | null
  original_margin: number | null
  original_value: number | null
  adm_min_margin: number | null
  new_value: number | null
  adm_note: string | null
  requested_at: string
  resolved_at: string | null
}

/**
 * Vendedor flags "cliente está achando caro".
 * Inserts a new approval record with status='pending'.
 * Accessible to any authenticated user who owns the proposal.
 */
export async function requestPriceApproval(
  proposalId: string,
  vendedorNote?: string
): Promise<void> {
  const { userId } = await assertAuth()
  const service = createSupabaseServiceClient()

  const { data: proposal, error: propError } = await service
    .from("proposals")
    .select("id, total_value, profit_margin, seller_id")
    .eq("id", proposalId)
    .single()

  if (propError || !proposal) throw new Error("Orçamento não encontrado")

  // Ownership check (ADMs can also request on behalf)
  if (proposal.seller_id !== userId) {
    const supabase = await createClient()
    const profile = await getProfile(supabase, userId)
    if (!profile?.role || !ADM_ROLES.includes(profile.role as UserRole)) {
      throw new Error("Acesso negado")
    }
  }

  const { error } = await service.from("proposal_price_approvals").insert({
    proposal_id: proposalId,
    requested_by: userId,
    status: "pending",
    vendedor_note: vendedorNote ?? null,
    original_margin: proposal.profit_margin,
    original_value: proposal.total_value,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/admin/orcamentos/${proposalId}/editar`)
}

/**
 * Returns the latest approval record for a proposal (any status).
 * Used to hydrate the vendedor UI on the edit page.
 */
export async function getProposalPriceApproval(
  proposalId: string
): Promise<PriceApprovalRecord | null> {
  const service = createSupabaseServiceClient()
  const { data } = await service
    .from("proposal_price_approvals")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as PriceApprovalRecord | null) ?? null
}

export type PendingApprovalItem = {
  id: string
  proposal_id: string
  requested_by: string
  vendedor_note: string | null
  original_margin: number | null
  original_value: number | null
  requested_at: string
  clientName: string
  requesterName: string
}

/**
 * ADM-only: returns all pending approval requests with client + requester names.
 */
export async function getPendingApprovals(): Promise<PendingApprovalItem[]> {
  const { service } = await assertAdm()

  const { data, error } = await service
    .from("proposal_price_approvals")
    .select(`
      id,
      proposal_id,
      requested_by,
      vendedor_note,
      original_margin,
      original_value,
      requested_at,
      proposal:proposals(contato:contacts(full_name)),
      requester:users!proposal_price_approvals_requested_by_fkey(name, email)
    `)
    .eq("status", "pending")
    .order("requested_at", { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const proposal = Array.isArray(row.proposal) ? row.proposal[0] : row.proposal
    const contactArr = Array.isArray(proposal?.contato)
      ? proposal.contato
      : proposal?.contato
      ? [proposal.contato]
      : []
    const clientName = (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

    const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester
    const requesterName =
      (requester as { name?: string | null; email?: string | null } | null)?.name ??
      (requester as { name?: string | null; email?: string | null } | null)?.email ??
      "Vendedor"

    return {
      id: row.id,
      proposal_id: row.proposal_id,
      requested_by: row.requested_by,
      vendedor_note: row.vendedor_note,
      original_margin: row.original_margin,
      original_value: row.original_value,
      requested_at: row.requested_at,
      clientName,
      requesterName,
    }
  })
}

/**
 * ADM approves a pending request, sets minimum margin, computes new value,
 * and notifies the vendedor.
 */
export async function approvePriceApproval(
  approvalId: string,
  admMinMargin: number
): Promise<void> {
  const { userId, service } = await assertAdm()

  const { data: approval, error: approvalError } = await service
    .from("proposal_price_approvals")
    .select(`
      *,
      proposal:proposals(equipment_cost, labor_cost, additional_cost, seller_id, contato:contacts(full_name))
    `)
    .eq("id", approvalId)
    .single()

  if (approvalError || !approval) throw new Error("Aprovação não encontrada")
  if (approval.status !== "pending") throw new Error("Aprovação não está pendente")

  const proposal = Array.isArray(approval.proposal) ? approval.proposal[0] : approval.proposal

  const newValue = calcNewValue(
    (proposal as { equipment_cost?: number | null } | null)?.equipment_cost ?? null,
    (proposal as { labor_cost?: number | null } | null)?.labor_cost ?? null,
    (proposal as { additional_cost?: number | null } | null)?.additional_cost ?? null,
    approval.original_value,
    approval.original_margin,
    admMinMargin
  )

  const { error: updateError } = await service
    .from("proposal_price_approvals")
    .update({
      status: "approved",
      adm_min_margin: admMinMargin,
      new_value: newValue,
      approved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)

  if (updateError) throw new Error(updateError.message)

  const contactArr = Array.isArray(
    (proposal as { contato?: unknown } | null)?.contato
  )
    ? ((proposal as { contato: unknown[] }).contato)
    : (proposal as { contato?: unknown } | null)?.contato
    ? [(proposal as { contato: unknown }).contato]
    : []

  const clientName =
    (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

  const formattedValue = newValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })

  await dispatchNotificationEvent({
    domain: "SYSTEM",
    eventKey: "SYSTEM_GENERIC",
    entityType: "SYSTEM",
    entityId: approvalId,
    title: `Revisão de margem — ${clientName}`,
    message: `ADM aprovou margem mínima de ${admMinMargin}%. Novo valor sugerido: ${formattedValue}`,
    recipients: [{ userId: approval.requested_by, responsibilityKind: "OWNER" }],
    targetPath: `/admin/orcamentos/${approval.proposal_id}/editar`,
    revalidatePaths: ["/admin/orcamentos"],
  })
}

/**
 * ADM rejects a pending request and notifies the vendedor.
 */
export async function rejectPriceApproval(
  approvalId: string,
  admNote?: string
): Promise<void> {
  const { userId, service } = await assertAdm()

  const { data: approval, error: approvalError } = await service
    .from("proposal_price_approvals")
    .select(`
      *,
      proposal:proposals(seller_id, contato:contacts(full_name))
    `)
    .eq("id", approvalId)
    .single()

  if (approvalError || !approval) throw new Error("Aprovação não encontrada")
  if (approval.status !== "pending") throw new Error("Aprovação não está pendente")

  const { error: updateError } = await service
    .from("proposal_price_approvals")
    .update({
      status: "rejected",
      approved_by: userId,
      adm_note: admNote ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)

  if (updateError) throw new Error(updateError.message)

  const proposal = Array.isArray(approval.proposal) ? approval.proposal[0] : approval.proposal
  const contactArr = Array.isArray(
    (proposal as { contato?: unknown } | null)?.contato
  )
    ? ((proposal as { contato: unknown[] }).contato)
    : (proposal as { contato?: unknown } | null)?.contato
    ? [(proposal as { contato: unknown }).contato]
    : []

  const clientName =
    (contactArr[0] as { full_name?: string | null } | undefined)?.full_name ?? "Cliente"

  await dispatchNotificationEvent({
    domain: "SYSTEM",
    eventKey: "SYSTEM_GENERIC",
    entityType: "SYSTEM",
    entityId: approvalId,
    title: `Revisão de margem — ${clientName}`,
    message: `ADM não aprovou a revisão de margem para ${clientName}`,
    recipients: [{ userId: approval.requested_by, responsibilityKind: "OWNER" }],
    targetPath: `/admin/orcamentos/${approval.proposal_id}/editar`,
    revalidatePaths: ["/admin/orcamentos"],
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in `price-approval.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/price-approval.ts
git commit -m "feat: add price-approval server actions"
```

---

### Task 5: Extend sales-analyst.ts — Panorama v2 data

**Files:**
- Modify: `src/app/actions/sales-analyst.ts`

The goal is to add three new fields to the Panorama response:
1. `crmContractDate: string | null` on each `PanoramaProposal`
2. `avgMargin: number | null` on `PanoramaData`
3. `installationBreakdown: { telhado: ..., solo: ... }` on `PanoramaData`

- [ ] **Step 1: Update type exports in `sales-analyst.ts`**

Replace the existing `PanoramaProposal` and `PanoramaData` type definitions with the extended versions:

```typescript
export type PanoramaProposal = {
  id: string
  clientName: string
  negotiationStatus: NegotiationStatus
  totalValue: number | null
  profitMargin: number | null
  totalPower: number | null
  daysSinceUpdate: number
  crmContractDate: string | null   // ISO string or null
}

export type PanoramaData = {
  kpis: PanoramaKpis
  proposals: PanoramaProposal[]
  conversionByMonth: { month: string; avgDays: number }[]
  avgMargin: number | null
  installationBreakdown: {
    telhado: { count: number; totalValue: number }
    solo: { count: number; totalValue: number }
  }
}
```

- [ ] **Step 2: Add the import for `getInstallationType`**

At the top of `sales-analyst.ts`, after the existing imports, add:

```typescript
import { getInstallationType } from "@/lib/price-approval-utils"
```

- [ ] **Step 3: Update the proposals query to include `client_id` and `calculation`**

In `getSalesAnalystPanorama()`, change the `.select(...)` call to:

```typescript
const { data: proposals } = await service
  .from("proposals")
  .select(`
    id,
    client_id,
    total_value,
    profit_margin,
    total_power,
    calculation,
    updated_at,
    created_at,
    contato:contacts(full_name),
    proposal_negotiations(negotiation_status, updated_at)
  `)
  .order("updated_at", { ascending: false })
```

- [ ] **Step 4: Add CRM contract date lookup after the proposals query**

After the `if (!proposals) return ...` guard, add this block to build a `contractDateMap`:

```typescript
  // --- CRM contract date lookup ---
  const clientIds = proposals.map((p) => p.client_id).filter((id): id is string => !!id)

  let contractDateMap: Record<string, string> = {}
  if (clientIds.length > 0) {
    // Find stage IDs for "Contrato Assinado" in the Dorata pipeline
    const { data: contractStages } = await service
      .from("crm_stages")
      .select("id, pipeline_id, crm_pipelines(brand)")
      .eq("name", "Contrato Assinado")
      .eq("is_closed", true)

    type PipeRow = { brand?: string | null }
    const dorataStageIds = (contractStages ?? [])
      .filter((s) => {
        const pipe = (Array.isArray(s.crm_pipelines) ? s.crm_pipelines[0] : s.crm_pipelines) as PipeRow | null
        return pipe?.brand === "dorata"
      })
      .map((s) => s.id)

    if (dorataStageIds.length > 0) {
      const { data: contractCards } = await service
        .from("crm_cards")
        .select("indicacao_id, stage_entered_at")
        .in("stage_id", dorataStageIds)
        .in("indicacao_id", clientIds)

      for (const card of contractCards ?? []) {
        if (card.indicacao_id && card.stage_entered_at) {
          contractDateMap[card.indicacao_id] = card.stage_entered_at
        }
      }
    }
  }
```

- [ ] **Step 5: Compute avgMargin and installationBreakdown in the proposal loop**

In the `for (const p of proposals)` loop, add `crmContractDate` to each pushed item, and accumulate `avgMargin` and breakdown data. Replace the full loop and post-loop code with:

```typescript
  let totalAberto = 0, totalFechamento = 0, totalConcluido = 0, qtdParados = 0
  const panoramaProposals: PanoramaProposal[] = []

  // For avg margin
  let marginSum = 0
  let marginCount = 0

  // For installation breakdown (misto counts as telhado)
  const breakdown = {
    telhado: { count: 0, totalValue: 0 },
    solo: { count: 0, totalValue: 0 },
  }

  for (const p of proposals) {
    const neg = (Array.isArray(p.proposal_negotiations) ? p.proposal_negotiations[0] : p.proposal_negotiations) as NegRow
    const status = (neg?.negotiation_status ?? "sem_contato") as NegotiationStatus
    const value = p.total_value ?? 0
    const profitMargin = p.profit_margin ?? null
    const contactArr = Array.isArray(p.contato) ? p.contato : p.contato ? [p.contato] : []
    const clientName = (contactArr[0] as ContactRow)?.full_name ?? "Cliente"
    const daysSinceUpdate = p.updated_at ? differenceInDays(new Date(), parseISO(p.updated_at)) : 0
    const crmContractDate = (p.client_id ? contractDateMap[p.client_id] : undefined) ?? null

    if (CONCLUIDO_STATUSES.includes(status)) totalConcluido += value
    else if (FECHAMENTO_STATUSES.includes(status)) { totalAberto += value; totalFechamento += value }
    else { totalAberto += value }

    if (PARADO_STATUSES.includes(status)) qtdParados++

    // Avg margin accumulation
    if (profitMargin != null) {
      marginSum += profitMargin
      marginCount++
    }

    // Installation breakdown
    const installType = getInstallationType(p.calculation)
    if (installType === "solo") {
      breakdown.solo.count++
      breakdown.solo.totalValue += value
    } else if (installType === "telhado" || installType === "misto") {
      breakdown.telhado.count++
      breakdown.telhado.totalValue += value
    }

    panoramaProposals.push({
      id: p.id,
      clientName,
      negotiationStatus: status,
      totalValue: p.total_value,
      profitMargin,
      daysSinceUpdate,
      totalPower: p.total_power ?? null,
      crmContractDate,
    })
  }

  const avgMargin = marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : null
```

- [ ] **Step 6: Update the return statement**

Replace the final `return { ... }` with:

```typescript
  return {
    kpis: { totalAberto, totalFechamento, totalConcluido, qtdParados },
    proposals: panoramaProposals,
    conversionByMonth,
    avgMargin,
    installationBreakdown: breakdown,
  }
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/actions/sales-analyst.ts
git commit -m "feat: extend getSalesAnalystPanorama with avg margin, breakdown, CRM date"
```

---

## Chunk 3: Panorama v2 UI

### Task 6: Update proposals-panorama-tab.tsx

**Files:**
- Modify: `src/components/admin/proposals/proposals-panorama-tab.tsx`

This component receives `PanoramaData` and renders the KPI cards, proposal list, and conversion chart. We add: average margin KPI card, solo/telhado breakdown bar, and CRM contract date badge on each proposal row.

- [ ] **Step 1: Add the AvgMargin KPI card and the installation breakdown**

Replace the entire file contents with:

```typescript
// src/components/admin/proposals/proposals-panorama-tab.tsx
import { Badge } from "@/components/ui/badge"
import type { PanoramaData } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { STATUS_LABELS, STATUS_VARIANTS, MarginBar } from "./proposals-list-tab"
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

function InstallationBreakdown({
  breakdown,
}: {
  breakdown: PanoramaData["installationBreakdown"]
}) {
  const total = breakdown.telhado.count + breakdown.solo.count
  if (total === 0) return null

  const rows = [
    { label: "Telhado", data: breakdown.telhado, color: "bg-blue-500" },
    { label: "Solo", data: breakdown.solo, color: "bg-amber-500" },
  ] as const

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
        Tipo de instalação
      </h3>
      <div className="space-y-2.5">
        {rows.map(({ label, data, color }) => {
          const pct = total > 0 ? Math.round((data.count / total) * 100) : 0
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">{label}</span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-foreground w-8">{pct}%</span>
              <span className="text-xs text-muted-foreground w-8">{data.count}x</span>
              <span className="text-xs font-semibold text-foreground w-20 text-right">
                {formatBRL(data.totalValue)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
        {data.avgMargin != null && (
          <KpiCard
            label="Margem média"
            value={`${data.avgMargin.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
            color="bg-emerald-50 text-emerald-800"
          />
        )}
      </div>

      {/* Installation breakdown */}
      <InstallationBreakdown breakdown={data.installationBreakdown} />

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_VARIANTS[p.negotiationStatus as NegotiationStatus]} className="text-xs">
                      {STATUS_LABELS[p.negotiationStatus as NegotiationStatus]}
                    </Badge>
                    <span className={`text-xs ${p.daysSinceUpdate > 10 ? "text-red-500" : "text-muted-foreground"}`}>
                      {p.daysSinceUpdate} dias
                    </span>
                    {p.crmContractDate && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        ✓ Contrato{" "}
                        {format(parseISO(p.crmContractDate), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    )}
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors in `proposals-panorama-tab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/proposals/proposals-panorama-tab.tsx
git commit -m "feat: panorama v2 — avg margin KPI, installation breakdown, CRM contract badge"
```

---

## Chunk 4: Margin Approval UI + Page Integrations

### Task 7: Vendedor UI — proposal-price-approval.tsx

**Files:**
- Create: `src/components/admin/proposals/proposal-price-approval.tsx`

This is a Client Component. It shows the "Cliente está achando caro?" section below the analyst chat status pills. When no approval exists, it shows a button to request. When an approval exists, it shows the status badge and ADM result.

- [ ] **Step 1: Create the component**

```typescript
// src/components/admin/proposals/proposal-price-approval.tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { requestPriceApproval, type PriceApprovalRecord } from "@/app/actions/price-approval"
import { ChevronDown, ChevronRight } from "lucide-react"

type Props = {
  proposalId: string
  initialApproval: PriceApprovalRecord | null
  currentMargin: number | null
  currentValue: number | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando ADM",
  approved: "Aprovado",
  rejected: "Não aprovado",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
}

function formatBRL(value: number | null) {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ProposalPriceApproval({
  proposalId,
  initialApproval,
  currentMargin,
  currentValue,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [approval, setApproval] = useState<PriceApprovalRecord | null>(initialApproval)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      try {
        await requestPriceApproval(proposalId, note.trim() || undefined)
        // Optimistic update — show pending status immediately
        setApproval({
          id: "optimistic",
          proposal_id: proposalId,
          requested_by: "",
          approved_by: null,
          status: "pending",
          vendedor_note: note.trim() || null,
          original_margin: currentMargin,
          original_value: currentValue,
          adm_min_margin: null,
          new_value: null,
          adm_note: null,
          requested_at: new Date().toISOString(),
          resolved_at: null,
        })
        setNote("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao solicitar revisão")
      }
    })
  }

  const hasPending = approval?.status === "pending"
  const isApproved = approval?.status === "approved"
  const isRejected = approval?.status === "rejected"

  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Cliente está achando caro?
        {hasPending && (
          <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            Pendente
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* No approval yet — show request form */}
          {!approval && (
            <>
              <Textarea
                placeholder="Contexto para o ADM (opcional): ex. cliente tem proposta concorrente de R$X"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                size="sm"
                variant="outline"
                className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
                onClick={handleRequest}
                disabled={isPending}
              >
                {isPending ? "Solicitando…" : "Solicitar revisão de margem"}
              </Button>
            </>
          )}

          {/* Approval exists — show status */}
          {approval && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[approval.status]}`}
                >
                  {STATUS_LABELS[approval.status]}
                </span>
              </div>

              {approval.vendedor_note && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{approval.vendedor_note}&rdquo;
                </p>
              )}

              {isApproved && approval.adm_min_margin != null && (
                <div className="rounded-lg bg-emerald-50 p-2.5 space-y-1">
                  <p className="text-xs font-semibold text-emerald-800">
                    Margem mínima aprovada: {approval.adm_min_margin}%
                  </p>
                  {approval.new_value != null && (
                    <p className="text-xs text-emerald-700">
                      Novo valor sugerido: {formatBRL(approval.new_value)}
                    </p>
                  )}
                </div>
              )}

              {isRejected && (
                <div className="rounded-lg bg-red-50 p-2.5">
                  <p className="text-xs font-semibold text-red-800">Revisão não aprovada pelo ADM</p>
                  {approval.adm_note && (
                    <p className="text-xs text-red-700 mt-0.5">{approval.adm_note}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/proposals/proposal-price-approval.tsx
git commit -m "feat: add ProposalPriceApproval vendedor UI component"
```

---

### Task 8: ADM queue — proposals-adm-approvals.tsx

**Files:**
- Create: `src/components/admin/proposals/proposals-adm-approvals.tsx`

This is a Client Component. It shows the ADM approval queue as a collapsible card above the tabs on the proposals page. Each item shows client name, current margin, vendedor note, a margin % input, and approve/reject buttons.

- [ ] **Step 1: Create the component**

```typescript
// src/components/admin/proposals/proposals-adm-approvals.tsx
"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronRight, Clock } from "lucide-react"
import {
  approvePriceApproval,
  rejectPriceApproval,
  type PendingApprovalItem,
} from "@/app/actions/price-approval"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

type Props = {
  initialPending: PendingApprovalItem[]
}

function formatBRL(value: number | null) {
  if (value == null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function ApprovalCard({
  item,
  onResolved,
}: {
  item: PendingApprovalItem
  onResolved: (id: string) => void
}) {
  const [admMargin, setAdmMargin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    const margin = parseFloat(admMargin)
    if (isNaN(margin) || margin <= 0 || margin >= 100) {
      setError("Informe uma margem válida entre 0 e 100%")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await approvePriceApproval(item.id, margin)
        onResolved(item.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao aprovar")
      }
    })
  }

  function handleReject() {
    setError(null)
    startTransition(async () => {
      try {
        await rejectPriceApproval(item.id)
        onResolved(item.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao rejeitar")
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{item.clientName}</p>
          <p className="text-xs text-muted-foreground">
            por {item.requesterName} ·{" "}
            {format(parseISO(item.requested_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Margem atual</p>
          <p className="text-sm font-bold">
            {item.original_margin != null ? `${item.original_margin}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{formatBRL(item.original_value)}</p>
        </div>
      </div>

      {item.vendedor_note && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-amber-300 pl-2">
          &ldquo;{item.vendedor_note}&rdquo;
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="number"
            min={1}
            max={99}
            step={0.5}
            placeholder="Margem mín. % (ex: 12)"
            value={admMargin}
            onChange={(e) => setAdmMargin(e.target.value)}
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleApprove}
          disabled={isPending}
        >
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={handleReject}
          disabled={isPending}
        >
          Rejeitar
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ProposalsAdmApprovals({ initialPending }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [pending, setPending] = useState<PendingApprovalItem[]>(initialPending)

  function handleResolved(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id))
  }

  if (pending.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-amber-700" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-700" />
        )}
        <Clock className="h-4 w-4 text-amber-700" />
        <span className="text-sm font-bold text-amber-800">
          Revisões de margem pendentes
        </span>
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold h-5 w-5">
          {pending.length}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {pending.map((item) => (
            <ApprovalCard key={item.id} item={item} onResolved={handleResolved} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/proposals/proposals-adm-approvals.tsx
git commit -m "feat: add ProposalsAdmApprovals ADM queue component"
```

---

### Task 9: Wire approval UI into the proposal edit page

**Files:**
- Modify: `src/app/admin/orcamentos/[id]/editar/page.tsx`

The edit page already loads `analystMessages` and `negotiationStatus`. We add: load the latest approval record, pass `currentMargin` and `currentValue` from the proposal, render `ProposalPriceApproval` below the `ProposalAnalystChat` in the right panel.

- [ ] **Step 1: Add the import and load the approval**

At the top of the file, add the import:

```typescript
import { getProposalPriceApproval } from "@/app/actions/price-approval"
import { ProposalPriceApproval } from "@/components/admin/proposals/proposal-price-approval"
```

In the `try { ... }` block that loads `analystMessages`, extend it to also load the approval:

Replace:
```typescript
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

With:
```typescript
    let initialApproval: Awaited<ReturnType<typeof getProposalPriceApproval>> = null

    try {
      const [msgs, neg, approval] = await Promise.all([
        getSalesAnalystConversation(id),
        getNegotiationRecord(id),
        getProposalPriceApproval(id),
      ])
      analystMessages = msgs
      negotiationStatus = (neg?.negotiation_status ?? "sem_contato") as NegotiationStatus
      initialApproval = approval
    } catch {
      // Non-blocking — chat is additive, page still works without it
    }
```

- [ ] **Step 2: Render ProposalPriceApproval in the right panel**

In the JSX return, inside the right panel `<div>`, after the closing `<ProposalAnalystChat ... />` tag, add:

```typescript
              <ProposalPriceApproval
                proposalId={id}
                initialApproval={initialApproval}
                currentMargin={proposal.profit_margin ?? null}
                currentValue={proposal.total_value ?? null}
              />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/orcamentos/[id]/editar/page.tsx
git commit -m "feat: wire ProposalPriceApproval into edit page chat panel"
```

---

### Task 10: Wire ADM approval queue into proposals page

**Files:**
- Modify: `src/app/admin/orcamentos/page.tsx`

ADM roles (`adm_dorata`, `adm_mestre`) should see the pending approvals queue above the tabs, with a badge on the page title.

- [ ] **Step 1: Add imports**

Add to the top of the file:

```typescript
import { getPendingApprovals } from "@/app/actions/price-approval"
import { ProposalsAdmApprovals } from "@/components/admin/proposals/proposals-adm-approvals"
```

- [ ] **Step 2: Load pending approvals for ADM roles**

After the existing `panoramaData` load line:

```typescript
    const panoramaData = isAdmin ? await getSalesAnalystPanorama().catch(() => null) : null
```

Add:

```typescript
    const pendingApprovals = isAdmin
      ? await getPendingApprovals().catch(() => [])
      : []
```

- [ ] **Step 3: Add badge to the page title**

In the JSX, the current title is:

```typescript
                <h2 className="text-3xl font-bold tracking-tight">Orçamentos</h2>
```

Replace with:

```typescript
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                  Orçamentos
                  {pendingApprovals.length > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold h-5 px-1.5 min-w-5">
                      {pendingApprovals.length}
                    </span>
                  )}
                </h2>
```

- [ ] **Step 4: Render the ADM approvals queue above the tabs**

In the JSX, find the `<ProposalsTabsClient ... />` component and render `ProposalsAdmApprovals` immediately before it:

```typescript
            {isAdmin && pendingApprovals.length > 0 && (
              <ProposalsAdmApprovals initialPending={pendingApprovals} />
            )}

            <ProposalsTabsClient
              ...
            />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: All tests pass (same count as before + the new price-approval-utils tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/orcamentos/page.tsx
git commit -m "feat: wire ProposalsAdmApprovals queue + badge into proposals page"
```

---

## Final Checklist

- [ ] All 9 tests in `price-approval-utils.test.ts` pass
- [ ] `npx tsc --noEmit` exits clean
- [ ] Migration `129_proposal_price_approvals.sql` exists and is syntactically valid SQL
- [ ] `database.ts` contains the `proposal_price_approvals` type
- [ ] `getProposalPriceApproval`, `requestPriceApproval`, `getPendingApprovals`, `approvePriceApproval`, `rejectPriceApproval` are all exported from `price-approval.ts`
- [ ] `getSalesAnalystPanorama` returns `avgMargin`, `installationBreakdown`, and `crmContractDate` on proposals
- [ ] Panorama tab renders avg margin KPI card when data is non-null
- [ ] Panorama tab renders installation breakdown bar
- [ ] Panorama tab renders blue "✓ Contrato DD/MM/YY" badge when `crmContractDate` is present
- [ ] Edit page renders `ProposalPriceApproval` in the right panel
- [ ] Proposals page renders `ProposalsAdmApprovals` queue for ADM roles
- [ ] Proposals page shows amber badge on title when there are pending approvals
