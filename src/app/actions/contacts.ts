"use server"

import { revalidatePath } from "next/cache"

import {
  buildCanonicalContactPatch,
  buildContactDuplicateGroups,
  pickCanonicalContact,
  type ContactDedupeCandidate,
  type ContactDuplicateGroup,
} from "@/lib/contact-dedupe"
import { buildContactNameUpdatePayload, normalizeContactNameInput } from "@/lib/contact-name"
import { getProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"

const CONTACT_VIEW_ALLOWED_ROLES = new Set([
  "adm_mestre",
  "adm_dorata",
  "supervisor",
  "suporte_tecnico",
  "suporte_limitado",
  "funcionario_n1",
  "funcionario_n2",
])

const CONTACT_SYNC_ALLOWED_ROLES = new Set(["adm_mestre", "adm_dorata"])
const CONTACT_DELETE_ALLOWED_ROLES = new Set(["adm_mestre", "adm_dorata"])
const CONTACT_EDIT_ALLOWED_ROLES = new Set(CONTACT_VIEW_ALLOWED_ROLES)
const CONTACT_FETCH_BATCH_SIZE = 1000

type ContactForeignKeyTable = "proposals" | "tasks" | "obra_cards" | "whatsapp_conversations"

type ContactAccessContext = {
  userId: string
  role: string
}

type DuplicateOverviewGroup = {
  key: string
  numbers: string[]
  total_contacts: number
  sample_contact_ids: string[]
  sample_names: string[]
}

type DuplicateOverviewData = {
  total_contacts: number
  contacts_with_number: number
  duplicate_groups: number
  duplicate_contacts: number
  groups: DuplicateOverviewGroup[]
  can_sync: boolean
}

export type ContactDuplicateOverviewResult = {
  success: boolean
  error?: string
  data?: DuplicateOverviewData
}

export type SyncDuplicateContactsSummary = {
  groups_found: number
  groups_merged: number
  contacts_removed: number
  contacts_updated: number
  reassigned: Record<ContactForeignKeyTable, number>
}

export type SyncDuplicateContactsResult = {
  success: boolean
  error?: string
  message?: string
  data?: SyncDuplicateContactsSummary
}

export type DeleteContactResult = {
  success: boolean
  error?: string
  message?: string
}

type UpdateContactNameSummary = {
  indicacoes: number
  obra_cards: number
  tasks_client_name: number
  tasks_titles: number
  whatsapp_conversations: number
}

export type UpdateContactNameResult = {
  success: boolean
  error?: string
  message?: string
  data?: UpdateContactNameSummary
}

function isAllowedRole(role: string | null | undefined, allowed: Set<string>) {
  if (!role) return false
  return allowed.has(role)
}

async function getContactAccessContext(): Promise<
  { success: true; data: ContactAccessContext } | { success: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Não autenticado." }
  }

  const profile = await getProfile(supabase, user.id)
  const role = profile?.role ?? null

  if (!role || !isAllowedRole(role, CONTACT_VIEW_ALLOWED_ROLES)) {
    return { success: false, error: "Você não tem permissão para acessar contatos." }
  }

  return {
    success: true,
    data: {
      userId: user.id,
      role,
    },
  }
}

function mapDuplicateGroupToOverview(group: ContactDuplicateGroup): DuplicateOverviewGroup {
  const sampleNames = group.contacts
    .map((contact) => {
      const fullName = contact.full_name?.trim()
      if (fullName) return fullName

      const firstName = contact.first_name?.trim()
      const lastName = contact.last_name?.trim()
      const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim()
      if (fallbackName) return fallbackName

      const email = contact.email?.trim()
      if (email) return email

      return `Contato ${contact.id.slice(0, 8)}`
    })
    .slice(0, 3)

  return {
    key: group.key,
    numbers: group.numbers,
    total_contacts: group.contacts.length,
    sample_contact_ids: group.contacts.map((contact) => contact.id).slice(0, 5),
    sample_names: sampleNames,
  }
}

async function fetchContactsForDedupe(supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>) {
  const rows: ContactDedupeCandidate[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select(
        "id, full_name, first_name, last_name, email, whatsapp, whatsapp_normalized, phone, mobile, address, city, state, zipcode, source_created_at, created_at"
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + CONTACT_FETCH_BATCH_SIZE - 1)

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data ?? []) as ContactDedupeCandidate[]
    rows.push(...batch)

    if (batch.length < CONTACT_FETCH_BATCH_SIZE) {
      break
    }

    offset += CONTACT_FETCH_BATCH_SIZE
  }

  return rows
}

