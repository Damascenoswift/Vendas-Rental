import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CogniClient,
  CogniConfigError,
  buildCogniAuthHeaders,
  extractCollectionItems,
  normalizeCogniFetchParams,
} from "../cogni"

describe("cogni integration helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("extrai lista de payload com chave data", () => {
    const items = extractCollectionItems({
      data: [{ id: "1" }, { id: "2" }],
    })

    expect(items).toHaveLength(2)
  })

  it("valida headers de autenticação", () => {
    const headers = buildCogniAuthHeaders({
      apiUrl: "https://api.cogni.group",
      apiKey: "key",
      apiSecret: "secret",
      timeoutMs: 20000,
      maxRetries: 1,
      enabled: true,
    })

    expect(headers.API_KEY).toBe("key")
    expect(headers.API_SECRET).toBe("secret")
    expect(headers["x-api-key"]).toBe("key")
  })

  it("falha ao construir headers sem segredo", () => {
    expect(() =>
      buildCogniAuthHeaders({
        apiUrl: "https://api.cogni.group",
        apiKey: null,
        apiSecret: null,
        timeoutMs: 20000,
        maxRetries: 1,
        enabled: false,
      }),
    ).toThrow(CogniConfigError)
  })

  it("normaliza parâmetro monthsBack", () => {
    expect(normalizeCogniFetchParams({ companyId: " C1 ", monthsBack: 0 })).toEqual({
      companyId: "C1",
      monthsBack: 1,
    })

    expect(normalizeCogniFetchParams({ companyId: "C1", monthsBack: 120 }).monthsBack).toBe(60)
  })

  it("aplica retry em erro 500", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "temporary" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ invoice_id: "INV-1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )

    vi.stubGlobal("fetch", fetchMock)

    const client = new CogniClient({
      apiUrl: "https://api.cogni.group",
      apiKey: "key",
      apiSecret: "secret",
      timeoutMs: 20000,
      maxRetries: 1,
      enabled: true,
    })

    const result = await client.fetchInvoiceData({
      companyId: "COMP-1",
      monthsBack: 12,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.items).toHaveLength(1)
  })
})
