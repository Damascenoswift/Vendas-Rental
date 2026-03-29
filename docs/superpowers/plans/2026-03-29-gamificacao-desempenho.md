# Gamificação de Desempenho por Tempo — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada funcionário acompanhe seu próprio desempenho de tempo em tarefas e obras, comparando com metas configuradas pelo admin, com feedback visual ao concluir e histórico pessoal na página Arena.

**Architecture:** Duas novas tabelas no banco (`task_time_benchmarks` e `task_personal_records`). Um serviço de benchmark centraliza leitura/escrita de metas e recordes. O "Minha Semana" é expandido para incluir obras e um widget de desempenho. O KanbanBoard dispara toast de performance ao mover tarefa para DONE. A página Arena exibe histórico pessoal por categoria.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgreSQL), TypeScript, shadcn/ui, Tailwind CSS, Zustand (toast store), Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-gamificacao-desempenho-design.md`

---

## Chunk 1: Data Layer — Migration + Benchmark Service

### Task 1: Migration 124 — Criar tabelas de benchmark

**Files:**
- Create: `supabase/migrations/124_task_time_benchmarks.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/124_task_time_benchmarks.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.task_time_benchmarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department text NOT NULL,
    label text NOT NULL,
    expected_business_days integer NOT NULL CHECK (expected_business_days > 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_personal_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    benchmark_id uuid NOT NULL REFERENCES public.task_time_benchmarks(id) ON DELETE CASCADE,
    best_business_days integer NOT NULL CHECK (best_business_days > 0),
    achieved_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, benchmark_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_task_time_benchmarks_department
    ON public.task_time_benchmarks (department)
    WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_task_personal_records_user_id
    ON public.task_personal_records (user_id);

-- RLS
ALTER TABLE public.task_time_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_personal_records ENABLE ROW LEVEL SECURITY;

-- Benchmarks: leitura pública para autenticados, escrita apenas admin
CREATE POLICY "benchmarks_select" ON public.task_time_benchmarks
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "benchmarks_insert" ON public.task_time_benchmarks
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    );

CREATE POLICY "benchmarks_update" ON public.task_time_benchmarks
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('adm_mestre', 'supervisor')
        )
    );

-- Personal records: cada usuário vê e escreve apenas os seus
CREATE POLICY "personal_records_select" ON public.task_personal_records
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "personal_records_upsert" ON public.task_personal_records
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "personal_records_update" ON public.task_personal_records
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

COMMIT;
```

- [ ] **Step 2: Aplicar migration localmente**

```bash
npx supabase db push
```
Expected: migration aplicada sem erros.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/124_task_time_benchmarks.sql
git commit -m "feat(db): add task_time_benchmarks and task_personal_records tables"
```

---

### Task 2: Serviço de benchmark

**Files:**
- Create: `src/services/task-benchmark-service.ts`
- Create: `src/services/__tests__/task-benchmark-service.test.ts`

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// src/services/__tests__/task-benchmark-service.test.ts
import { describe, expect, it } from "vitest"
import { computeActualBusinessDays, shouldUpdatePersonalRecord } from "@/services/task-benchmark-service"

describe("computeActualBusinessDays", () => {
    it("retorna 1 para tarefas concluídas no mesmo dia útil", () => {
        const start = new Date("2026-03-23T09:00:00Z") // segunda
        const end = new Date("2026-03-23T17:00:00Z")   // mesmo dia
        expect(computeActualBusinessDays(start, end)).toBe(1)
    })

    it("retorna 2 para tarefas de segunda a terça", () => {
        const start = new Date("2026-03-23T09:00:00Z") // segunda
        const end = new Date("2026-03-24T17:00:00Z")   // terça
        expect(computeActualBusinessDays(start, end)).toBe(2)
    })

    it("não conta fim de semana", () => {
        const start = new Date("2026-03-27T09:00:00Z") // sexta
        const end = new Date("2026-03-30T09:00:00Z")   // segunda
        expect(computeActualBusinessDays(start, end)).toBe(2)
    })
})

