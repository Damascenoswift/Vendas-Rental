import { describe, expect, it } from "vitest"

import {
  normalizeCogniPaymentStatus,
  normalizeCompetenciaDate,
  pickInvoiceIdentifier,
  resolveMappedClientId,
} from "../cogni-sync-service"

describe("cogni-sync-service helpers", () => {
  it("normaliza status de pagamento com aliases", () => {
    expect(normalizeCogniPaymentStatus("paid")).toBe("PAGO")
    expect(normalizeCogniPaymentStatus("vencido")).toBe("ATRASADO")
    expect(normalizeCogniPaymentStatus("cancelled")).toBe("CANCELADO")
    expect(normalizeCogniPaymentStatus("qualquer coisa")).toBe("ABERTO")
  })

  it("normaliza competência para o primeiro dia do mês", () => {
    expect(normalizeCompetenciaDate("2026-03")).toBe("2026-03-01")
    expect(normalizeCompetenciaDate("03/2026")).toBe("2026-03-01")
    expect(normalizeCompetenciaDate("202603")).toBe("2026-03-01")
  })

  it("gera identificador estável quando invoice_id não existe", () => {
    const row = {
      mes_ano: "2026-03",
      codigo_instalacao: "INST-001",
      codigo_cliente: "CLI-001",
      valor_fatura: "120,50",
      kwh_compensado: "321.4",
    }

    const first = pickInvoiceIdentifier(row, "COMP-1")
    const second = pickInvoiceIdentifier(row, "COMP-1")

    expect(first).toBe(second)
    expect(first).toHaveLength(64)
  })

  it("prioriza mapeamento por codigo_instalacao antes de codigo_cliente", () => {
    const mapping = {
      clienteIdByInstalacao: new Map([["INST-001", "cliente-instalacao"]]),
      clienteIdByCodigoCliente: new Map([["CLI-001", "cliente-codigo"]]),
    }

    const resolved = resolveMappedClientId(
      {
        codigoInstalacao: "INST-001",
        codigoCliente: "CLI-001",
      },
      mapping,
    )

    expect(resolved).toBe("cliente-instalacao")
  })
})
