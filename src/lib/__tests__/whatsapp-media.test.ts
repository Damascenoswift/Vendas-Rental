import { describe, expect, it } from "vitest"

import {
  resolveWhatsAppOutboundMediaType,
  validateWhatsAppOutboundMediaFile,
} from "../whatsapp-media"

describe("whatsapp outbound media validation", () => {
  it("rejects webm audio because it is not reliable for WhatsApp delivery", () => {
    expect(
      resolveWhatsAppOutboundMediaType({
        fileName: "gravacao.webm",
        mimeType: "audio/webm",
      })
    ).toBeNull()

    expect(
      validateWhatsAppOutboundMediaFile({
        fileName: "gravacao.webm",
        mimeType: "audio/webm",
        sizeBytes: 1024,
      })
    ).toContain("Formato não suportado")
  })

  it("keeps ogg audio supported", () => {
    expect(
      resolveWhatsAppOutboundMediaType({
        fileName: "gravacao.ogg",
        mimeType: "audio/ogg",
      })
    ).toBe("audio")

    expect(
      validateWhatsAppOutboundMediaFile({
        fileName: "gravacao.ogg",
        mimeType: "audio/ogg",
        sizeBytes: 1024,
      })
    ).toBeNull()
  })
})
