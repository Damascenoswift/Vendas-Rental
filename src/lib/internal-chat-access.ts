const INTERNAL_CHAT_DEFAULT_ROLES = new Set([
    "funcionario_n1",
    "funcionario_n2",
    "supervisor",
])

export function roleHasInternalChatAccessByDefault(role?: string | null) {
    return INTERNAL_CHAT_DEFAULT_ROLES.has((role ?? "").trim())
}

export function hasInternalChatAccess(user: {
    role?: string | null
    internal_chat_access?: boolean | null
}) {
    if (typeof user.internal_chat_access === "boolean") {
        return user.internal_chat_access
    }

    return roleHasInternalChatAccessByDefault(user.role)
}
