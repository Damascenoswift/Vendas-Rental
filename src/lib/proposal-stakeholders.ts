type UnknownRecord = Record<string, unknown>

export type ProposalStakeholderContact = {
  name: string
  whatsapp: string
}

export type ProposalStakeholderContacts = {
  owner: ProposalStakeholderContact
  billing: ProposalStakeholderContact
}

export type ProposalStakeholderUpdates = Partial<
  Record<"owner" | "billing", Partial<ProposalStakeholderContact> | null | undefined>
>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as UnknownRecord
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

export function normalizeProposalStakeholderWhatsapp(value: unknown) {
  if (typeof value !== "string") return ""
  const digits = value.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length < 10 || digits.length > 13) return ""
  if (digits.startsWith("0")) return ""
  return digits
}

function normalizeStakeholderContact(input: Partial<ProposalStakeholderContact> | null | undefined) {
  return {
    name: normalizeText(input?.name),
    whatsapp: normalizeProposalStakeholderWhatsapp(input?.whatsapp),
  } satisfies ProposalStakeholderContact
}

function readStakeholderContact(params: {
  stakeholders: UnknownRecord | null
  role: "owner" | "billing"
}) {
  const roleRecord = asRecord(params.stakeholders?.[params.role])
  const legacyNameKey = params.role === "owner" ? "owner_name" : "billing_name"
  const legacyWhatsappKey = params.role === "owner" ? "owner_whatsapp" : "billing_whatsapp"

  return normalizeStakeholderContact({
    name: roleRecord?.name ?? params.stakeholders?.[legacyNameKey],
    whatsapp: roleRecord?.whatsapp ?? params.stakeholders?.[legacyWhatsappKey],
  })
}

export function getProposalStakeholderContacts(calculation: unknown): ProposalStakeholderContacts {
  const calculationRecord = asRecord(calculation)
  const stakeholdersRecord = asRecord(calculationRecord?.stakeholders)

  return {
    owner: readStakeholderContact({ stakeholders: stakeholdersRecord, role: "owner" }),
    billing: readStakeholderContact({ stakeholders: stakeholdersRecord, role: "billing" }),
  }
}

export function withProposalStakeholderContacts(
  calculation: UnknownRecord,
  updates: ProposalStakeholderUpdates,
): UnknownRecord {
  const existing = getProposalStakeholderContacts(calculation)
  const owner = normalizeStakeholderContact(
    updates.owner === undefined ? existing.owner : updates.owner
  )
  const billing = normalizeStakeholderContact(
    updates.billing === undefined ? existing.billing : updates.billing
  )

  const stakeholders: UnknownRecord = {}
  if (owner.name || owner.whatsapp) {
    stakeholders.owner = {
      ...(owner.name ? { name: owner.name } : {}),
      ...(owner.whatsapp ? { whatsapp: owner.whatsapp } : {}),
    }
  }
  if (billing.name || billing.whatsapp) {
    stakeholders.billing = {
      ...(billing.name ? { name: billing.name } : {}),
      ...(billing.whatsapp ? { whatsapp: billing.whatsapp } : {}),
    }
  }

  const calculationRecord = asRecord(calculation) ?? calculation
  const rest = { ...calculationRecord }
  delete rest.stakeholders

  if (Object.keys(stakeholders).length === 0) {
    return rest
  }

  return {
    ...rest,
    stakeholders,
  }
}
