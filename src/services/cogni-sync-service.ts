import { createHash } from "node:crypto"

import {
  CogniConfigError,
  CogniRequestError,
  createCogniClient,
  isCogniConfigured,
  type CogniCollectionResponse,
  type CogniInvoiceFetchParams,
  type CogniSyncTrigger,
} from "../lib/integrations/cogni"
import { createSupabaseServiceClient } from "../lib/supabase-server"

const DEFAULT_MONTHS_BACK = 12
const MAX_MONTHS_BACK = 60

export type CogniSyncParams = {
  trigger: CogniSyncTrigger
  monthsBack?: number
  dryRun?: boolean
  requestedBy?: string | null
}

export type CogniSyncTotals = {
  fetched: number
  mapped: number
  upserted: number
  unresolved: number
}

export type CogniSyncResult = {
  ok: boolean
  skipped: boolean
  statusCode: number
  reason?: string
  message?: string
  runId: string | null
  totals: CogniSyncTotals
  errors: string[]
}

type SyncRunInsert = {
  trigger: CogniSyncTrigger
  status: "running" | "success" | "partial" | "failed" | "skipped"
  months_back: number
  dry_run: boolean
  requested_by?: string | null
  fetched_count?: number
  mapped_count?: number
  upserted_count?: number
  unresolved_count?: number
  message?: string | null
  error_details?: Record<string, unknown> | null
  finished_at?: string | null
}

type NormalizedInvoice = {
  invoiceId: string
  cogniCompanyId: string
  mesAno: string
  codigoInstalacao: string | null
  codigoCliente: string | null
  clienteNome: string | null
  valorFatura: number | null
  kwhCompensado: number | null
  statusPagamento: "ABERTO" | "PAGO" | "ATRASADO" | "CANCELADO"
  boletoUrl: string | null
  boletoLinhaDigitavel: string | null
  boletoVencimento: string | null
  cogniUpdatedAt: string | null
  rawData: Record<string, unknown>
}

type NormalizedBill = {
  invoiceId: string | null
  codigoInstalacao: string | null
  codigoCliente: string | null
  boletoUrl: string | null
  boletoLinhaDigitavel: string | null
  boletoVencimento: string | null
}

function sanitizeString(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function firstNonEmptyString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const raw = source[key]
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim()
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return String(raw)
    }
  }
  return ""
}

function parseDecimalValue(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null
  }

  if (typeof raw !== "string") return null

  const normalized = raw.trim()
  if (!normalized) return null

  const hasComma = normalized.includes(",")
  const hasDot = normalized.includes(".")

  let numeric = normalized
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")

  if (hasComma && hasDot) {
    numeric = numeric.replace(/\./g, "").replace(",", ".")
  } else if (hasComma && !hasDot) {
    numeric = numeric.replace(",", ".")
  }

  numeric = numeric.replace(/[^\d.-]/g, "")

  const parsed = Number.parseFloat(numeric)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function normalizeToIsoDate(value: Date) {
  const year = value.getUTCFullYear()
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${value.getUTCDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function normalizeCompetenciaDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getUTCFullYear()}-${`${raw.getUTCMonth() + 1}`.padStart(2, "0")}-01`
  }

  if (typeof raw === "string") {
    const value = raw.trim()
    if (!value) {
      return normalizeCompetenciaDate(new Date())
    }

    const matchYearMonth = value.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
    if (matchYearMonth) {
      const [, year, month] = matchYearMonth
      return `${year}-${month.padStart(2, "0")}-01`
    }

    const matchMonthYear = value.match(/^(\d{1,2})\/(\d{4})$/)
    if (matchMonthYear) {
      const [, month, year] = matchMonthYear
      return `${year}-${month.padStart(2, "0")}-01`
    }

    const matchCompact = value.match(/^(\d{4})(\d{2})$/)
    if (matchCompact) {
      const [, year, month] = matchCompact
      return `${year}-${month}-01`
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getUTCFullYear()}-${`${parsed.getUTCMonth() + 1}`.padStart(2, "0")}-01`
    }
  }

  const now = new Date()
  return `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, "0")}-01`
}

