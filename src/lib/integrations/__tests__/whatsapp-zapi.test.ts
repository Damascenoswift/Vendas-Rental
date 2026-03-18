import { describe, expect, it } from "vitest"

import { extractZApiCustomer } from "../whatsapp-zapi"

describe("whatsapp-zapi customer extraction", () => {
  it("prioriza chat remoto para mensagens fromMe", () => {
    const result = extractZApiCustomer(
      {
        fromMe: true,
        phone: "5566999990000",
        chatId: "5566988887777@c.us",
        remoteJid: "5566988887777@s.whatsapp.net",
        senderName: "Cliente Teste",
      },
      {
        selfWaId: "5566999990000",
      }
    )

    expect(result.customerWaId).toBe("5566988887777")
    expect(result.customerName).toBe("Cliente Teste")
  })

  it("não retorna número da própria instância quando fromMe só traz self em campos locais", () => {
    const result = extractZApiCustomer(
      {
        fromMe: true,
        phone: "5566999990000",
        from: "5566999990000",
      },
      {
        selfWaId: "5566999990000",
      }
    )

    expect(result.customerWaId).toBe("")
  })

  it("mantém comportamento para mensagem inbound normal", () => {
    const result = extractZApiCustomer(
      {
        fromMe: false,
        phone: "5566987654321",
        senderName: "Moacir",
      },
      {
        selfWaId: "5566999990000",
      }
    )

    expect(result.customerWaId).toBe("5566987654321")
    expect(result.customerName).toBe("Moacir")
  })

  it("ignora chatId/remoteJid sem domínio de número (ex.: lid)", () => {
    const result = extractZApiCustomer(
      {
        fromMe: true,
        phone: "5566999990000",
        chatId: "27340488566940@lid",
        remoteJid: "15453409833077@lid",
      },
      {
        selfWaId: "5566999990000",
      }
    )

    expect(result.customerWaId).toBe("")
  })
})
