type UnknownRecord = Record<string, unknown>

export type ProposalStakeholderContact = {
  name: string
  whatsapp: string
}

export type ProposalStakeholderBillingSource = "custom" | "owner" | "linked_contact"

export type ProposalStakeholderContacts = {
  owner: ProposalStakeholderContact
  billing: ProposalStakeholderContact
  billingSource: ProposalStakeholderBillingSource
}

export type ProposalStakeholderUpdates = {
  owner?: Partial<ProposalStakeholderContact> | null | undefined
  billing?: Partial<ProposalStakeholderContact> | null | undefined
  billingSource?: ProposalStakeholderBillingSource | null | undefined
}

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

function isBillingSource(value: unknown): value is ProposalStakeholderBillingSource {
  return value === "custom" || value === "owner" || value === "linked_contact"
}

function normalizeBillingSource(value: unknown): ProposalStakeholderBillingSource {
  return isBillingSource(value) ? value : "linked_contact"
}

function readStakeholderContact(params: {
  stakeholders: UnknownRecord | null
  role: "owner" | "billing"
}) {
  const roleRecord = asRecord(params.stakeholders?.[params.role])
  const legacyNameKey = params.role === "owner" ? "owner_name" : "billing_name"
  const legacyWhatsappKey = params.role === "owner" ? "owner_whatsapp" : "billing_whatsapp"
  const rawName = roleRecord?.name ?? params.stakeholders?.[legacyNameKey]
  const rawWhatsapp = roleRecord?.whatsapp ?? params.stakeholders?.[legacyWhatsappKey]

  return {
    name: normalizeText(rawName),
    whatsapp: normalizeProposalStakeholderWhatsapp(rawWhatsapp),
  } satisfies ProposalStakeholderContact
}

export function getProposalStakeholderContacts(calculation: unknown): ProposalStakeholderContacts {
  const calculationRecord = asRecord(calculation)
  const stakeholdersRecord = asRecord(calculationRecord?.stakeholders)
  const owner = readStakeholderContact({ stakeholders: stakeholdersRecord, role: "owner" })
  const billing = readStakeholderContact({ stakeholders: stakeholdersRecord, role: "billing" })
  const explicitSource = stakeholdersRecord?.billing_source
  const billingSource = isBillingSource(explicitSource)
    ? explicitSource
    : billing.name || billing.whatsapp
      ? "custom"
      : "linked_contact"

  return {
    owner,
    billing,
    billingSource,
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
  const billingSource = normalizeBillingSource(
    updates.billingSource === undefined ? existing.billingSource : updates.billingSource
  )

  const hasOwner = Boolean(owner.name || owner.whatsapp)
  const hasBilling = Boolean(billing.name || billing.whatsapp)
  const shouldPersistStakeholders = hasOwner || hasBilling || billingSource !== "linked_contact"
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

  if (!shouldPersistStakeholders) {
    return rest
  }

  stakeholders.billing_source = billingSource

  return {
    ...rest,
    stakeholders,
  }
}