export function normalizeCogniPaymentStatus(raw: unknown): "ABERTO" | "PAGO" | "ATRASADO" | "CANCELADO" {
  const value = sanitizeString(raw)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()

  if (!value) return "ABERTO"

  if (["PAGO", "PAID", "RECEBIDO", "QUITADO"].includes(value)) {
    return "PAGO"
  }

  if (["ATRASADO", "OVERDUE", "VENCIDO"].includes(value)) {
    return "ATRASADO"
  }

  if (["CANCELADO", "CANCELED", "CANCELLED"].includes(value)) {
    return "CANCELADO"
  }

  return "ABERTO"
}

function normalizeOptionalDate(raw: unknown) {
  if (!raw) return null

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return normalizeToIsoDate(raw)
  }

  if (typeof raw !== "string") return null

  const value = raw.trim()
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const monthYear = value.match(/^(\d{1,2})\/(\d{4})$/)
    if (monthYear) {
      const [, month, year] = monthYear
      return `${year}-${month.padStart(2, "0")}-01`
    }
    return null
  }

  return normalizeToIsoDate(parsed)
}

export function pickInvoiceIdentifier(row: Record<string, unknown>, companyId: string) {
  const fromPayload = firstNonEmptyString(row, [
    "invoice_id",
    "invoiceId",
    "fatura_id",
    "faturaId",
    "id_fatura",
    "id",
    "bill_id",
  ])

  if (fromPayload) return fromPayload

  const fingerprint = [
    companyId,
    firstNonEmptyString(row, ["mes_ano", "mesAno", "competencia", "reference_month", "ref_month"]),
    firstNonEmptyString(row, ["codigo_instalacao", "installation_code", "codigoInstalacao", "uc_instalacao"]),
    firstNonEmptyString(row, ["codigo_cliente", "customer_code", "codigoCliente", "codigo_uc_fatura"]),
    String(parseDecimalValue(row.valor_fatura ?? row.valor ?? row.amount) ?? ""),
    String(parseDecimalValue(row.kwh_compensado ?? row.kwh ?? row.energy_kwh) ?? ""),
  ].join("|")

  return createHash("sha256").update(fingerprint).digest("hex")
}