describe("shouldUpdatePersonalRecord", () => {
    it("retorna true quando não há recorde anterior", () => {
        expect(shouldUpdatePersonalRecord(null, 3)).toBe(true)
    })

    it("retorna true quando novo tempo é melhor", () => {
        expect(shouldUpdatePersonalRecord(5, 3)).toBe(true)
    })

    it("retorna false quando novo tempo é igual ou pior", () => {
        expect(shouldUpdatePersonalRecord(3, 3)).toBe(false)
        expect(shouldUpdatePersonalRecord(3, 5)).toBe(false)
    })
})
```

- [ ] **Step 2: Rodar testes para confirmar que falham**

```bash
npx vitest run src/services/__tests__/task-benchmark-service.test.ts
```
Expected: FAIL — `computeActualBusinessDays` not found.

- [ ] **Step 3: Implementar o serviço**

```typescript
// src/services/task-benchmark-service.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { differenceInBusinessDays } from "@/lib/business-days"
import type { Department } from "@/services/task-service"

export type TaskTimeBenchmark = {
    id: string
    department: string
    label: string
    expected_business_days: number
    active: boolean
    created_at: string
    updated_at: string
}

export type TaskPersonalRecord = {
    id: string
    user_id: string
    benchmark_id: string
    best_business_days: number
    achieved_at: string
}

export type PerformanceResult = {
    benchmark: TaskTimeBenchmark
    actual_business_days: number
    is_personal_best: boolean
    previous_best: number | null
}

/** Calcula dias úteis entre duas datas. Mínimo 1. */
export function computeActualBusinessDays(start: Date, end: Date): number {
    const diff = differenceInBusinessDays(start, end)
    return Math.max(1, diff)
}

/** Retorna true se `newDays` é melhor (menor) que o recorde atual. */
export function shouldUpdatePersonalRecord(
    currentBest: number | null,
    newDays: number
): boolean {
    if (currentBest === null) return true
    return newDays < currentBest
}

/** Busca todos os benchmarks ativos de um departamento. */
export async function getBenchmarksByDepartment(
    department: Department
): Promise<TaskTimeBenchmark[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_time_benchmarks")
        .select("*")
        .eq("department", department)
        .eq("active", true)
        .order("label")

    if (error) {
        console.error("getBenchmarksByDepartment error:", error.message)
        return []
    }
    return (data ?? []) as TaskTimeBenchmark[]
}

/** Busca o primeiro benchmark ativo para um departamento (match genérico). */
export async function getDefaultBenchmarkForDepartment(
    department: Department
): Promise<TaskTimeBenchmark | null> {
    const benchmarks = await getBenchmarksByDepartment(department)
    return benchmarks[0] ?? null
}

/** Busca todos os benchmarks (admin). */
export async function getAllBenchmarks(): Promise<TaskTimeBenchmark[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_time_benchmarks")
        .select("*")
        .order("department")
        .order("label")

    if (error) {
        console.error("getAllBenchmarks error:", error.message)
        return []
    }
    return (data ?? []) as TaskTimeBenchmark[]
}

/** Busca o recorde pessoal do usuário para um benchmark. */
export async function getPersonalRecord(
    userId: string,
    benchmarkId: string
): Promise<TaskPersonalRecord | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("task_personal_records")
        .select("*")
        .eq("user_id", userId)
        .eq("benchmark_id", benchmarkId)
        .maybeSingle()

    if (error) return null
    return data as TaskPersonalRecord | null
}

/** Atualiza o recorde pessoal se `newDays` for melhor. */
export async function upsertPersonalRecordIfBetter(
    userId: string,
    benchmarkId: string,
    newDays: number
): Promise<{ updated: boolean }> {
    const existing = await getPersonalRecord(userId, benchmarkId)
    if (!shouldUpdatePersonalRecord(existing?.best_business_days ?? null, newDays)) {
        return { updated: false }
    }

    const supabase = await createClient()
    const { error } = await supabase
        .from("task_personal_records")
        .upsert(
            {
                user_id: userId,
                benchmark_id: benchmarkId,
                best_business_days: newDays,
                achieved_at: new Date().toISOString(),
            },
            { onConflict: "user_id,benchmark_id" }
        )

    if (error) {
        console.error("upsertPersonalRecord error:", error.message)
        return { updated: false }
    }
    return { updated: true }
}

