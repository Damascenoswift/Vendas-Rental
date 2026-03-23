import { describe, expect, it } from "vitest"

import {
  buildWorkProjectProcessTitles,
  canonicalWorkProjectProcessBaseTitle,
  formatWorkProjectProcessTitle,
  isWorkProjectProtocolProcess,
  WORK_PROJECT_PROTOCOL_TITLE,
  parseWorkProjectProcessTitle,
} from "../work-project-process"

describe("work-project-process", () => {
  it("formats project process title with expected budget labels", () => {
    expect(formatWorkProjectProcessTitle("Projeto iniciado", "PRIMARY")).toBe(
      "Projeto iniciado (Orçamento principal)",
    )
    expect(formatWorkProjectProcessTitle("Projeto iniciado", "LINKED")).toBe(
      "Projeto iniciado (Orçamento vinculado)",
    )
  })

  it("builds both titles for project process", () => {
    expect(buildWorkProjectProcessTitles("Revisar projeto")).toEqual([
      "Revisar projeto (Orçamento principal)",
      "Revisar projeto (Orçamento vinculado)",
    ])
  })

  it("parses suffix in parenthesis", () => {
    expect(parseWorkProjectProcessTitle("Validar dados (Orçamento principal)")).toEqual({
      baseTitle: "Validar dados",
      scope: "PRIMARY",
    })

    expect(parseWorkProjectProcessTitle("Validar dados (Orçamento vinculado)")).toEqual({
      baseTitle: "Validar dados",
      scope: "LINKED",
    })
  })

  it("parses legacy dash suffix and secondary alias", () => {
    expect(parseWorkProjectProcessTitle("Projeto iniciado - Orçamento principal")).toEqual({
      baseTitle: "Projeto iniciado",
      scope: "PRIMARY",
    })

    expect(parseWorkProjectProcessTitle("Projeto iniciado — Orçamento secundário")).toEqual({
      baseTitle: "Projeto iniciado",
      scope: "LINKED",
    })
  })

  it("returns null scope for unsuffixed title", () => {
    expect(parseWorkProjectProcessTitle("Projeto iniciado")).toEqual({
      baseTitle: "Projeto iniciado",
      scope: null,
    })
  })

  it("canonicalizes legacy protocol title", () => {
    expect(canonicalWorkProjectProcessBaseTitle("Revisar projeto")).toBe(WORK_PROJECT_PROTOCOL_TITLE)
    expect(canonicalWorkProjectProcessBaseTitle("protocolo energisa")).toBe(WORK_PROJECT_PROTOCOL_TITLE)
  })

  it("detects protocol process label", () => {
    expect(isWorkProjectProtocolProcess("Revisar projeto")).toBe(true)
    expect(isWorkProjectProtocolProcess("Protocolo Energisa")).toBe(true)
    expect(isWorkProjectProtocolProcess("Validar documentação técnica")).toBe(false)
  })
})