function normalizeMonthsBack(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_MONTHS_BACK
  const parsed = Math.trunc(value as number)
  if (parsed < 1) return 1
  if (parsed > MAX_MONTHS_BACK) return MAX_MONTHS_BACK
  return parsed
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function normalizeCode(value: string | null | undefined) {
  const normalized = (value ?? "").trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeBill(row: Record<string, unknown>): NormalizedBill {
  return {
    invoiceId: normalizeCode(firstNonEmptyString(row, ["invoice_id", "invoiceId", "fatura_id", "faturaId", "id"])),
    codigoInstalacao: normalizeCode(
      firstNonEmptyString(row, ["codigo_instalacao", "installation_code", "codigoInstalacao", "uc_instalacao"]),
    ),
    codigoCliente: normalizeCode(firstNonEmptyString(row, ["codigo_cliente", "customer_code", "codigoCliente", "codigo_uc_fatura"])),
    boletoUrl: normalizeCode(firstNonEmptyString(row, ["boleto_url", "bill_url", "link_boleto", "url", "download_url"])),
    boletoLinhaDigitavel: normalizeCode(
      firstNonEmptyString(row, ["boleto_linha_digitavel", "linha_digitavel", "line_digit", "barcode_line"]),
    ),
    boletoVencimento: normalizeOptionalDate(row.boleto_vencimento ?? row.vencimento ?? row.due_date),
  }
}

function indexBills(rows: Record<string, unknown>[]) {
  const byInvoiceId = new Map<string, NormalizedBill>()
  const byInstalacao = new Map<string, NormalizedBill>()
  const byCodigoCliente = new Map<string, NormalizedBill>()

  for (const row of rows) {
    const normalized = normalizeBill(row)
    if (normalized.invoiceId) byInvoiceId.set(normalized.invoiceId, normalized)
    if (normalized.codigoInstalacao) byInstalacao.set(normalized.codigoInstalacao, normalized)
    if (normalized.codigoCliente) byCodigoCliente.set(normalized.codigoCliente, normalized)
  }

  return {
    byInvoiceId,
    byInstalacao,
    byCodigoCliente,
  }
}

function normalizeInvoice(row: Record<string, unknown>, companyId: string, bills: ReturnType<typeof indexBills>): NormalizedInvoice {
  const invoiceId = pickInvoiceIdentifier(row, companyId)

  const codigoInstalacao = normalizeCode(
    firstNonEmptyString(row, ["codigo_instalacao", "installation_code", "codigoInstalacao", "uc_instalacao"]),
  )

  const codigoCliente = normalizeCode(
    firstNonEmptyString(row, ["codigo_cliente", "customer_code", "codigoCliente", "codigo_uc_fatura", "uc_code"]),
  )

  const bill = bills.byInvoiceId.get(invoiceId)
    || (codigoInstalacao ? bills.byInstalacao.get(codigoInstalacao) : undefined)
    || (codigoCliente ? bills.byCodigoCliente.get(codigoCliente) : undefined)

  return {
    invoiceId,
    cogniCompanyId: companyId,
    mesAno: normalizeCompetenciaDate(
      row.mes_ano ?? row.mesAno ?? row.competencia ?? row.reference_month ?? row.ref_month ?? row.month,
    ),
    codigoInstalacao,
    codigoCliente,
    clienteNome: normalizeCode(firstNonEmptyString(row, ["cliente_nome", "customer_name", "nome_cliente", "nome"])),
    valorFatura: parseDecimalValue(row.valor_fatura ?? row.valor ?? row.amount ?? row.total_value),
    kwhCompensado: parseDecimalValue(row.kwh_compensado ?? row.kwh ?? row.energy_kwh ?? row.compensated_kwh),
    statusPagamento: normalizeCogniPaymentStatus(row.status_pagamento ?? row.payment_status ?? row.status),
    boletoUrl: bill?.boletoUrl ?? normalizeCode(firstNonEmptyString(row, ["boleto_url", "bill_url", "link_boleto", "download_url"])),
    boletoLinhaDigitavel: bill?.boletoLinhaDigitavel
      ?? normalizeCode(firstNonEmptyString(row, ["boleto_linha_digitavel", "linha_digitavel", "line_digit", "barcode_line"])),
    boletoVencimento: bill?.boletoVencimento ?? normalizeOptionalDate(row.boleto_vencimento ?? row.vencimento ?? row.due_date),
    cogniUpdatedAt: normalizeOptionalDate(row.updated_at ?? row.updatedAt ?? row.last_update),
    rawData: row,
  }
}

type MappingContext = {
  clienteIdByInstalacao: Map<string, string>
  clienteIdByCodigoCliente: Map<string, string>
}

async function loadMappingContext(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  invoices: NormalizedInvoice[],
): Promise<MappingContext> {
  const installationCodes = Array.from(new Set(invoices.map((item) => item.codigoInstalacao).filter((code): code is string => Boolean(code))))
  const customerCodes = Array.from(new Set(invoices.map((item) => item.codigoCliente).filter((code): code is string => Boolean(code))))

  const clienteIdByInstalacao = new Map<string, string>()
  const clienteIdByCodigoCliente = new Map<string, string>()

  for (const batch of chunkArray(installationCodes, 200)) {
    if (batch.length === 0) continue

    const { data, error } = await supabaseAdmin
      .from("energia_ucs")
      .select("codigo_instalacao, cliente_id")
      .in("codigo_instalacao", batch)

    if (error) {
      throw new Error(`Erro ao mapear codigo_instalacao em energia_ucs: ${error.message}`)
    }

    for (const row of (data ?? []) as Array<{ codigo_instalacao?: string | null; cliente_id?: string | null }>) {
      const codigoInstalacao = normalizeCode(row.codigo_instalacao)
      const clienteId = normalizeCode(row.cliente_id)
      if (!codigoInstalacao || !clienteId) continue
      clienteIdByInstalacao.set(codigoInstalacao, clienteId)
    }
  }

  for (const batch of chunkArray(customerCodes, 200)) {
    if (batch.length === 0) continue

    const { data, error } = await supabaseAdmin
      .from("indicacoes")
      .select("id, codigo_cliente")
      .in("codigo_cliente", batch)

    if (error) {
      throw new Error(`Erro ao mapear codigo_cliente em indicacoes: ${error.message}`)
    }

    for (const row of (data ?? []) as Array<{ id?: string | null; codigo_cliente?: string | null }>) {
      const codigoCliente = normalizeCode(row.codigo_cliente)
      const clienteId = normalizeCode(row.id)
      if (!codigoCliente || !clienteId) continue
      clienteIdByCodigoCliente.set(codigoCliente, clienteId)
    }
  }

  return {
    clienteIdByInstalacao,
    clienteIdByCodigoCliente,
  }
}

export function resolveMappedClientId(
  invoice: Pick<NormalizedInvoice, "codigoInstalacao" | "codigoCliente">,
  mapping: MappingContext,
) {
  const byInstalacao = invoice.codigoInstalacao
    ? mapping.clienteIdByInstalacao.get(invoice.codigoInstalacao)
    : null

  if (byInstalacao) return byInstalacao

  if (!invoice.codigoCliente) return null

  return mapping.clienteIdByCodigoCliente.get(invoice.codigoCliente) ?? null
}

async function createRun(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  payload: SyncRunInsert,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("cogni_sync_runs")
    .insert(payload)
    .select("id")
    .single()

  if (error) {
    console.error("cogni_sync_create_run_failed", error)
    return null
  }

  return ((data as { id?: string } | null)?.id ?? null)
}

async function updateRun(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  runId: string | null,
  payload: Partial<SyncRunInsert>,
) {
  if (!runId) return

  const updates: Partial<SyncRunInsert> = {
    ...payload,
    finished_at: payload.finished_at ?? new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from("cogni_sync_runs")
    .update(updates)
    .eq("id", runId)

  if (error) {
    console.error("cogni_sync_update_run_failed", error)
  }
}

async function persistRawPayload(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  params: {
    runId: string | null
    endpoint: string
    companyId: string
    payload: unknown
  },
) {
  const { error } = await supabaseAdmin
    .from("cogni_invoice_payloads")
    .insert({
      run_id: params.runId,
      endpoint: params.endpoint,
      cogni_company_id: params.companyId,
      payload: params.payload,
    })

  if (error) {
    console.error("cogni_sync_persist_raw_payload_failed", {
      endpoint: params.endpoint,
      companyId: params.companyId,
      error,
    })
  }
}

async function upsertInvoiceCache(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  runId: string | null,
  usinaId: string,
  invoices: NormalizedInvoice[],
  mappingContext: MappingContext,
) {
  if (invoices.length === 0) {
    return {
      mappedRows: [] as Array<NormalizedInvoice & { clienteId: string }>,
      unresolvedCount: 0,
    }
  }

  const rows = invoices.map((invoice) => {
    const clienteId = resolveMappedClientId(invoice, mappingContext)
    const isMapped = Boolean(clienteId)

    return {
      run_id: runId,
      cogni_company_id: invoice.cogniCompanyId,
      cogni_invoice_id: invoice.invoiceId,
      mes_ano: invoice.mesAno,
      codigo_instalacao: invoice.codigoInstalacao,
      codigo_cliente: invoice.codigoCliente,
      cliente_nome: invoice.clienteNome,
      usina_id: usinaId,
      cliente_id: clienteId,
      valor_fatura: invoice.valorFatura,
      kwh_compensado: invoice.kwhCompensado,
      status_pagamento: invoice.statusPagamento,
      boleto_url: invoice.boletoUrl,
      boleto_linha_digitavel: invoice.boletoLinhaDigitavel,
      boleto_vencimento: invoice.boletoVencimento,
      mapping_status: isMapped ? "MAPPED" : "UNMAPPED",
      cogni_updated_at: invoice.cogniUpdatedAt,
      raw_data: invoice.rawData,
      last_synced_at: new Date().toISOString(),
    }
  })

  const { error } = await supabaseAdmin
    .from("cogni_invoice_cache")
    .upsert(rows, { onConflict: "cogni_company_id,cogni_invoice_id" })

  if (error) {
    throw new Error(`Erro ao persistir cache COGNI: ${error.message}`)
  }

  const mappedRows = invoices
    .map((invoice) => {
      const clienteId = resolveMappedClientId(invoice, mappingContext)
      if (!clienteId) return null
      return {
        ...invoice,
        clienteId,
      }
    })
    .filter((item): item is NormalizedInvoice & { clienteId: string } => Boolean(item))

  const unresolvedCount = rows.length - mappedRows.length

  return {
    mappedRows,
    unresolvedCount,
  }
}

async function upsertFaturasConciliacao(
  supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>,
  usinaId: string,
  rows: Array<NormalizedInvoice & { clienteId: string }>,
) {
  if (rows.length === 0) return 0

  const payload = rows.map((invoice) => ({
    usina_id: usinaId,
    cliente_id: invoice.clienteId,
    mes_ano: invoice.mesAno,
    valor_fatura: invoice.valorFatura,
    kwh_compensado: invoice.kwhCompensado,
    status_pagamento: invoice.statusPagamento,
    observacoes: "Sincronizado automaticamente via COGNI",
    origem_integracao: "COGNI",
    cogni_invoice_id: invoice.invoiceId,
    boleto_url: invoice.boletoUrl,
    boleto_linha_digitavel: invoice.boletoLinhaDigitavel,
    boleto_vencimento: invoice.boletoVencimento,
    cogni_updated_at: invoice.cogniUpdatedAt,
  }))

  const { error } = await supabaseAdmin
    .from("faturas_conciliacao")
    .upsert(payload, { onConflict: "cogni_invoice_id" })

  if (error) {
    throw new Error(`Erro ao upsert de faturas_conciliacao COGNI: ${error.message}`)
  }

  return payload.length
}

function mergeCogniErrors(errors: string[]) {
  if (errors.length === 0) return null
  return {
    errors,
  }
}

function buildFetchParams(companyId: string, monthsBack: number): CogniInvoiceFetchParams {
  return {
    companyId,
    monthsBack,
  }
}

function extractSyncErrorMessage(error: unknown) {
  if (error instanceof CogniRequestError) {
    return `COGNI HTTP ${error.statusCode}: ${error.message}`
  }

  if (error instanceof CogniConfigError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Erro desconhecido na sincronização COGNI"
}

async function fetchCompanyCollections(
  companyId: string,
  monthsBack: number,
): Promise<{
  invoiceData: CogniCollectionResponse
  invoiceBill: CogniCollectionResponse
  invoiceShareRule: CogniCollectionResponse
}> {
  const client = createCogniClient()
  const params = buildFetchParams(companyId, monthsBack)

  const [invoiceData, invoiceBill, invoiceShareRule] = await Promise.all([
    client.fetchInvoiceData(params),
    client.fetchInvoiceBill(params),
    client.fetchInvoiceShareRule(params),
  ])

  return {
    invoiceData,
    invoiceBill,
    invoiceShareRule,
  }
}

export async function runCogniSync(params: CogniSyncParams): Promise<CogniSyncResult> {
  const trigger = params.trigger
  const monthsBack = normalizeMonthsBack(params.monthsBack)
  const dryRun = params.dryRun === true
  const requestedBy = params.requestedBy ?? null

  const totals: CogniSyncTotals = {
    fetched: 0,
    mapped: 0,
    upserted: 0,
    unresolved: 0,
  }

  const errors: string[] = []

  let supabaseAdmin: ReturnType<typeof createSupabaseServiceClient>

  try {
    supabaseAdmin = createSupabaseServiceClient()
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      statusCode: 500,
      reason: "SUPABASE_SERVICE_CONFIG_ERROR",
      message: extractSyncErrorMessage(error),
      runId: null,
      totals,
      errors: [extractSyncErrorMessage(error)],
    }
  }

  const runId = await createRun(supabaseAdmin, {
    trigger,
    status: "running",
    months_back: monthsBack,
    dry_run: dryRun,
    requested_by: requestedBy,
    message: "Sincronização COGNI iniciada.",
  })

  if (!isCogniConfigured()) {
    await updateRun(supabaseAdmin, runId, {
      status: "skipped",
      message: "Sincronização COGNI ignorada: chaves não configuradas.",
      fetched_count: totals.fetched,
      mapped_count: totals.mapped,
      upserted_count: totals.upserted,
      unresolved_count: totals.unresolved,
      error_details: mergeCogniErrors(errors),
    })

    return {
      ok: true,
      skipped: true,
      statusCode: 422,
      reason: "COGNI_NOT_CONFIGURED",
      message: "Integração COGNI não configurada no ambiente.",
      runId,
      totals,
      errors,
    }
  }

  const { data: usinas, error: usinasError } = await supabaseAdmin
    .from("usinas")
    .select("id, nome, cogni_company_id, status")
    .eq("status", "ATIVA")
    .not("cogni_company_id", "is", null)

  if (usinasError) {
    const message = `Erro ao carregar usinas com mapeamento COGNI: ${usinasError.message}`
    errors.push(message)

    await updateRun(supabaseAdmin, runId, {
      status: "failed",
      message,
      fetched_count: totals.fetched,
      mapped_count: totals.mapped,
      upserted_count: totals.upserted,
      unresolved_count: totals.unresolved,
      error_details: mergeCogniErrors(errors),
    })

    return {
      ok: false,
      skipped: false,
      statusCode: 500,
      reason: "USINAS_QUERY_FAILED",
      message,
      runId,
      totals,
      errors,
    }
  }

  const companies = ((usinas ?? []) as Array<{ id: string; nome: string; cogni_company_id: string | null }>)
    .map((row) => ({
      usinaId: row.id,
      usinaNome: row.nome,
      companyId: sanitizeString(row.cogni_company_id),
    }))
    .filter((row) => row.companyId.length > 0)

  if (companies.length === 0) {
    await updateRun(supabaseAdmin, runId, {
      status: "skipped",
      message: "Nenhuma usina ativa com cogni_company_id configurado.",
      fetched_count: totals.fetched,
      mapped_count: totals.mapped,
      upserted_count: totals.upserted,
      unresolved_count: totals.unresolved,
      error_details: mergeCogniErrors(errors),
    })

    return {
      ok: true,
      skipped: true,
      statusCode: 200,
      reason: "NO_COMPANY_MAPPING",
      message: "Nenhuma usina ativa vinculada à COGNI para sincronizar.",
      runId,
      totals,
      errors,
    }
  }

  for (const company of companies) {
    try {
      const collections = await fetchCompanyCollections(company.companyId, monthsBack)

      await Promise.all([
        persistRawPayload(supabaseAdmin, {
          runId,
          endpoint: "invoice_data",
          companyId: company.companyId,
          payload: collections.invoiceData.raw,
        }),
        persistRawPayload(supabaseAdmin, {
          runId,
          endpoint: "invoice_bill",
          companyId: company.companyId,
          payload: collections.invoiceBill.raw,
        }),
        persistRawPayload(supabaseAdmin, {
          runId,
          endpoint: "invoice_share_rule",
          companyId: company.companyId,
          payload: collections.invoiceShareRule.raw,
        }),
      ])

      const bills = indexBills(collections.invoiceBill.items)
      const normalizedInvoices = collections.invoiceData.items.map((row) => normalizeInvoice(row, company.companyId, bills))

      totals.fetched += normalizedInvoices.length

      const mappingContext = await loadMappingContext(supabaseAdmin, normalizedInvoices)
      const { mappedRows, unresolvedCount } = await upsertInvoiceCache(
        supabaseAdmin,
        runId,
        company.usinaId,
        normalizedInvoices,
        mappingContext,
      )

      totals.mapped += mappedRows.length
      totals.unresolved += unresolvedCount

      if (!dryRun) {
        const upserted = await upsertFaturasConciliacao(supabaseAdmin, company.usinaId, mappedRows)
        totals.upserted += upserted
      }
    } catch (error) {
      const message = `[${company.usinaNome}] ${extractSyncErrorMessage(error)}`
      errors.push(message)
    }
  }

  const hasErrors = errors.length > 0
  const hasUnresolved = totals.unresolved > 0

  const status: SyncRunInsert["status"] = hasErrors
    ? "partial"
    : hasUnresolved
      ? "partial"
      : "success"

  await updateRun(supabaseAdmin, runId, {
    status,
    message: hasErrors
      ? "Sincronização concluída com falhas parciais."
      : hasUnresolved
        ? "Sincronização concluída com pendências de mapeamento."
        : "Sincronização concluída com sucesso.",
    fetched_count: totals.fetched,
    mapped_count: totals.mapped,
    upserted_count: totals.upserted,
    unresolved_count: totals.unresolved,
    error_details: mergeCogniErrors(errors),
  })

  const ok = !hasErrors

  return {
    ok,
    skipped: false,
    statusCode: ok ? 200 : 502,
    reason: ok ? undefined : "COGNI_PARTIAL_FAILURE",
    message: ok
      ? "Sincronização COGNI concluída."
      : "Sincronização COGNI concluída com falhas.",
    runId,
    totals,
    errors,
  }
}
