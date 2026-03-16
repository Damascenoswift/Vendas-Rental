type TaskVisibilityScope = "TEAM" | "RESTRICTED" | null | undefined

type TaskMineScopeCandidate = {
    id: string
    assignee_id: string | null
    creator_id: string | null
    visibility_scope?: TaskVisibilityScope
}

export function canUserSeeTaskInMineScope(
    task: TaskMineScopeCandidate,
    userId: string,
    observerTaskIdSet?: Set<string> | null
) {
    if (!userId.trim()) return false
    if (task.assignee_id === userId) return true
    if (task.creator_id === userId) return true
    return observerTaskIdSet?.has(task.id) ?? false
}
