# Estimativa para Contrato Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um campo manual de estimativa para contrato no orcamento e propagar o valor para contrato e obras sem interferir nos calculos existentes.

**Architecture:** O valor manual sera salvo dentro do JSON `calculation` em um bloco `contract`, com helpers puros para leitura e escrita. O contrato e o snapshot tecnico de obras passarao a consumir esse helper para manter um fluxo unico e evitar duplicacao de parsing.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Vitest

---

## Chunk 1: Helpers e testes de contrato de dados

### Task 1: Criar testes para o metadata manual do contrato

**Files:**
- Create: `src/lib/__tests__/proposal-contract-metadata.test.ts`
- Create: `src/lib/proposal-contract-metadata.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  buildCalculationWithContractEstimate,
  getContractEstimateFromCalculation,
} from "@/lib/proposal-contract-metadata"

describe("proposal contract metadata", () => {
  it("stores the manual contract estimate outside the calculation base", () => {
    const calculation = buildCalculationWithContractEstimate(
      { input: {}, output: {} } as any,
      "18.500 kWh/mes",
    )

    expect(getContractEstimateFromCalculation(calculation)).toBe("18.500 kWh/mes")
    expect((calculation as any).input).toBeTruthy()
    expect((calculation as any).output).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement pure helpers to:
- normalize text
- write `contract.manual_production_estimate`
- read the same value safely from legacy calculations

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposal-contract-metadata.ts src/lib/__tests__/proposal-contract-metadata.test.ts
git commit -m "test: add contract estimate metadata helpers"
```

## Chunk 2: Propagacao para obras e contrato

### Task 2: Cobrir snapshot tecnico e template data com testes

**Files:**
- Modify: `src/services/work-cards-service.ts`
- Modify: `src/app/actions/contracts-generation.ts`
- Modify: `src/lib/__tests__/proposal-contract-metadata.test.ts`

- [ ] **Step 1: Write failing tests for snapshot and contract payload**

Add tests for:
- extracting the manual estimate into contract template data
- copying the manual estimate into work technical snapshot

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: FAIL because contract/snapshot helpers do not expose the new value yet.

- [ ] **Step 3: Implement minimal propagation**

Update code to:
- read the manual estimate from `calculation`
- add dedicated template keys for contrato
- include `contract.manual_production_estimate` in the work snapshot

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/contracts-generation.ts src/services/work-cards-service.ts src/lib/__tests__/proposal-contract-metadata.test.ts
git commit -m "feat: propagate contract estimate to contracts and works"
```

## Chunk 3: Formulario de orcamento

### Task 3: Persistir o campo manual na UI de orcamento

**Files:**
- Modify: `src/components/admin/proposals/proposal-calculator-simple.tsx`
- Modify: `src/components/admin/proposals/proposal-calculator-complete.tsx`
- Modify: `src/services/proposal-service.ts`

- [ ] **Step 1: Add a failing assertion in tests for persisted calculation metadata**

Extend helper tests so saving logic expects the built calculation object to carry the manual estimate.

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: FAIL because UI save paths are not using the helper yet.

- [ ] **Step 3: Implement minimal UI wiring**

Add a local `estimativa para contrato` state in both calculators, initialize from existing calculation, display it next to the calculated generation field, and persist it by wrapping the saved calculation with the helper before calling `createProposal` or `updateProposal`.

- [ ] **Step 4: Run targeted tests plus lint on touched files**

Run: `npx vitest run src/lib/__tests__/proposal-contract-metadata.test.ts`
Expected: PASS

Run: `npx eslint src/components/admin/proposals/proposal-calculator-simple.tsx src/components/admin/proposals/proposal-calculator-complete.tsx src/services/proposal-service.ts src/app/actions/contracts-generation.ts src/services/work-cards-service.ts src/lib/proposal-contract-metadata.ts`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/proposals/proposal-calculator-simple.tsx src/components/admin/proposals/proposal-calculator-complete.tsx src/services/proposal-service.ts
git commit -m "feat: add manual contract estimate to proposals"
```
