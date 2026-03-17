import { describe, expect, it } from "vitest"

import {
  buildCanonicalContactPatch,
  buildContactDuplicateGroups,
  pickCanonicalContact,
  type ContactDedupeCandidate,
} from "../contact-dedupe"

function makeContact(partial: Partial<ContactDedupeCandidate> & { id: string }): ContactDedupeCandidate {
  return {
    id: partial.id,
    full_name: partial.full_name ?? null,
    first_name: partial.first_name ?? null,
    last_name: partial.last_name ?? null,
    email: partial.email ?? null,
    whatsapp: partial.whatsapp ?? null,
    whatsapp_normalized: partial.whatsapp_normalized ?? null,
    phone: partial.phone ?? null,
    mobile: partial.mobile ?? null,
    address: partial.address ?? null,
    city: partial.city ?? null,
    state: partial.state ?? null,
    zipcode: partial.zipcode ?? null,
    source_created_at: partial.source_created_at ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
  }
}

describe("contact-dedupe", () => {
  it("agrupa contatos duplicados quando qualquer campo de telefone coincide", () => {
    const contacts = [
      makeContact({ id: "c1", whatsapp: "+55 (66) 99999-1000" }),
      makeContact({ id: "c2", phone: "5566999991000" }),
      makeContact({ id: "c3", whatsapp: "5566999992000", phone: "5566999993000" }),
      makeContact({ id: "c4", mobile: "+55 66 99999-3000" }),
      makeContact({ id: "c5", whatsapp: "" }),
    ]

    const groups = buildContactDuplicateGroups(contacts)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.contacts.map((item) => item.id).sort()).toEqual(["c1", "c2"])
    expect(groups[1]?.contacts.map((item) => item.id).sort()).toEqual(["c3", "c4"])
  })

  it("escolhe contato canônico priorizando maior completude", () => {
    const contacts = [
      makeContact({
        id: "old",
        created_at: "2024-01-01T10:00:00.000Z",
        phone: "5566999994000",
      }),
      makeContact({
        id: "rich",
        created_at: "2025-01-01T10:00:00.000Z",
        full_name: "Contato Completo",
        email: "contato@empresa.com",
        whatsapp: "5566999994000",
        city: "Cuiabá",
      }),
    ]

    const canonical = pickCanonicalContact(contacts)

    expect(canonical.id).toBe("rich")
  })

  it("monta patch para preencher campos vazios do canônico", () => {
    const canonical = makeContact({
      id: "canonical",
      full_name: "Cliente A",
      whatsapp: null,
      phone: "5566999995000",
      email: null,
      created_at: "2025-06-01T10:00:00.000Z",
      source_created_at: null,
    })

    const donors = [
      makeContact({
        id: "donor-1",
        full_name: "Cliente A Nome Completo",
        whatsapp: "5566999995000",
        email: null,
        source_created_at: "2025-05-01T10:00:00.000Z",
      }),
      makeContact({
        id: "donor-2",
        email: "clientea@empresa.com",
        source_created_at: "2025-04-01T10:00:00.000Z",
      }),
    ]

    const patch = buildCanonicalContactPatch(canonical, donors)

    expect(patch.whatsapp).toBe("5566999995000")
    expect(patch.email).toBe("clientea@empresa.com")
    expect(patch.source_created_at).toBe("2025-04-01T10:00:00.000Z")
  })
})
