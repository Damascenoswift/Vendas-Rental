const INTERNAL_CHAT_DEFAULT_ROLES = new Set([
    "funcionario_n1",
    "funcionario_n2",
    "supervisor",
])

const INTERNAL_CHAT_DEFAULT_DEPARTMENTS = new Set([
    "obras",
])

export function departmentHasInternalChatAccessByDefault(department?: string | null) {
    return INTERNAL_CHAT_DEFAULT_DEPARTMENTS.has((department ?? "").trim().toLowerCase())
}

export function roleHasInternalChatAccessByDefault(role?: string | null, department?: string | null) {
    return (
        INTERNAL_CHAT_DEFAULT_ROLES.has((role ?? "").trim()) ||
        departmentHasInternalChatAccessByDefault(department)
    )
}

export function hasInternalChatAccess(user: {
    role?: string | null
    department?: string | null
    internal_chat_access?: boolean | null
}) {
    if (departmentHasInternalChatAccessByDefault(user.department)) {
        return true
    }

    if (typeof user.internal_chat_access === "boolean") {
        return user.internal_chat_access
    }

    return roleHasInternalChatAccessByDefault(user.role, user.department)
}
