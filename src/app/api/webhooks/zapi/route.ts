import { NextResponse } from "next/server"

import { handleZApiWebhookPost } from "@/app/api/whatsapp/webhook/route"

const WEBHOOK_TOKEN_HEADER = "x-webhook-token"

function isWebhookTokenConfigured() {
  return Boolean((process.env.WHATSAPP_ZAPI_WEBHOOK_TOKEN || "").trim())
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/webhooks/zapi",
    method: ["GET", "POST"],
    token_configured: isWebhookTokenConfigured(),
  })
}

export async function POST(request: Request) {
  if (!isWebhookTokenConfigured()) {
    return NextResponse.json(
      { error: "WHATSAPP_ZAPI_WEBHOOK_TOKEN nao configurado" },
      { status: 500 }
    )
  }

  const rawBody = await request.text()

  return handleZApiWebhookPost(rawBody, request, {
    headerNames: [WEBHOOK_TOKEN_HEADER],
    allowQueryToken: false,
  })
}