/** Avalia desempenho ao concluir uma tarefa. Retorna resultado ou null se sem benchmark. */
export async function evaluateTaskCompletion(
    userId: string,
    department: Department,
    startedAt: Date,
    completedAt: Date
): Promise<PerformanceResult | null> {
    const benchmark = await getDefaultBenchmarkForDepartment(department)
    if (!benchmark) return null

    const actual = computeActualBusinessDays(startedAt, completedAt)
    const existing = await getPersonalRecord(userId, benchmark.id)
    const previousBest = existing?.best_business_days ?? null
    const isPersonalBest = shouldUpdatePersonalRecord(previousBest, actual)

    if (isPersonalBest) {
        await upsertPersonalRecordIfBetter(userId, benchmark.id, actual)
    }

    return {
        benchmark,
        actual_business_days: actual,
        is_personal_best: isPersonalBest,
        previous_best: previousBest,
    }
}

/** CRUD para admin */
export async function createBenchmark(data: {
    department: string
    label: string
    expected_business_days: number
}): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { error } = await supabase
        .from("task_time_benchmarks")
        .insert({ ...data, active: true })

    if (error) return { error: error.message }
    return {}
}

export async function updateBenchmark(
    id: string,
    data: Partial<Pick<TaskTimeBenchmark, "label" | "expected_business_days" | "active">>
): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { error } = await supabase
        .from("task_time_benchmarks")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)

    if (error) return { error: error.message }
    return {}
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run src/services/__tests__/task-benchmark-service.test.ts
```
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/services/task-benchmark-service.ts src/services/__tests__/task-benchmark-service.test.ts
git commit -m "feat(benchmark): add task-benchmark-service with personal record tracking"
```

---

## Chunk 2: Minha Semana — Obras + Widget de Desempenho

### Task 3: Expandir o serviço Minha Semana para incluir obras

**Files:**
- Modify: `src/services/task-personal-weekly-service.ts`

- [ ] **Step 1: Adicionar tipo e função para obras ativas no serviço**

Abrir `src/services/task-personal-weekly-service.ts` e adicionar ao final do arquivo:

```typescript
// --- OBRAS EM ANDAMENTO ---

export type ActiveWorkSummary = {
    id: string
    title: string | null
    work_address: string | null
    status: string
    phase: "PROJETO" | "EXECUCAO" | null
    execution_deadline_at: string | null
    execution_deadline_business_days: number | null
    completed_at: string | null
    elapsed_business_days: number | null
    is_overdue: boolean
}

export async function getActiveWorksForUser(userId: string): Promise<ActiveWorkSummary[]> {
    const supabase = await createClient()

    // work_cards tem coluna user_id (migration 087) — filtrar diretamente pelo responsável
    const { data, error } = await supabase
        .from("work_cards")
        .select(`
            id,
            title,
            work_address,
            status,
            execution_deadline_at,
            execution_deadline_business_days,
            completed_at,
            created_at
        `)
        .eq("user_id", userId)
        .in("status", ["PARA_INICIAR", "EM_ANDAMENTO"])
        .order("execution_deadline_at", { ascending: true })
        .limit(10)

    if (error) {
        console.error("getActiveWorksForUser error:", error.message)
        return []
    }

    const now = new Date()
    return (data ?? []).map((row) => {
        const deadline = row.execution_deadline_at ? new Date(row.execution_deadline_at) : null
        const isOverdue = deadline ? now > deadline : false

        // elapsed = dias úteis desde criação da obra até hoje
        const startedAt = new Date(row.created_at)
        const elapsed = differenceInBusinessDays(startedAt, now)

        return {
            id: row.id,
            title: row.title,
            work_address: row.work_address,
            status: row.status,
            phase: null,
            execution_deadline_at: row.execution_deadline_at,
            execution_deadline_business_days: row.execution_deadline_business_days,
            completed_at: row.completed_at,
            elapsed_business_days: elapsed,
            is_overdue: isOverdue,
        }
    })
}

- [ ] **Step 2: Verificar campo de responsável em work_cards**

```bash
grep -n "responsible\|assignee\|user_id" /Users/guilhermedamasceno/01\ DEV/rental-v2-clean/src/services/work-cards-service.ts | head -20
```

Adaptar a query de `getActiveWorksForUser` conforme o campo real de responsável.

- [ ] **Step 3: Rodar build para verificar tipos**

```bash
npm run check
```
Expected: sem erros de tipo no serviço modificado.

- [ ] **Step 4: Commit**

```bash
git add src/services/task-personal-weekly-service.ts
git commit -m "feat(semana): expose getActiveWorksForUser in weekly service"
```

---

### Task 4: Widget de desempenho semanal — componente

**Files:**
- Create: `src/components/admin/tasks/task-performance-widget.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/admin/tasks/task-performance-widget.tsx
import Link from "next/link"
import { Activity } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type WeeklyPerformanceSummary = {
    withinDeadline: number
    outsideDeadline: number
    rate: number // 0-100
    badges: string[]
}