async function reassignContactReferences(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  table: ContactForeignKeyTable,
  canonicalContactId: string,
  duplicateContactIds: string[]
) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ contact_id: canonicalContactId })
    .in("contact_id", duplicateContactIds)
    .select("id")

  if (error) {
    throw new Error(`Falha ao atualizar ${table}: ${error.message}`)
  }

  return (data ?? []).length
}

function countContactsWithNumbers(contacts: ContactDedupeCandidate[]) {
  return contacts.reduce((count, contact) => {
    const hasAnyNumber = Boolean(
      contact.whatsapp_normalized || contact.whatsapp || contact.phone || contact.mobile
    )
    return count + (hasAnyNumber ? 1 : 0)
  }, 0)
}

function buildWorkTaskTitleWithRenamedWork(params: {
  title: string
  previousWorkTitles: Set<string>
  nextWorkTitle: string
}) {
  const prefix = "[Obra] "
  const separator = " - "

  if (!params.title.startsWith(prefix)) return null

  const separatorIndex = params.title.indexOf(separator, prefix.length)
  if (separatorIndex <= prefix.length) return null

  const currentWorkTitle = params.title.slice(prefix.length, separatorIndex).trim()
  if (!params.previousWorkTitles.has(currentWorkTitle)) return null

  const suffix = params.title.slice(separatorIndex + separator.length)
  if (!suffix.trim()) return null

  return `[Obra] ${params.nextWorkTitle} - ${suffix}`
}

