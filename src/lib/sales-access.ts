const SALES_DEFAULT_ROLES = new Set([
    "vendedor_externo",
    "vendedor_interno",
    "supervisor",
])

export function roleHasSalesAccessByDefault(role?: string | null) {
    return SALES_DEFAULT_ROLES.has((role ?? "").trim())
}

export function hasSalesAccess(user: {
    role?: string | null
    sales_access?: boolean | null
}) {
    if (typeof user.sales_access === "boolean") {
        return user.sales_access
    }

    return roleHasSalesAccessByDefault(user.role)
}

