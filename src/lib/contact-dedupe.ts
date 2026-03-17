export type ContactDedupeCandidate = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  whatsapp: string | null
  whatsapp_normalized: string | null
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  state: string | null
  zipcode: string | null
  source_created_at: string | null
  created_at: string
}

export type ContactDuplicateGroup = {
  key: string
  numbers: string[]
  contacts: ContactDedupeCandidate[]
}

export type ContactCanonicalPatch = Partial<
  Pick<
    ContactDedupeCandidate,
    | "full_name"
    | "first_name"
    | "last_name"
    | "email"
    | "whatsapp"
    | "whatsapp_normalized"
    | "phone"
    | "mobile"
    | "address"
    | "city"
    | "state"
    | "zipcode"
    | "source_created_at"
  >
>

const COMPLETENESS_FIELDS: Array<keyof ContactDedupeCandidate> = [
  "full_name",
  "first_name",
  "last_name",
  "email",
  "whatsapp",
  "phone",
  "mobile",
  "address",
  "city",
  "state",
  "zipcode",
]

const PATCHABLE_TEXT_FIELDS: Array<keyof ContactCanonicalPatch> = [
  "full_name",
  "first_name",
  "last_name",
  "email",
  "whatsapp",
  "phone",
  "mobile",
  "address",
  "city",
  "state",
  "zipcode",
]

function hasValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0
}

function normalizeContactNumber(value: string | null | undefined) {
  if (!hasValue(value)) return null
  const normalized = value.replace(/\D/g, "")
  return normalized.length > 0 ? normalized : null
}

function getContactNumbers(contact: ContactDedupeCandidate) {
  const numbers = [
    normalizeContactNumber(contact.whatsapp_normalized),
    normalizeContactNumber(contact.whatsapp),
    normalizeContactNumber(contact.phone),
    normalizeContactNumber(contact.mobile),
  ].filter((value): value is string => Boolean(value))

  return Array.from(new Set(numbers))
}

function getContactCompletenessScore(contact: ContactDedupeCandidate) {
  return COMPLETENESS_FIELDS.reduce((score, field) => {
    return score + (hasValue(contact[field]) ? 1 : 0)
  }, 0)
}

