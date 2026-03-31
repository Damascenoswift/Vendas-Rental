# Proposals: Panorama v2 + Margin Approval — Design Spec

**Date:** 2026-03-30
**Branch:** claude/crazy-yalow (continues from sales-analyst feature)
**Scope:** Three independent enhancements to the Dorata proposals module

---

## Overview

Three features are added to the existing proposals module:

1. **CRM conversion date** — auto-detect when a linked CRM card reaches "Contrato Assinado" and display the date on the proposal
2. **Panorama v2** — add average margin KPI and solo vs telhado breakdown (count + R$ value) to the existing Panorama tab
3. **Margin approval flow** — vendedor flags "cliente está achando caro", ADM Dorata sets a minimum accepted margin %, system recalculates value, notification goes to vendedor

---

## Feature 1: CRM Conversion Date

### Data chain

```
proposals.client_id → indicacoes.id ← crm_cards.indicacao_id
crm_cards.stage_id → crm_stages.name = "Contrato Assinado"
crm_cards.stage_entered_at = date the card entered that stage
```

### Behavior

- When loading proposals for the Panorama tab or the Lista tab, join via `indicacoes` → `crm_cards` to find any card currently in the "Contrato Assinado" stage for the Dorata pipeline.
- If found, `crm_cards.stage_entered_at` is the contract date.
- Display as a blue badge: **"✓ Contrato 12/03/26"** on the proposal row.
- If no card or card not in that stage: no badge shown.
- This is read-only — no write operation needed.

### Implementation notes

- Query pattern: `crm_cards` joined to `crm_stages` filtering `brand = 'dorata'` and `name = 'Contrato Assinado'` and `is_closed = true`.
- Add `crmContractDate: string | null` to `PanoramaProposal` type in `sales-analyst.ts`.
- Update `getSalesAnalystPanorama()` to fetch and include this date.

---

## Feature 2: Panorama v2 — New KPIs

### New KPI: Average margin

- Compute across all proposals that have a recorded margin.
- Formula: `avg(profit_margin)` where `profit_margin IS NOT NULL` (proposals without a margin are simply excluded — no join to `proposal_negotiations` needed).
- Display as a new emerald KPI card: **"18,4% — Margem média"**.

### New breakdown: Solo vs Telhado

- Derive installation type from `calculation` JSON. The correct path is `calculation.input.structure.qtd_placas_solo` and `calculation.input.structure.qtd_placas_telhado` (the `calculation` column stores `{ input: ProposalCalcInput, output: ... }`, and `ProposalCalcInput.structure` holds the plate counts):
  - `qtd_placas_solo > 0` and `qtd_placas_telhado = 0` → **Solo**
  - `qtd_placas_telhado > 0` and `qtd_placas_solo = 0` → **Telhado**
  - Both > 0 → **Misto** (count separately or merge into Telhado for simplicity)
  - Neither field present or `calculation` is null → skip from breakdown
- Show horizontal bar with percentage + count + R$ value for each type.

### Type additions

```ts
// in PanoramaData (actions/sales-analyst.ts)
installationBreakdown: {
  telhado: { count: number; totalValue: number }
  solo: { count: number; totalValue: number }
}
avgMargin: number | null
```

---

## Feature 3: Margin Approval Flow

### New DB table: `proposal_price_approvals`

```sql
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
```

**RLS:**
- Vendedor: select/insert own proposals (`proposals.seller_id = auth.uid()`)
- adm_dorata / adm_mestre: select + update all
- service_role: full access

### New server actions: `src/app/actions/price-approval.ts`

```ts
// "use server"
requestPriceApproval(proposalId, vendedorNote?)
  → inserts row with status='pending', captures original_margin + original_value

getPendingApprovals()
  → for ADM only, returns all status='pending' rows with proposal + client data

approvePriceApproval(approvalId, admMinMargin)
  → calculates new_value from admMinMargin + existing cost structure
  → updates row (status='approved', adm_min_margin, new_value, resolved_at, approved_by)
  → dispatches notification to vendedor

rejectPriceApproval(approvalId, admNote?)
  → updates row (status='rejected', resolved_at)
  → dispatches notification to vendedor

getProposalPriceApproval(proposalId)
  → returns latest approval record for a proposal (any status)
```

### Value recalculation

When ADM sets `adm_min_margin` (e.g. 12%), the new value is:

```
new_value = (COALESCE(equipment_cost, 0) + COALESCE(labor_cost, 0) + COALESCE(additional_cost, 0))
            / (1 - adm_min_margin / 100)
```

All three cost columns are nullable on `proposals`, so each must be wrapped in `COALESCE(..., 0)`. If all three are null (i.e. the proposal was created without itemised costs), fall back to:

```
new_value = original_value * (1 - original_margin / 100) / (1 - adm_min_margin / 100)
```

where `original_value` and `original_margin` are captured at request time.

This uses the cost columns already on the `proposals` table. The result is stored in `new_value` on the approval record — **the original `proposals` record is not modified**. The vendedor decides whether to present this new value to the client.

### UI changes

**Proposal edit page — chat panel (right side):**
- Below the status pills, add a collapsible section: **"Cliente está achando caro?"**
- Button: **"Solicitar revisão de margem"** (amber, only visible if no pending approval exists)
- Optional text field for vendedor to add context ("cliente tem proposta do concorrente de R$X")
- If approval exists: show status badge (pending / approved / rejected) and the ADM's result

**New component:** `src/components/admin/proposals/proposal-price-approval.tsx`
- Client component
- Props: `proposalId`, `initialApproval` (from server), `currentMargin`, `currentValue`

**Proposals page — new "Aprovações" section for ADM:**
- Shown only for `adm_dorata` and `adm_mestre`
- Small badge on the page title when there are pending approvals
- A collapsible card above the tabs (not a new tab) listing pending approvals
- Each card shows: client name, current margin, vendedor note, margin input field, approve/reject buttons

### Notification

Uses existing `dispatchNotificationEvent` from `notification-service.ts` with the `SYSTEM_GENERIC` event key (already present in the `NotificationEventKey` union — no extension needed).

When ADM approves or rejects:
- Target: the vendedor (`requested_by` user)
- Event key: `"SYSTEM_GENERIC"`
- Domain: `"SYSTEM"` (no sector field — `SYSTEM_GENERIC` is domain-agnostic)
- Title: `"Revisão de margem — [ClientName]"`
- Message: `"ADM aprovou margem mínima de X%. Novo valor sugerido: R$ Y"` or `"ADM não aprovou a revisão de margem para [ClientName]"`

---

## Files Changed

> **Context:** `src/app/actions/sales-analyst.ts` was created as part of the preceding Sales Analyst feature (branch `claude/crazy-yalow`). It does not exist on `main` yet; it will be available in this branch after that work merges (or continues here). The "Modify" action below refers to extending that already-created file.

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/129_proposal_price_approvals.sql` | Create | New table + RLS + grants |
| `src/types/database.ts` | Modify | Add `proposal_price_approvals` table type |
| `src/app/actions/price-approval.ts` | Create | Server actions for approval flow |
| `src/app/actions/sales-analyst.ts` | Modify (extends prior feature) | Add avg margin, installation breakdown, CRM date to panorama |
| `src/components/admin/proposals/proposals-panorama-tab.tsx` | Modify | Render new KPIs and breakdown |
| `src/components/admin/proposals/proposal-price-approval.tsx` | Create | Vendedor's "solicitar revisão" UI |
| `src/components/admin/proposals/proposals-adm-approvals.tsx` | Create | ADM queue component |
| `src/app/admin/orcamentos/[id]/editar/page.tsx` | Modify | Load and pass approval data to chat panel |
| `src/app/admin/orcamentos/page.tsx` | Modify | Load pending approvals for ADM, show badge + queue |

---

## Out of Scope (v1)

- Modifying the `proposals.total_value` or `proposals.profit_margin` columns — the approved value lives only in `proposal_price_approvals.new_value`
- Email or WhatsApp notification — uses in-app notification only
- Multiple approval rounds per proposal — latest record wins
- Approval history/audit log UI (data is stored, UI is future)
- Mobile layout optimization

---

## Auth / Roles

| Action | adm_mestre | adm_dorata | vendedor / funcionario |
|--------|-----------|------------|------------------------|
| Request price approval | ✓ | ✓ | ✓ (own proposals only) |
| See pending approvals queue | ✓ | ✓ | ✗ |
| Approve / reject | ✓ | ✓ | ✗ |
| See CRM contract date | ✓ | ✓ | ✗ |
| See panorama new KPIs | ✓ | ✓ | ✗ |

> **Note:** `requestPriceApproval` is accessible to any authenticated user who owns the proposal (vendedor/funcionario), not only ADM roles. The other actions remain ADM-only.
