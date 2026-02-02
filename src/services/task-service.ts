"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'BLOCKED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Department = 'vendas' | 'cadastro' | 'energia' | 'juridico' | 'financeiro' | 'ti' | 'diretoria' | 'outro'
export type Brand = 'rental' | 'dorata'

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
    brand: Brand
    checklist_total?: number
    checklist_done?: number
    assignee?: {
        name: string
        email: string
    }
    creator?: {
        name: string
    }
}

export interface TaskChecklistItem {
    id: string
    task_id: string
    title: string
    is_done: boolean
    sort_order: number
    created_at: string
}

export interface TaskObserver {
    user_id: string
    user: {
        name: string
        email: string
    } | null
}

export async function getTasks(filters?: {
    department?: Department,
    assigneeId?: string,
    showAll?: boolean,
    brand?: Brand
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

    if (filters?.brand) {
        query = query.eq('brand', filters.brand)
    }

    const { data, error } = await query

    if (error) {
        console.error("Error fetching tasks:", error)
        return []
    }

    const rows = (data as any[]).map(item => ({
        ...item,
        assignee: item.assignee,
        creator: item.creator
    })) as Task[]

    if (rows.length === 0) return rows

    const taskIds = rows.map(task => task.id)

    const { data: checklistRows, error: checklistError } = await supabase
        .from('task_checklists')
        .select('task_id, is_done')
        .in('task_id', taskIds)

    if (checklistError) {
        console.error("Error fetching task checklists:", checklistError)
        return rows
    }

    const summary = new Map<string, { total: number; done: number }>()
    ;(checklistRows ?? []).forEach((item: any) => {
        const current = summary.get(item.task_id) ?? { total: 0, done: 0 }
        current.total += 1
        if (item.is_done) current.done += 1
        summary.set(item.task_id, current)
    })

    return rows.map(task => {
        const counts = summary.get(task.id)
        return {
            ...task,
            checklist_total: counts?.total ?? 0,
            checklist_done: counts?.done ?? 0,
        }
    })
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
    status?: TaskStatus
    brand?: Brand
    observer_ids?: string[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { data: inserted, error } = await supabase
        .from('tasks')
        .insert({
            ...data,
            creator_id: user.id
        })
        .select('id')
        .single()

    if (error) {
        console.error("Error creating task:", error)
        return { error: error.message }
    }

    const observerIds = Array.from(new Set((data.observer_ids ?? []).filter(Boolean)))
    if (observerIds.length > 0 && inserted?.id) {
        const { error: observersError } = await supabase
            .from('task_observers')
            .insert(observerIds.map((observerId) => ({
                task_id: inserted.id,
                user_id: observerId,
            })))

        if (observersError) {
            console.error("Error creating task observers:", observersError)
            return { error: observersError.message }
        }
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

export async function getTaskChecklists(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_checklists')
        .select('id, task_id, title, is_done, sort_order, created_at')
        .eq('task_id', taskId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Error fetching task checklists:", error)
        return []
    }

    return data as TaskChecklistItem[]
}

export async function addTaskChecklistItem(taskId: string, title: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_checklists')
        .insert({
            task_id: taskId,
            title: title.trim()
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function toggleTaskChecklistItem(itemId: string, isDone: boolean) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_checklists')
        .update({ is_done: isDone })
        .eq('id', itemId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function deleteTaskChecklistItem(itemId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_checklists')
        .delete()
        .eq('id', itemId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function getTaskObservers(taskId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('task_observers')
        .select('user_id, user:users(name, email)')
        .eq('task_id', taskId)

    if (error) {
        console.error("Error fetching task observers:", error)
        return []
    }

    return data as TaskObserver[]
}

export async function addTaskObserver(taskId: string, userId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_observers')
        .insert({
            task_id: taskId,
            user_id: userId
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}

export async function removeTaskObserver(taskId: string, userId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('task_observers')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId)

    if (error) return { error: error.message }

    revalidatePath('/admin/tarefas')
    return { success: true }
}