export async function getContactDuplicateOverview(limitGroups = 12): Promise<ContactDuplicateOverviewResult> {
  try {
    const accessResult = await getContactAccessContext()
    if (!accessResult.success) {
      return { success: false, error: accessResult.error }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const contacts = await fetchContactsForDedupe(supabaseAdmin)
    const duplicateGroups = buildContactDuplicateGroups(contacts)

    const parsedLimit = Number.isFinite(limitGroups) && limitGroups > 0 ? Math.floor(limitGroups) : 12
    const duplicateContacts = duplicateGroups.reduce(
      (sum, group) => sum + Math.max(0, group.contacts.length - 1),
      0
    )

    return {
      success: true,
      data: {
        total_contacts: contacts.length,
        contacts_with_number: countContactsWithNumbers(contacts),
        duplicate_groups: duplicateGroups.length,
        duplicate_contacts: duplicateContacts,
        groups: duplicateGroups.slice(0, parsedLimit).map(mapDuplicateGroupToOverview),
        can_sync: isAllowedRole(accessResult.data.role, CONTACT_SYNC_ALLOWED_ROLES),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao analisar contatos duplicados."
    return {
      success: false,
      error: message,
    }
  }
}

export async function syncDuplicateContactsByPhoneAction(): Promise<SyncDuplicateContactsResult> {
  try {
    const accessResult = await getContactAccessContext()
    if (!accessResult.success) {
      return { success: false, error: accessResult.error }
    }

    if (!isAllowedRole(accessResult.data.role, CONTACT_SYNC_ALLOWED_ROLES)) {
      return {
        success: false,
        error: "Você não tem permissão para sincronizar contatos duplicados.",
      }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const contacts = await fetchContactsForDedupe(supabaseAdmin)
    const duplicateGroups = buildContactDuplicateGroups(contacts)

    const summary: SyncDuplicateContactsSummary = {
      groups_found: duplicateGroups.length,
      groups_merged: 0,
      contacts_removed: 0,
      contacts_updated: 0,
      reassigned: {
        proposals: 0,
        tasks: 0,
        obra_cards: 0,
        whatsapp_conversations: 0,
      },
    }

    if (duplicateGroups.length === 0) {
      return {
        success: true,
        message: "Nenhum contato duplicado por número foi encontrado.",
        data: summary,
      }
    }

    for (const group of duplicateGroups) {
      const canonical = pickCanonicalContact(group.contacts)
      const duplicateContacts = group.contacts.filter((contact) => contact.id !== canonical.id)
      const duplicateIds = duplicateContacts.map((contact) => contact.id)

      if (duplicateIds.length === 0) {
        continue
      }

      const patch = buildCanonicalContactPatch(canonical, duplicateContacts)
      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("contacts")
          .update(patch)
          .eq("id", canonical.id)

        if (updateError) {
          throw new Error(`Falha ao atualizar contato canônico ${canonical.id}: ${updateError.message}`)
        }

        summary.contacts_updated += 1
      }

      summary.reassigned.proposals += await reassignContactReferences(
        supabaseAdmin,
        "proposals",
        canonical.id,
        duplicateIds
      )
      summary.reassigned.tasks += await reassignContactReferences(
        supabaseAdmin,
        "tasks",
        canonical.id,
        duplicateIds
      )
      summary.reassigned.obra_cards += await reassignContactReferences(
        supabaseAdmin,
        "obra_cards",
        canonical.id,
        duplicateIds
      )
      summary.reassigned.whatsapp_conversations += await reassignContactReferences(
        supabaseAdmin,
        "whatsapp_conversations",
        canonical.id,
        duplicateIds
      )

      const { error: deleteError } = await supabaseAdmin
        .from("contacts")
        .delete()
        .in("id", duplicateIds)

      if (deleteError) {
        throw new Error(`Falha ao remover contatos duplicados: ${deleteError.message}`)
      }

      summary.contacts_removed += duplicateIds.length
      summary.groups_merged += 1
    }

    revalidatePath("/admin/contatos")
    revalidatePath("/admin/contatos/[contactId]", "page")
    revalidatePath("/admin/whatsapp")

    return {
      success: true,
      message: `Sincronização concluída. ${summary.contacts_removed} contato(s) duplicado(s) removido(s).`,
      data: summary,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar contatos duplicados."
    return {
      success: false,
      error: message,
    }
  }
}

export async function updateContactNameAction(params: {
  contactId: string
  fullName: string
}): Promise<UpdateContactNameResult> {
  try {
    const accessResult = await getContactAccessContext()
    if (!accessResult.success) {
      return { success: false, error: accessResult.error }
    }

    if (!isAllowedRole(accessResult.data.role, CONTACT_EDIT_ALLOWED_ROLES)) {
      return {
        success: false,
        error: "Você não tem permissão para editar contatos.",
      }
    }

    const normalizedContactId = params.contactId.trim()
    if (!normalizedContactId) {
      return {
        success: false,
        error: "Contato inválido para atualização.",
      }
    }

    const normalizedFullName = normalizeContactNameInput(params.fullName ?? "")
    if (!normalizedFullName) {
      return {
        success: false,
        error: "Informe um nome válido para o contato.",
      }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const nowIso = new Date().toISOString()

    const { data: contactData, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", normalizedContactId)
      .maybeSingle()

    if (contactError) {
      return {
        success: false,
        error: contactError.message,
      }
    }

    if (!contactData) {
      return {
        success: false,
        error: "Contato não encontrado.",
      }
    }

    const contactPatch = buildContactNameUpdatePayload(normalizedFullName)
    if (!contactPatch.full_name) {
      return {
        success: false,
        error: "Não foi possível interpretar o nome informado.",
      }
    }

    const { error: updateContactError } = await supabaseAdmin
      .from("contacts")
      .update({
        ...contactPatch,
        updated_by: accessResult.data.userId,
        updated_at: nowIso,
      })
      .eq("id", normalizedContactId)

    if (updateContactError) {
      return {
        success: false,
        error: updateContactError.message,
      }
    }

    const summary: UpdateContactNameSummary = {
      indicacoes: 0,
      obra_cards: 0,
      tasks_client_name: 0,
      tasks_titles: 0,
      whatsapp_conversations: 0,
    }

    const { data: linkedClientRows, error: linkedClientRowsError } = await supabaseAdmin
      .from("proposals")
      .select("client_id")
      .eq("contact_id", normalizedContactId)
      .not("client_id", "is", null)

    if (linkedClientRowsError) {
      return {
        success: false,
        error: `Falha ao buscar vínculos do contato: ${linkedClientRowsError.message}`,
      }
    }

    const linkedClientIds = Array.from(
      new Set(
        (linkedClientRows ?? [])
          .map((row) => (typeof row.client_id === "string" ? row.client_id : null))
          .filter((id): id is string => Boolean(id))
      )
    )

    if (linkedClientIds.length > 0) {
      const { data: updatedIndications, error: updateIndicationsError } = await supabaseAdmin
        .from("indicacoes")
        .update({
          nome: normalizedFullName,
          updated_at: nowIso,
        })
        .in("id", linkedClientIds)
        .select("id")

      if (updateIndicationsError) {
        return {
          success: false,
          error: `Falha ao sincronizar nome em indicações: ${updateIndicationsError.message}`,
        }
      }

      summary.indicacoes = (updatedIndications ?? []).length
    }

    const { data: workRows, error: workRowsError } = await supabaseAdmin
      .from("obra_cards")
      .select("id, title")
      .eq("contact_id", normalizedContactId)

    if (workRowsError) {
      return {
        success: false,
        error: `Falha ao buscar obras vinculadas: ${workRowsError.message}`,
      }
    }

    const previousWorkTitles = new Set(
      (workRows ?? [])
        .map((row) => (typeof row.title === "string" ? row.title.trim() : ""))
        .filter(Boolean)
    )

    if ((workRows ?? []).length > 0) {
      const { data: updatedWorks, error: updateWorksError } = await supabaseAdmin
        .from("obra_cards")
        .update({
          title: normalizedFullName,
          updated_at: nowIso,
        })
        .eq("contact_id", normalizedContactId)
        .select("id")

      if (updateWorksError) {
        return {
          success: false,
          error: `Falha ao sincronizar nome em obras: ${updateWorksError.message}`,
        }
      }

      summary.obra_cards = (updatedWorks ?? []).length
    }

    const { data: updatedTasks, error: updateTasksError } = await supabaseAdmin
      .from("tasks")
      .update({
        client_name: normalizedFullName,
      })
      .eq("contact_id", normalizedContactId)
      .select("id, title")

    if (updateTasksError) {
      return {
        success: false,
        error: `Falha ao sincronizar nome em tarefas: ${updateTasksError.message}`,
      }
    }

    const taskRows = (updatedTasks ?? []) as Array<{ id?: string; title?: string | null }>
    summary.tasks_client_name = taskRows.length

    if (previousWorkTitles.size > 0) {
      for (const task of taskRows) {
        if (typeof task.id !== "string" || typeof task.title !== "string") continue

        const nextTaskTitle = buildWorkTaskTitleWithRenamedWork({
          title: task.title,
          previousWorkTitles,
          nextWorkTitle: normalizedFullName,
        })

        if (!nextTaskTitle || nextTaskTitle === task.title) continue

        const { error: updateTaskTitleError } = await supabaseAdmin
          .from("tasks")
          .update({ title: nextTaskTitle })
          .eq("id", task.id)

        if (updateTaskTitleError) {
          return {
            success: false,
            error: `Falha ao atualizar título de tarefa vinculada: ${updateTaskTitleError.message}`,
          }
        }

        summary.tasks_titles += 1
      }
    }

    const { data: updatedConversations, error: updateConversationsError } = await supabaseAdmin
      .from("whatsapp_conversations")
      .update({ customer_name: normalizedFullName })
      .eq("contact_id", normalizedContactId)
      .select("id")

    if (updateConversationsError) {
      return {
        success: false,
        error: `Falha ao sincronizar nome no WhatsApp: ${updateConversationsError.message}`,
      }
    }

    summary.whatsapp_conversations = (updatedConversations ?? []).length

    revalidatePath("/admin/contatos")
    revalidatePath("/admin/contatos/[contactId]", "page")
    revalidatePath("/admin/whatsapp")
    revalidatePath("/admin/tarefas")
    revalidatePath("/admin/obras")
    revalidatePath("/admin/orcamentos")
    revalidatePath("/admin/crm")

    return {
      success: true,
      message:
        "Nome atualizado e sincronizado com módulos relacionados.",
      data: summary,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao atualizar nome do contato.",
    }
  }
}

export async function deleteContactAction(contactId: string): Promise<DeleteContactResult> {
  try {
    const accessResult = await getContactAccessContext()
    if (!accessResult.success) {
      return { success: false, error: accessResult.error }
    }

    if (!isAllowedRole(accessResult.data.role, CONTACT_DELETE_ALLOWED_ROLES)) {
      return {
        success: false,
        error: "Você não tem permissão para excluir contatos.",
      }
    }

    const normalizedContactId = contactId.trim()
    if (!normalizedContactId) {
      return {
        success: false,
        error: "Contato inválido para exclusão.",
      }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { data: contactData, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", normalizedContactId)
      .maybeSingle()

    if (contactError) {
      return {
        success: false,
        error: contactError.message,
      }
    }

    if (!contactData) {
      return {
        success: false,
        error: "Contato não encontrado.",
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("id", normalizedContactId)

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message,
      }
    }

    revalidatePath("/admin/contatos")
    revalidatePath("/admin/contatos/[contactId]", "page")
    revalidatePath("/admin/whatsapp")
    revalidatePath("/admin/tarefas")
    revalidatePath("/admin/obras")
    revalidatePath("/admin/orcamentos")

    return {
      success: true,
      message: "Contato excluído com sucesso.",
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao excluir contato.",
    }
  }
}
