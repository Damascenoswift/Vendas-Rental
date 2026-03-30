import { describe, expect, it } from "vitest"

import { hasTaskAnalystAccess, roleHasTaskAnalystAccessByDefault } from "@/lib/task-analyst-access"

describe("task analyst access helpers", () => {
  it("enables access by default for adm_mestre and adm_dorata", () => {
    expect(roleHasTaskAnalystAccessByDefault("adm_mestre")).toBe(true)
    expect(roleHasTaskAnalystAccessByDefault("adm_dorata")).toBe(true)
  })

  it("does not enable access by default for other roles", () => {
    expect(roleHasTaskAnalystAccessByDefault("supervisor")).toBe(false)
    expect(roleHasTaskAnalystAccessByDefault("funcionario_n1")).toBe(false)
  })

  it("respects explicit task_analyst_access override", () => {
    expect(
      hasTaskAnalystAccess({
        role: "adm_mestre",
        task_analyst_access: false,
      })
    ).toBe(false)

    expect(
      hasTaskAnalystAccess({
        role: "supervisor",
        task_analyst_access: true,
      })
    ).toBe(true)
  })
})
