"use server"

import { createClient } from "@/lib/supabase/server"
import type { Department } from "@/services/task-service"
import { evaluateTaskCompletion } from "@/services/task-benchmark-service"
import type { PerformanceResult, TaskTimeBenchmark } from "@/services/task-benchmark-service"

export type { PerformanceResult }

/** Server Action — resolve userId da sessão atual e avalia desempenho ao concluir tarefa. */
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

/** Server Action — cria novo benchmark (admin). */
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

/** Server Action — atualiza benchmark existente (admin). */
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
