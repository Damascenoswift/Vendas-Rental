const TASK_ANALYST_DEFAULT_ROLES = new Set([
  "adm_mestre",
  "adm_dorata",
])

export function roleHasTaskAnalystAccessByDefault(role?: string | null) {
  return TASK_ANALYST_DEFAULT_ROLES.has((role ?? "").trim())
}

export function hasTaskAnalystAccess(user: {
  role?: string | null
  task_analyst_access?: boolean | null
}) {
  if (typeof user.task_analyst_access === "boolean") {
    return user.task_analyst_access
  }

  return roleHasTaskAnalystAccessByDefault(user.role)
}
