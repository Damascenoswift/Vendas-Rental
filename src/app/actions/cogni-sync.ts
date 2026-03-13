"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/auth"
import { runCogniSync, type CogniSyncResult } from "@/services/cogni-sync-service"

const manualSyncAllowedRoles = new Set(["adm_mestre", "adm_dorata", "suporte_tecnico"])

type ManualSyncInput = {
  monthsBack?: number
  dryRun?: boolean
}

function unauthorizedResult(message: string, statusCode: number): CogniSyncResult {
  return {
    ok: false,
    skipped: false,
    statusCode,
    reason: "UNAUTHORIZED",
    message,
    runId: null,
    totals: {
      fetched: 0,
      mapped: 0,
      upserted: 0,
      unresolved: 0,
    },
    errors: [message],
  }
}

export async function runManualCogniSyncAction(input: ManualSyncInput = {}): Promise<CogniSyncResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedResult("Não autenticado.", 401)
  }

  const profile = await getProfile(supabase, user.id)
  if (!profile || !manualSyncAllowedRoles.has(profile.role)) {
    return unauthorizedResult("Você não possui permissão para sincronizar COGNI.", 403)
  }

  const result = await runCogniSync({
    trigger: "manual",
    monthsBack: input.monthsBack,
    dryRun: input.dryRun,
    requestedBy: user.id,
  })

  if (result.ok) {
    revalidatePath("/admin/energia/faturas")
    revalidatePath("/investidor/financeiro")
    revalidatePath("/investidor/clientes")
    revalidatePath("/investidor")
  }

  return result
}
