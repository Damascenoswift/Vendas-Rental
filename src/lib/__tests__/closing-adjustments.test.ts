import { describe, expect, it } from "vitest"

import { buildOptionalClosingItems, parseFinancialDecimal } from "../financial/closing-adjustments"

describe("closing-adjustments", () => {
  it("monta pagamento fixo da Rental com valor arredondado", () => {
    const result = buildOptionalClosingItems({
      applyExpense: false,
      expenseBeneficiary: "",
      expenseBrand: "",
      expenseDescription: "",
      expenseAmount: "",
      applyFixedPayment: true,
      fixedBeneficiary: "11111111-1111-4111-8111-111111111111",
      fixedBrand: "rental",
      fixedDescription: "Fixo mensal",
      fixedAmount: "1500.557",
      createId: () => "fixed-1",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.items).toEqual([
      {
        source_kind: "rental_sistema",
        source_ref_id: "manual_fixed:fixed-1",
        brand: "rental",
        beneficiary_user_id: "11111111-1111-4111-8111-111111111111",
        transaction_type: "comissao_venda",
        amount: 1500.56,
        description: "Pagamento fixo - Fixo mensal",
        origin_lead_id: null,
        client_name: "Pagamento fixo",
      },
    ])
  })

  it("retorna erro quando pagamento fixo estiver incompleto", () => {
    const result = buildOptionalClosingItems({
      applyExpense: false,
      expenseBeneficiary: "",
      expenseBrand: "",
      expenseDescription: "",
      expenseAmount: "",
      applyFixedPayment: true,
      fixedBeneficiary: "",
      fixedBrand: "dorata",
      fixedDescription: "",
      fixedAmount: "900",
    })

    expect(result).toEqual({
      ok: false,
      error: "invalid-fixed",
    })
  })

  it("permite despesa e pagamento fixo no mesmo fechamento", () => {
    let sequence = 0
    const result = buildOptionalClosingItems({
      applyExpense: true,
      expenseBeneficiary: "22222222-2222-4222-8222-222222222222",
      expenseBrand: "dorata",
      expenseDescription: "Seguro",
      expenseAmount: "129,90",
      applyFixedPayment: true,
      fixedBeneficiary: "33333333-3333-4333-8333-333333333333",
      fixedBrand: "dorata",
      fixedDescription: "",
      fixedAmount: "700",
      createId: () => {
        sequence += 1
        return `id-${sequence}`
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.items[0]?.transaction_type).toBe("despesa")
    expect(result.items[1]?.transaction_type).toBe("comissao_dorata")
    expect(result.items[1]?.description).toBe("Pagamento fixo")
  })

  it("parseFinancialDecimal aceita formato com vírgula", () => {
    expect(parseFinancialDecimal("1.234,56")).toBe(1234.56)
    expect(Number.isNaN(parseFinancialDecimal(""))).toBe(true)
  })
})
