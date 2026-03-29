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

export type WeeklyPerformanceSummary = {
    withinDeadline: number
    outsideDeadline: number
    rate: number // 0-100
    badges: string[]
}

/**
 * Computes performance summary for the current user for a given week window.
 * Queries tasks completed (DONE) by the assignee inside the week range,
 * looks up their IN_PROGRESS → DONE duration and compares to the benchmark.
 */
export async function getWeeklyPerformanceSummary(
    userId: string,
    weekStart: Date,
    weekEnd: Date
): Promise<WeeklyPerformanceSummary> {
    const supabase = await createClient()

    // Find tasks the user completed (status=DONE) within the week
    const { data: doneTasks, error: doneError } = await supabase
        .from("tasks")
        .select("id, department, created_at")
        .eq("assignee_id", userId)
        .eq("status", "DONE")
        .gte("updated_at", weekStart.toISOString())
        .lte("updated_at", weekEnd.toISOString())
        .limit(100)

    if (doneError || !doneTasks?.length) {
        return { withinDeadline: 0, outsideDeadline: 0, rate: 0, badges: [] }
    }

    const taskIds = doneTasks.map((t) => t.id)

    // Get IN_PROGRESS event timestamps for these tasks
    const { data: events } = await supabase
        .from("task_activity_events")
        .select("task_id, event_at")
        .in("task_id", taskIds)
        .eq("event_type", "TASK_STATUS_CHANGED")
        .eq("metadata->>new_status" as string, "IN_PROGRESS")
        .order("event_at", { ascending: false })

    const inProgressAt = new Map<string, Date>()
    for (const row of (events ?? []) as Array<{ task_id: string; event_at: string }>) {
        if (!inProgressAt.has(row.task_id)) {
            inProgressAt.set(row.task_id, new Date(row.event_at))
        }
    }

    // Collect benchmarks for involved departments
    const departments = Array.from(new Set(doneTasks.map((t) => t.department).filter(Boolean))) as Department[]
    const bmMap = new Map<string, TaskTimeBenchmark>()
    for (const dept of departments) {
        const bm = await getDefaultBenchmarkForDepartment(dept)
        if (bm) bmMap.set(dept, bm)
    }

    let withinDeadline = 0
    let outsideDeadline = 0
    const newRecordDepartments: string[] = []

    for (const task of doneTasks as Array<{ id: string; department: string; created_at: string }>) {
        const bm = bmMap.get(task.department)
        if (!bm) continue

        const start = inProgressAt.get(task.id) ?? new Date(task.created_at)
        const actual = computeActualBusinessDays(start, weekEnd)
        if (actual <= bm.expected_business_days) {
            withinDeadline++
        } else {
            outsideDeadline++
        }

        const rec = await getPersonalRecord(userId, bm.id)
        if (shouldUpdatePersonalRecord(rec?.best_business_days ?? null, actual)) {
            newRecordDepartments.push(bm.label)
        }
    }

    const total = withinDeadline + outsideDeadline
    const rate = total > 0 ? Math.round((withinDeadline / total) * 100) : 0
    const badges = newRecordDepartments.map((label) => `Recorde pessoal em ${label}`)

    return { withinDeadline, outsideDeadline, rate, badges }
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
