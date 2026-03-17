const WHATSAPP_INBOX_DEFAULT_ROLES = new Set([
  "adm_mestre",
  "adm_dorata",
  "suporte_tecnico",
  "suporte_limitado",
])

export function roleHasWhatsAppInboxAccessByDefault(role?: string | null) {
  return WHATSAPP_INBOX_DEFAULT_ROLES.has((role ?? "").trim())
}

export function hasWhatsAppInboxAccess(user: {
  role?: string | null
  whatsapp_inbox_access?: boolean | null
}) {
  if (typeof user.whatsapp_inbox_access === "boolean") {
    return user.whatsapp_inbox_access
  }

  return roleHasWhatsAppInboxAccessByDefault(user.role)
}
