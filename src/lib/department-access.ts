const WORKS_DEPARTMENT = "obras"

const WORKS_ALLOWED_PATH_PREFIXES = [
  "/admin/obras",
  "/admin/chat",
  "/admin/notificacoes",
  "/perfil",
]

const WORKS_ALWAYS_ALLOWED_EXACT_PATHS = new Set([
  "/",
  "/login",
  "/reset-password",
])

const WORKS_ALWAYS_ALLOWED_PREFIXES = [
  "/auth",
  "/api",
]

function normalizeDepartment(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

export function isWorksDepartment(department?: string | null) {
  return normalizeDepartment(department) === WORKS_DEPARTMENT
}

export function hasWorksOnlyScope(department?: string | null) {
  return isWorksDepartment(department)
}

export function canWorksDepartmentAccessPath(pathname: string) {
  if (!pathname) return false

  if (WORKS_ALWAYS_ALLOWED_EXACT_PATHS.has(pathname)) return true
  if (WORKS_ALWAYS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  if (WORKS_ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }

  return false
}
