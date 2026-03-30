import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { hasTaskAnalystAccess } from "@/lib/task-analyst-access"
import { runTaskAnalyst } from "@/services/task-analyst-service"

export const runtime = "nodejs"

type TaskAnalystRunRequest = {
  trigger?: "manual" | "scheduled"
  dryRun?: boolean
}

function normalizeBody(body: unknown): TaskAnalystRunRequest {
  if (!body || typeof body !== "object") return {}
  const parsed = body as Record<string, unknown>

  return {
    trigger: parsed.trigger === "manual" ? "manual" : parsed.trigger === "scheduled" ? "scheduled" : undefined,
    dryRun: parsed.dryRun === true,
  }
}

function unauthorized(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 401 })
}

function forbidden(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}))
  const body = normalizeBody(rawBody)
  const trigger = body.trigger ?? "scheduled"

  if (trigger === "scheduled") {
    const configuredCronToken = process.env.TASK_ANALYST_CRON_TOKEN?.trim()
    if (!configuredCronToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "TASK_ANALYST_CRON_TOKEN não configurado no ambiente.",
        },
        { status: 422 }
      )
    }

    const providedToken = request.headers.get("x-task-analyst-cron-token")?.trim()
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
    const canRunTaskAnalyst = hasTaskAnalystAccess({
      role: profile?.role ?? null,
      task_analyst_access: profile?.taskAnalystAccess ?? null,
    })

    if (!profile || !canRunTaskAnalyst) {
      return forbidden("Acesso ao Analista IA não permitido para este usuário.")
    }
  }

  const result = await runTaskAnalyst({
    trigger,
    dryRun: body.dryRun,
  })

  return NextResponse.json(result, {
    status: result.statusCode,
  })
}