export function TaskPerformanceWidget({
    summary,
}: {
    summary: WeeklyPerformanceSummary
}) {
    return (
        <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-green-900">
                    <Activity className="h-4 w-4 text-green-700" />
                    Seu desempenho esta semana
                </CardTitle>
                <Link
                    href="/dashboard/arena"
                    className="text-xs text-green-700 hover:underline"
                >
                    Ver histórico completo →
                </Link>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="mb-3 grid grid-cols-3 divide-x divide-green-100">
                    <div className="pr-4 text-center">
                        <p className="text-xl font-bold text-green-700">{summary.withinDeadline}</p>
                        <p className="text-xs text-muted-foreground">Dentro do prazo</p>
                    </div>
                    <div className="px-4 text-center">
                        <p className="text-xl font-bold text-destructive">{summary.outsideDeadline}</p>
                        <p className="text-xs text-muted-foreground">Fora do prazo</p>
                    </div>
                    <div className="pl-4 text-center">
                        <p className="text-xl font-bold text-amber-600">{summary.rate}%</p>
                        <p className="text-xs text-muted-foreground">Taxa no prazo</p>
                    </div>
                </div>
                {summary.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {summary.badges.map((badge) => (
                            <Badge key={badge} variant="secondary" className="text-xs">
                                {badge}
                            </Badge>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
```

- [ ] **Step 2: Verificar build**

```bash
npm run check
```
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/tasks/task-performance-widget.tsx
git commit -m "feat(semana): add TaskPerformanceWidget component"
```

---

### Task 5: Barra de tempo inline — componente

**Files:**
- Create: `src/components/admin/tasks/task-time-bar.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/admin/tasks/task-time-bar.tsx
import { cn } from "@/lib/utils"

type TaskTimeBarProps = {
    elapsedDays: number
    expectedDays: number
    className?: string
}

export function TaskTimeBar({ elapsedDays, expectedDays, className }: TaskTimeBarProps) {
    const pct = Math.min(100, Math.round((elapsedDays / expectedDays) * 100))
    const isOver = elapsedDays > expectedDays
    const isNearing = !isOver && pct >= 80

    const fillClass = isOver
        ? "bg-destructive"
        : isNearing
          ? "bg-amber-500"
          : "bg-green-500"

    const label = isOver
        ? `${elapsedDays}d / meta ${expectedDays}d`
        : `${elapsedDays}d / meta ${expectedDays}d`

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn("h-full rounded-full transition-all", fillClass)}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
        </div>
    )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/tasks/task-time-bar.tsx
git commit -m "feat(semana): add TaskTimeBar inline progress component"
```

---

### Task 6: Integrar obras e widget no TaskMyWeekDashboard

**Files:**
- Modify: `src/components/admin/tasks/task-my-week-dashboard.tsx`
- Modify: `src/app/admin/tarefas/page.tsx`

- [ ] **Step 1: Adicionar prop de obras e desempenho ao componente**

Em `task-my-week-dashboard.tsx`, adicionar imports e novas props ao tipo `TaskMyWeekDashboardProps`:

```typescript
import { TaskTimeBar } from "./task-time-bar"
import { TaskPerformanceWidget, type WeeklyPerformanceSummary } from "./task-performance-widget"
import type { ActiveWorkSummary } from "@/services/task-personal-weekly-service"
import { HardHat } from "lucide-react"

type TaskMyWeekDashboardProps = {
    summary: TaskPersonalWeeklySummary | null
    activeWorks?: ActiveWorkSummary[]
    performanceSummary?: WeeklyPerformanceSummary | null
    taskBenchmarkDays?: Record<string, number> // taskId → expected_business_days
}
```

- [ ] **Step 2: Adicionar seção de obras no JSX**

Logo antes do retorno final do componente, após a seção de resumo existente, inserir:

```tsx
{/* Obras em andamento */}
{activeWorks && activeWorks.length > 0 && (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
                <HardHat className="h-4 w-4 text-muted-foreground" />
                Obras em andamento
            </CardTitle>
            <Badge variant="secondary">{activeWorks.length}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
            {activeWorks.map((obra) => (
                <div
                    key={obra.id}
                    className={cn(
                        "rounded-md border p-3",
                        obra.is_overdue ? "border-l-destructive border-l-4" : "border-l-green-500 border-l-4"
                    )}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-sm font-medium">{obra.title ?? obra.work_address ?? obra.id}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Prazo: {obra.execution_deadline_at ? formatDate(obra.execution_deadline_at) : "—"}
                            </p>
                        </div>
                        {obra.is_overdue ? (
                            <Badge variant="destructive" className="text-xs">Atrasada</Badge>
                        ) : (
                            <Badge variant="secondary" className="text-xs text-green-700">No prazo</Badge>
                        )}
                    </div>
                    {obra.execution_deadline_business_days && obra.elapsed_business_days !== null && (
                        <div className="mt-2">
                            <TaskTimeBar
                                elapsedDays={Math.max(0, obra.elapsed_business_days)}
                                expectedDays={obra.execution_deadline_business_days}
                            />
                        </div>
                    )}
                </div>
            ))}
        </CardContent>
    </Card>
)}
```

Adicionar `import { cn } from "@/lib/utils"` se ainda não estiver importado.

- [ ] **Step 3: Adicionar barra inline às tarefas existentes**

Dentro do componente `TaskQuickList`, modificar o render de cada tarefa para incluir a barra se `taskBenchmarkDays` contiver o id:

```tsx
{taskBenchmarkDays?.[task.taskId] && (
    <TaskTimeBar
        elapsedDays={/* calcular a partir de task.createdAt até hoje */}
        expectedDays={taskBenchmarkDays[task.taskId]}
        className="mt-1"
    />
)}
```

Para calcular dias decorridos do lado cliente, passar `elapsedDays` já calculado no servidor via `taskBenchmarkDays` como `Record<string, { expected: number; elapsed: number }>`.

- [ ] **Step 4: Adicionar widget de desempenho no final**

Ao final do JSX principal (antes do `</div>` de fechamento):

```tsx
{performanceSummary && (
    <TaskPerformanceWidget summary={performanceSummary} />
)}
```

- [ ] **Step 5: Passar props do servidor na page.tsx**

Em `src/app/admin/tarefas/page.tsx`, dentro do bloco `view === "my-week"`, adicionar:

```typescript
import { getActiveWorksForUser } from "@/services/task-personal-weekly-service"

// no corpo do Server Component:
const activeWorks = user ? await getActiveWorksForUser(user.id) : []
```

E passar `activeWorks` para `<TaskMyWeekDashboard>`.

- [ ] **Step 6: Build + check**

```bash
npm run check && npm run build
```
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/tasks/task-my-week-dashboard.tsx src/app/admin/tarefas/page.tsx
git commit -m "feat(semana): integrate obras section and performance widget in Minha Semana"
```

---

## Chunk 3: Toast de Conclusão no Kanban

### Task 7: Toast de desempenho ao mover tarefa para DONE

**Files:**
- Modify: `src/components/admin/tasks/kanban-board.tsx`

- [ ] **Step 1: Importar e chamar evaluateTaskCompletion no KanbanBoard**

O `KanbanBoard` já tem acesso ao `showToast` via `useToast`. Após `updateTaskStatus` retornar sem erro e `newStatus === 'DONE'`, chamar uma Server Action que avalia o desempenho:

```typescript
// Adicionar import no topo
import { evaluateTaskCompletion } from "@/services/task-benchmark-service"

// Dentro de persistTaskStatusChange, após a linha de sucesso:
if (!result.error && newStatus === 'DONE') {
    const task = initialTasks.find(t => t.id === taskId)
    if (task?.department && task?.created_at) {
        // Buscar evento IN_PROGRESS para calcular duração real; fallback para created_at
        // A Server Action `evaluateCurrentUserTaskCompletion` resolve o userId internamente
        const perf = await evaluateCurrentUserTaskCompletion(
            task.department,
            new Date(task.created_at), // TODO: usar timestamp do evento IN_PROGRESS (task_activity_events)
            new Date()
        )
        if (perf) {
            const withinDeadline = perf.actual_business_days <= perf.benchmark.expected_business_days
            const label = perf.is_personal_best
                ? `Novo recorde pessoal! ${perf.actual_business_days}d úteis (anterior: ${perf.previous_best ?? "—"}d)`
                : withinDeadline
                  ? `Concluída dentro do prazo — ${perf.actual_business_days}d úteis (meta: ${perf.benchmark.expected_business_days}d)`
                  : `Concluída com ${perf.actual_business_days - perf.benchmark.expected_business_days}d de atraso (meta: ${perf.benchmark.expected_business_days}d)`

            showToast({
                title: perf.is_personal_best ? "Recorde pessoal!" : "Tarefa concluída",
                description: label,
                variant: perf.actual_business_days <= perf.benchmark.expected_business_days ? "success" : "info",
                duration: 6000,
            })
        }
    }
}
```

**Nota sobre userId:** O `KanbanBoard` é um Client Component. Para evitar expor o userId no client, criar uma Server Action wrapper:

```typescript
// src/services/task-benchmark-service.ts — adicionar:
export async function evaluateCurrentUserTaskCompletion(
    department: Department,
    startedAt: Date,
    completedAt: Date
): Promise<PerformanceResult | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return evaluateTaskCompletion(user.id, department, startedAt, completedAt)
}
```

Usar `evaluateCurrentUserTaskCompletion` no KanbanBoard (sem precisar de userId como prop).

- [ ] **Step 2: Build + check**

```bash
npm run check && npm run build
```
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/tasks/kanban-board.tsx src/services/task-benchmark-service.ts
git commit -m "feat(kanban): show performance toast when task is moved to DONE"
```

---

## Chunk 4: Página Arena — Histórico Pessoal

### Task 8: Serviço de histórico pessoal

**Files:**
- Modify: `src/services/task-benchmark-service.ts`

- [ ] **Step 1: Adicionar função de histórico ao serviço**

```typescript
// Adicionar em task-benchmark-service.ts:

export type PersonalHistoryEntry = {
    benchmark: TaskTimeBenchmark
    record: TaskPersonalRecord | null
    // Sem histórico temporal por ora — exibir recorde + total concluídas
    total_completed: number
    within_deadline: number
}

export async function getPersonalArenaStats(userId: string): Promise<PersonalHistoryEntry[]> {
    const supabase = await createClient()

    const { data: benchmarks } = await supabase
        .from("task_time_benchmarks")
        .select("*")
        .eq("active", true)
        .order("department")

    if (!benchmarks?.length) return []

    const { data: records } = await supabase
        .from("task_personal_records")
        .select("*")
        .eq("user_id", userId)

    const recordsByBenchmark = new Map(
        (records ?? []).map((r) => [r.benchmark_id, r as TaskPersonalRecord])
    )

    return (benchmarks as TaskTimeBenchmark[]).map((b) => ({
        benchmark: b,
        record: recordsByBenchmark.get(b.id) ?? null,
        total_completed: 0, // expandir futuramente com contagem real
        within_deadline: 0,
    }))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/task-benchmark-service.ts
git commit -m "feat(arena): add getPersonalArenaStats to benchmark service"
```

---

### Task 9: Componente e página Arena

**Files:**
- Create: `src/components/arena/task-arena-dashboard.tsx`
- Create: `src/app/dashboard/arena/page.tsx`

- [ ] **Step 1: Criar o componente Arena**

```typescript
// src/components/arena/task-arena-dashboard.tsx
import { TrendingUp, Trophy, Award } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PersonalHistoryEntry } from "@/services/task-benchmark-service"

function formatDepartment(d: string) {
    const map: Record<string, string> = {
        vendas: "Vendas", cadastro: "Cadastro", energia: "Energia",
        juridico: "Jurídico", financeiro: "Financeiro", ti: "TI",
        diretoria: "Diretoria", obras: "Obras", outro: "Outro",
    }
    return map[d] ?? d
}

export function TaskArenaDashboard({ entries }: { entries: PersonalHistoryEntry[] }) {
    if (entries.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum benchmark configurado ainda. Peça ao administrador para cadastrar as metas de tempo.
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                    <Card key={entry.benchmark.id}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-muted-foreground">
                                {formatDepartment(entry.benchmark.department)}
                            </CardTitle>
                            <p className="text-base font-semibold">{entry.benchmark.label}</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Meta</span>
                                <Badge variant="outline">
                                    {entry.benchmark.expected_business_days} dias úteis
                                </Badge>
                            </div>
                            {entry.record ? (
                                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                                    <div className="flex items-center gap-2">
                                        <Trophy className="h-4 w-4 text-amber-600" />
                                        <span className="text-sm font-medium text-amber-800">
                                            Seu recorde: {entry.record.best_business_days} dias úteis
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-amber-700">
                                        Alcançado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(entry.record.achieved_at))}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-md bg-muted p-3">
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            Ainda sem recorde. Conclua uma tarefa para aparecer aqui.
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Criar a página /dashboard/arena**

```typescript
// src/app/dashboard/arena/page.tsx
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { TrendingUp } from "lucide-react"
import { getPersonalArenaStats } from "@/services/task-benchmark-service"
import { TaskArenaDashboard } from "@/components/arena/task-arena-dashboard"

export const dynamic = "force-dynamic"

export default async function ArenaPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const entries = await getPersonalArenaStats(user.id)

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
                <div>
                    <h1 className="text-xl font-semibold">Meu Desempenho</h1>
                    <p className="text-sm text-muted-foreground">
                        Seus recordes pessoais por categoria de tarefa
                    </p>
                </div>
            </div>
            <TaskArenaDashboard entries={entries} />
        </div>
    )
}
```

- [ ] **Step 3: Build + check**

```bash
npm run check && npm run build
```
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/arena/task-arena-dashboard.tsx src/app/dashboard/arena/page.tsx
git commit -m "feat(arena): add Arena page with personal performance records"
```

---

## Chunk 5: Admin — Configuração de Benchmarks

### Task 10: UI de gestão de benchmarks para admin

**Files:**
- Create: `src/components/admin/benchmarks/benchmark-config-table.tsx`
- Create: `src/app/admin/configuracoes/benchmarks/page.tsx`

- [ ] **Step 1: Criar o componente de tabela de benchmarks**

```typescript
// src/components/admin/benchmarks/benchmark-config-table.tsx
"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { updateBenchmark } from "@/services/task-benchmark-service"
import type { TaskTimeBenchmark } from "@/services/task-benchmark-service"

const DEPARTMENT_LABELS: Record<string, string> = {
    vendas: "Vendas", cadastro: "Cadastro", energia: "Energia",
    juridico: "Jurídico", financeiro: "Financeiro", ti: "TI",
    diretoria: "Diretoria", obras: "Obras", outro: "Outro",
}

export function BenchmarkConfigTable({ initialBenchmarks }: { initialBenchmarks: TaskTimeBenchmark[] }) {
    const [benchmarks, setBenchmarks] = useState(initialBenchmarks)
    const [loading, setLoading] = useState<string | null>(null)

    async function handleToggleActive(id: string, current: boolean) {
        setLoading(id)
        const result = await updateBenchmark(id, { active: !current })
        if (!result.error) {
            setBenchmarks((prev) =>
                prev.map((b) => (b.id === id ? { ...b, active: !current } : b))
            )
        }
        setLoading(null)
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Setor</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">Dias úteis esperados</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {benchmarks.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                                Nenhum benchmark cadastrado.
                            </TableCell>
                        </TableRow>
                    )}
                    {benchmarks.map((b) => (
                        <TableRow key={b.id}>
                            <TableCell className="font-medium">
                                {DEPARTMENT_LABELS[b.department] ?? b.department}
                            </TableCell>
                            <TableCell>{b.label}</TableCell>
                            <TableCell className="text-center">{b.expected_business_days}d</TableCell>
                            <TableCell className="text-center">
                                <Badge variant={b.active ? "default" : "secondary"}>
                                    {b.active ? "Ativo" : "Inativo"}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loading === b.id}
                                    onClick={() => handleToggleActive(b.id, b.active)}
                                >
                                    {b.active ? "Desativar" : "Ativar"}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
```

- [ ] **Step 2: Criar a página de configuração**

```typescript
// src/app/admin/configuracoes/benchmarks/page.tsx
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { getAllBenchmarks } from "@/services/task-benchmark-service"
import { BenchmarkConfigTable } from "@/components/admin/benchmarks/benchmark-config-table"

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["adm_mestre", "supervisor"]

export default async function BenchmarksConfigPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const profile = await getProfile(supabase, user.id)
    if (!profile?.role || !ALLOWED_ROLES.includes(profile.role)) redirect("/dashboard")

    const benchmarks = await getAllBenchmarks()

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-xl font-semibold">Benchmarks de Tempo</h1>
                <p className="text-sm text-muted-foreground">
                    Configure os tempos esperados por categoria de tarefa para cada setor.
                </p>
            </div>
            <BenchmarkConfigTable initialBenchmarks={benchmarks} />
        </div>
    )
}
```

- [ ] **Step 3: Adicionar link no menu admin de configurações**

Verificar onde ficam os links do menu admin (provavelmente `src/app/admin/configuracoes/` ou layout) e adicionar link para `/admin/configuracoes/benchmarks`.

- [ ] **Step 4: Build + check final**

```bash
npm run check && npm run build
```
Expected: build limpo sem erros.

- [ ] **Step 5: Rodar todos os testes**

```bash
npx vitest run
```
Expected: todos os testes passando.

- [ ] **Step 6: Commit + push**

```bash
git add src/components/admin/benchmarks/ src/app/admin/configuracoes/benchmarks/
git commit -m "feat(admin): add benchmark config page for admin/supervisor"
git push -u origin claude/suspicious-kepler
```

---

## Checklist Final

- [ ] Migration 124 aplicada e commitada
- [ ] `task-benchmark-service.ts` com testes passando
- [ ] Obras aparecem no "Minha Semana" com barra de tempo
- [ ] Widget de desempenho no final do "Minha Semana"
- [ ] Toast aparece ao mover tarefa para DONE quando há benchmark
- [ ] Página `/dashboard/arena` acessível mostrando recordes pessoais
- [ ] Página `/admin/configuracoes/benchmarks` acessível para adm_mestre/supervisor
- [ ] `npm run check` sem erros
- [ ] `npm run build` sem erros
- [ ] `npx vitest run` todos os testes passando
