import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { runCogniSync } from "@/services/cogni-sync-service"

export const runtime = "nodejs"

const manualSyncAllowedRoles = new Set(["adm_mestre", "adm_dorata", "suporte_tecnico"])

type SyncRequestBody = {
  trigger?: "manual" | "scheduled"
  monthsBack?: number
  dryRun?: boolean
}

function unauthorized(message: string) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status: 401 },
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status: 403 },
  )
}

function normalizeBody(body: unknown): SyncRequestBody {
  if (!body || typeof body !== "object") return {}
  const typed = body as Record<string, unknown>

  return {
    trigger: typed.trigger === "manual" ? "manual" : typed.trigger === "scheduled" ? "scheduled" : undefined,
    monthsBack: typeof typed.monthsBack === "number" ? typed.monthsBack : undefined,
    dryRun: typed.dryRun === true,
  }
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}))
  const body = normalizeBody(rawBody)
  const trigger = body.trigger ?? "scheduled"

  let requestedBy: string | null = null

  if (trigger === "scheduled") {
    const configuredCronToken = process.env.COGNI_CRON_TOKEN?.trim()
    if (!configuredCronToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "COGNI_CRON_TOKEN não configurado no ambiente.",
        },
        { status: 422 },
      )
    }

    const providedToken = request.headers.get("x-cogni-cron-token")?.trim()
    if (!providedToken || providedToken !== configuredCronToken) {
      return unauthorized("Token de agendamento inválido.")
    }
  } else {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return unauthorized("Não autenticado.")
    }

    const profile = await getProfile(supabase, user.id)

    if (!profile || !manualSyncAllowedRoles.has(profile.role)) {
      return forbidden("Você não possui permissão para sincronizar COGNI.")
    }

    requestedBy = user.id
  }

  const result = await runCogniSync({
    trigger,
    monthsBack: body.monthsBack,
    dryRun: body.dryRun,
    requestedBy,
  })

  return NextResponse.json(result, {
    status: result.statusCode,
  })
}
