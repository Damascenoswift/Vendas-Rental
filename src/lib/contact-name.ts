export function normalizeContactNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function splitContactName(fullName: string): {
  firstName: string | null
  lastName: string | null
} {
  const normalized = normalizeContactNameInput(fullName)
  if (!normalized) {
    return {
      firstName: null,
      lastName: null,
    }
  }

  const parts = normalized.split(" ")
  const firstName = parts[0] || null
  const lastName = parts.slice(1).join(" ") || null

  return {
    firstName,
    lastName,
  }
}

export function buildContactNameUpdatePayload(fullName: string) {
  const normalized = normalizeContactNameInput(fullName)
  const { firstName, lastName } = splitContactName(normalized)

  return {
    full_name: normalized || null,
    first_name: firstName,
    last_name: lastName,
  }
}
