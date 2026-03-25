import { describe, expect, it } from "vitest"

import {
  buildContactNameUpdatePayload,
  normalizeContactNameInput,
  splitContactName,
} from "../contact-name"

describe("contact-name helpers", () => {
  it("normaliza espaços extras", () => {
    expect(normalizeContactNameInput("   Maria   da   Silva   ")).toBe("Maria da Silva")
  })

  it("separa nome simples sem sobrenome", () => {
    expect(splitContactName("Cher")).toEqual({
      firstName: "Cher",
      lastName: null,
    })
  })

  it("separa primeiro nome e restante como sobrenome", () => {
    expect(splitContactName("Maria da Silva")).toEqual({
      firstName: "Maria",
      lastName: "da Silva",
    })
  })

  it("gera payload para atualização do contato", () => {
    expect(buildContactNameUpdatePayload("  Joao  Pedro  ")).toEqual({
      full_name: "Joao Pedro",
      first_name: "Joao",
      last_name: "Pedro",
    })
  })
})