function parseDateValue(value: string | null | undefined) {
  if (!hasValue(value)) return Number.POSITIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function getContactSortTimestamp(contact: ContactDedupeCandidate) {
  return parseDateValue(contact.source_created_at ?? contact.created_at)
}

function compareCanonicalCandidate(a: ContactDedupeCandidate, b: ContactDedupeCandidate) {
  const scoreDiff = getContactCompletenessScore(b) - getContactCompletenessScore(a)
  if (scoreDiff !== 0) return scoreDiff

  const dateDiff = getContactSortTimestamp(a) - getContactSortTimestamp(b)
  if (dateDiff !== 0) return dateDiff

  return a.id.localeCompare(b.id)
}

function findRoot(parent: Map<string, string>, id: string): string {
  let current = id
  while (parent.get(current) !== current) {
    const next = parent.get(current)
    if (!next) break
    current = next
  }

  let walker = id
  while (walker !== current) {
    const next = parent.get(walker)
    if (!next) break
    parent.set(walker, current)
    walker = next
  }

  return current
}

function unionRoots(parent: Map<string, string>, a: string, b: string) {
  const rootA = findRoot(parent, a)
  const rootB = findRoot(parent, b)
  if (rootA === rootB) return

  if (rootA.localeCompare(rootB) <= 0) {
    parent.set(rootB, rootA)
    return
  }

  parent.set(rootA, rootB)
}

export function buildContactDuplicateGroups(contacts: ContactDedupeCandidate[]): ContactDuplicateGroup[] {
  if (contacts.length < 2) return []

  const parent = new Map<string, string>()
  const numberOwner = new Map<string, string>()

  for (const contact of contacts) {
    parent.set(contact.id, contact.id)
  }

  for (const contact of contacts) {
    const numbers = getContactNumbers(contact)
    if (numbers.length === 0) continue

    for (const number of numbers) {
      const owner = numberOwner.get(number)
      if (!owner) {
        numberOwner.set(number, contact.id)
        continue
      }

      unionRoots(parent, owner, contact.id)
    }
  }

  const groupsMap = new Map<string, { contacts: ContactDedupeCandidate[]; numbers: Set<string> }>()

  for (const contact of contacts) {
    const numbers = getContactNumbers(contact)
    if (numbers.length === 0) continue

    const root = findRoot(parent, contact.id)
    const bucket = groupsMap.get(root) ?? { contacts: [], numbers: new Set<string>() }

    bucket.contacts.push(contact)
    for (const number of numbers) {
      bucket.numbers.add(number)
    }

    groupsMap.set(root, bucket)
  }

  return Array.from(groupsMap.values())
    .filter((group) => group.contacts.length > 1)
    .map((group) => {
      const numbers = Array.from(group.numbers).sort((a, b) => a.localeCompare(b))
      const contactsSorted = [...group.contacts].sort((a, b) => a.id.localeCompare(b.id))
      return {
        key: numbers[0] ?? contactsSorted[0]?.id ?? "",
        numbers,
        contacts: contactsSorted,
      }
    })
    .sort((a, b) => {
      const sizeDiff = b.contacts.length - a.contacts.length
      if (sizeDiff !== 0) return sizeDiff
      return a.key.localeCompare(b.key)
    })
}

export function pickCanonicalContact(contacts: ContactDedupeCandidate[]) {
  if (contacts.length === 0) {
    throw new Error("Cannot pick canonical contact from an empty group")
  }

  return [...contacts].sort(compareCanonicalCandidate)[0]
}

function pickFirstDonorValue(
  donors: ContactDedupeCandidate[],
  field: keyof ContactCanonicalPatch
): string | null {
  for (const donor of donors) {
    const value = donor[field]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }

  return null
}

function getEarliestSourceCreatedAt(values: Array<string | null | undefined>) {
  let earliestValue: string | null = null
  let earliestTimestamp = Number.POSITIVE_INFINITY

  for (const value of values) {
    const timestamp = parseDateValue(value)
    if (!Number.isFinite(timestamp)) continue

    if (timestamp < earliestTimestamp) {
      earliestTimestamp = timestamp
      earliestValue = value ?? null
    }
  }

  return earliestValue
}

export function buildCanonicalContactPatch(
  canonical: ContactDedupeCandidate,
  donors: ContactDedupeCandidate[]
): ContactCanonicalPatch {
  const patch: ContactCanonicalPatch = {}
  const orderedDonors = [...donors].sort(compareCanonicalCandidate)

  for (const field of PATCHABLE_TEXT_FIELDS) {
    const canonicalValue = canonical[field]
    if (typeof canonicalValue === "string" && canonicalValue.trim().length > 0) {
      continue
    }

    const donorValue = pickFirstDonorValue(orderedDonors, field)
    if (donorValue) {
      patch[field] = donorValue
    }
  }

  const normalizedCanonical = normalizeContactNumber(canonical.whatsapp_normalized)
  if (!normalizedCanonical) {
    const normalizedFromCandidates = [
      patch.whatsapp,
      patch.phone,
      patch.mobile,
      ...orderedDonors.map((item) => item.whatsapp_normalized),
      ...orderedDonors.map((item) => item.whatsapp),
      ...orderedDonors.map((item) => item.phone),
      ...orderedDonors.map((item) => item.mobile),
    ]
      .map((value) => normalizeContactNumber(value))
      .find((value): value is string => Boolean(value))

    if (normalizedFromCandidates) {
      patch.whatsapp_normalized = normalizedFromCandidates
    }
  }

  const earliestSourceCreatedAt = getEarliestSourceCreatedAt([
    canonical.source_created_at,
    ...orderedDonors.map((item) => item.source_created_at),
    canonical.created_at,
    ...orderedDonors.map((item) => item.created_at),
  ])

  const canonicalSourceTimestamp = parseDateValue(canonical.source_created_at)
  const earliestTimestamp = parseDateValue(earliestSourceCreatedAt)

  if (
    earliestSourceCreatedAt &&
    (!Number.isFinite(canonicalSourceTimestamp) || earliestTimestamp < canonicalSourceTimestamp)
  ) {
    patch.source_created_at = earliestSourceCreatedAt
  }

  return patch
}
