import { createSupabaseServiceClient } from "@/lib/supabase-server"

const ACTIVE_STATUSES = ["active", "ATIVO"]

type SupervisorTargetRow = {
  id: string
  role: string | null
  supervisor_id: string | null
  status: string | null
}

function isActiveStatus(status: string | null | undefined) {
  return status ? ACTIVE_STATUSES.includes(status) : true
}

export async function getInternalSubordinateIds(supervisorId: string): Promise<string[]> {
  const supabaseAdmin = createSupabaseServiceClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("supervisor_id", supervisorId)
    .eq("role", "vendedor_interno")
    .in("status", ACTIVE_STATUSES)

  if (error) {
    console.error("Erro ao buscar subordinados internos:", error)
    return []
  }

  return (data ?? []).map((item: { id: string }) => item.id)
}

export async function getSupervisorVisibleUserIds(supervisorId: string): Promise<string[]> {
  const subordinateIds = await getInternalSubordinateIds(supervisorId)
  return Array.from(new Set([supervisorId, ...subordinateIds]))
}

export async function assertSupervisorCanAssignInternalVendor(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    return { allowed: true as const }
  }

  const supabaseAdmin = createSupabaseServiceClient()
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, role, supervisor_id, status")
    .eq("id", targetUserId)
    .maybeSingle()

  if (error) {
    console.error("Erro ao validar subordinado interno:", error)
    return {
      allowed: false as const,
      message: "Nao foi possivel validar o vendedor selecionado.",
    }
  }

  const target = data as SupervisorTargetRow | null
  if (!target) {
    return {
      allowed: false as const,
      message: "Vendedor selecionado nao encontrado.",
    }
  }

  if (target.role !== "vendedor_interno") {
    return {
      allowed: false as const,
      message: "Supervisor so pode atribuir para vendedor interno.",
    }
  }

  if (target.supervisor_id !== actorId) {
    return {
      allowed: false as const,
      message: "Supervisor so pode atribuir para vendedor interno subordinado.",
    }
  }

  if (!isActiveStatus(target.status)) {
    return {
      allowed: false as const,
      message: "Vendedor selecionado esta inativo.",
    }
  }

  return { allowed: true as const }
}
