import { afterEach, describe, expect, it, vi } from "vitest"

import { isUnsafeOutsideWindowAllowedForZApi, sendWhatsAppTemplateMessage } from "../whatsapp"

const ORIGINAL_ENV = { ...process.env }

describe("whatsapp template sending", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it("bloqueia envio sem nome de template", async () => {
    const result = await sendWhatsAppTemplateMessage({
      to: "5566999990000",
      templateName: "",
      languageCode: "pt_BR",
    })

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(400)
    expect(result.error).toContain("Template")
  })

  it("envia template com parâmetros de body quando informados", async () => {
    process.env.WHATSAPP_CLOUD_API_TOKEN = "token"
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id"

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [{ id: "wamid.template.123" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )

    vi.stubGlobal("fetch", fetchMock)

    const result = await sendWhatsAppTemplateMessage({
      to: "5566999990000",
      templateName: "reengagement_safe_mode",
      languageCode: "pt_BR",
      bodyParameters: ["Cliente Teste"],
      phoneNumberId: "phone-id-2",
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBe("wamid.template.123")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/phone-id-2/messages")
    expect(options?.method).toBe("POST")

    const payload = JSON.parse(String(options?.body))
    expect(payload.type).toBe("template")
    expect(payload.template.name).toBe("reengagement_safe_mode")
    expect(payload.template.language.code).toBe("pt_BR")
    expect(payload.template.components).toEqual([
      {
        type: "body",
        parameters: [{ type: "text", text: "Cliente Teste" }],
      },
    ])
  })

  it("habilita bypass de janela somente para z_api com flag ativa", () => {
    process.env.WHATSAPP_PROVIDER = "z_api"
    process.env.WHATSAPP_ZAPI_ALLOW_OUTSIDE_24H = "true"
    expect(isUnsafeOutsideWindowAllowedForZApi()).toBe(true)

    process.env.WHATSAPP_PROVIDER = "meta_cloud_api"
    expect(isUnsafeOutsideWindowAllowedForZApi()).toBe(false)

    process.env.WHATSAPP_PROVIDER = "z_api"
    process.env.WHATSAPP_ZAPI_ALLOW_OUTSIDE_24H = "false"
    expect(isUnsafeOutsideWindowAllowedForZApi()).toBe(false)
  })
})
