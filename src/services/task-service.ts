"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Department = 'VENDAS' | 'CADASTRO' | 'ENERGIA' | 'JURIDICO' | 'FINANCEIRO' | 'OUTRO'

export interface Task {
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    due_date: string | null
    assignee_id: string | null
    creator_id: string | null
    indicacao_id: string | null
    client_name: string | null
    department: Department | null
    created_at: string
    assignee?: {
        name: string
        email: string
    }
    creator?: {
        name: string
    }
}

export async function getTasks(filters?: {
    department?: Department,
    assigneeId?: string,
    showAll?: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    let query = supabase
        .from('tasks')
        .select(`
            *,
            assignee:users!tasks_assignee_id_fkey(name, email),
            creator:users!tasks_creator_id_fkey(name)
        `)
        .order('created_at', { ascending: false })

    if (filters?.department) {
        query = query.eq('department', filters.department)
    }

    if (filters?.assigneeId) {
        query = query.eq('assignee_id', filters.assigneeId)
    }

    const { data, error } = await query

    if (error) {
        console.error("Error fetching tasks:", error)
        return []
    }

    // Manual casting due to joins
    return (data as any[]).map(item => ({
        ...item,
        assignee: item.assignee,
        creator: item.creator
    })) as Task[]
}

export async function createTask(data: {
    title: string
    description?: string
    priority: TaskPriority
    due_date?: string
    assignee_id?: string
    department?: Department
    indicacao_id?: string
    client_name?: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from('tasks')
        .insert({
            ...data,
            creator_id: user.id
        })

    if (error) {
        console.error("Error creating task:", error)
        return { error: error.message }
    }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
    const supabase = await createClient()

    // Authorization check is handled by RLS, but good to be safe
    const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function deleteTask(taskId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}
