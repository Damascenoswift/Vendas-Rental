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
    return Math.max(1, diff + 1)
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
        // upsert diretamente — já sabemos que é melhor, evita segunda leitura
        const supabase = await createClient()
        await supabase
            .from("task_personal_records")
            .upsert(
                {
                    user_id: userId,
                    benchmark_id: benchmark.id,
                    best_business_days: actual,
                    achieved_at: new Date().toISOString(),
                },
                { onConflict: "user_id,benchmark_id" }
            )
    }

    return {
        benchmark,
        actual_business_days: actual,
        is_personal_best: isPersonalBest,
        previous_best: previousBest,
    }
}

/** Server Action wrapper — resolve userId da sessão atual. */
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

export type PersonalHistoryEntry = {
    benchmark: TaskTimeBenchmark
    record: TaskPersonalRecord | null
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
        .order("label")

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
        total_completed: 0,
        within_deadline: 0,
    }))
}

/** CRUD para admin */
export async function createBenchmark(data: {
    department: Department
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
