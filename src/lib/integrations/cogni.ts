const DEFAULT_COGNI_API_URL = "https://api.cogni.group"
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RETRIES = 2

export type CogniSyncTrigger = "manual" | "scheduled"

export type CogniConfig = {
  apiUrl: string
  apiKey: string | null
  apiSecret: string | null
  timeoutMs: number
  maxRetries: number
  enabled: boolean
}

export type CogniInvoiceFetchParams = {
  companyId: string
  monthsBack: number
}

export type CogniCollectionResponse<T extends Record<string, unknown> = Record<string, unknown>> = {
  raw: unknown
  items: T[]
}

export class CogniConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CogniConfigError"
  }
}

export class CogniRequestError extends Error {
  statusCode: number
  details: unknown

  constructor(message: string, statusCode: number, details: unknown) {
    super(message)
    this.name = "CogniRequestError"
    this.statusCode = statusCode
    this.details = details
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
}

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return DEFAULT_COGNI_API_URL
  return trimmed.replace(/\/+$/, "")
}

export function getCogniConfig(): CogniConfig {
  const apiUrl = normalizeBaseUrl(process.env.COGNI_API_URL || DEFAULT_COGNI_API_URL)
  const apiKey = process.env.COGNI_API_KEY?.trim() || null
  const apiSecret = process.env.COGNI_API_SECRET?.trim() || null
  const timeoutMs = parsePositiveInt(process.env.COGNI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  const maxRetries = parsePositiveInt(process.env.COGNI_MAX_RETRIES, DEFAULT_MAX_RETRIES)

  return {
    apiUrl,
    apiKey,
    apiSecret,
    timeoutMs,
    maxRetries,
    enabled: Boolean(apiKey && apiSecret),
  }
}

export function isCogniConfigured() {
  return getCogniConfig().enabled
}

export function buildCogniAuthHeaders(config: CogniConfig) {
  if (!config.apiKey || !config.apiSecret) {
    throw new CogniConfigError("COGNI_API_KEY/COGNI_API_SECRET não configuradas")
  }

  return {
    API_KEY: config.apiKey,
    API_SECRET: config.apiSecret,
    "x-api-key": config.apiKey,
    "x-api-secret": config.apiSecret,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "rental-v2-cogni-sync/1.0",
  }
}

function toQueryString(query: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    params.set(key, String(value))
  }

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
}

export function extractCollectionItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return asRecordArray(payload)
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>

    const preferredKeys = [
      "data",
      "items",
      "results",
      "rows",
      "invoices",
      "invoice_data",
      "invoice_bill",
      "share_rules",
      "payload",
    ]

    for (const key of preferredKeys) {
      const list = asRecordArray(record[key])
      if (list.length > 0) return list
    }

    for (const candidate of Object.values(record)) {
      const list = asRecordArray(candidate)
      if (list.length > 0) return list
    }
  }

  return []
}

function normalizeMonthsBack(value: number) {
  if (!Number.isFinite(value)) return 12
  const rounded = Math.trunc(value)
  if (rounded < 1) return 1
  if (rounded > 60) return 60
  return rounded
}

export function normalizeCogniFetchParams(params: CogniInvoiceFetchParams) {
  return {
    companyId: params.companyId.trim(),
    monthsBack: normalizeMonthsBack(params.monthsBack),
  }
}

function isRetryableStatus(statusCode: number) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500
}

function buildFetchErrorMessage(statusCode: number, payload: unknown) {
  if (payload && typeof payload === "object") {
    const maybeMessage = (payload as Record<string, unknown>).message
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage
    }

    const maybeError = (payload as Record<string, unknown>).error
    if (typeof maybeError === "string" && maybeError.trim().length > 0) {
      return maybeError
    }
  }

  return `COGNI request failed with status ${statusCode}`
}

async function safeParseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null)
  }

  const text = await response.text().catch(() => "")
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class CogniClient {
  private readonly config: CogniConfig

  constructor(config?: CogniConfig) {
    this.config = config ?? getCogniConfig()
  }

  getConfig() {
    return this.config
  }

  private ensureEnabled() {
    if (!this.config.enabled) {
      throw new CogniConfigError("Integração COGNI desativada: chaves não configuradas")
    }
  }

  private buildUrl(path: string, query: Record<string, string | number | boolean | null | undefined>) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    return `${this.config.apiUrl}${normalizedPath}${toQueryString(query)}`
  }

  private async requestRaw(path: string, query: Record<string, string | number | boolean | null | undefined>) {
    this.ensureEnabled()
    const headers = buildCogniAuthHeaders(this.config)
    const url = this.buildUrl(path, query)

    let lastError: unknown = null

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)

      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
          cache: "no-store",
        })

        clearTimeout(timeout)

        const payload = await safeParseResponseBody(response)

        if (!response.ok) {
          const error = new CogniRequestError(
            buildFetchErrorMessage(response.status, payload),
            response.status,
            payload,
          )

          if (attempt < this.config.maxRetries && isRetryableStatus(response.status)) {
            lastError = error
            continue
          }

          throw error
        }

        return payload
      } catch (error) {
        clearTimeout(timeout)
        lastError = error

        if (attempt >= this.config.maxRetries) {
          throw error
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Falha desconhecida ao consultar COGNI")
  }

  private async requestCollectionWithFallback(
    path: string,
    primaryQuery: Record<string, string | number | boolean | null | undefined>,
    fallbackQueries: Array<Record<string, string | number | boolean | null | undefined>>,
  ): Promise<CogniCollectionResponse> {
    const queries = [primaryQuery, ...fallbackQueries]
    let lastError: unknown = null

    for (let index = 0; index < queries.length; index += 1) {
      try {
        const raw = await this.requestRaw(path, queries[index])
        return {
          raw,
          items: extractCollectionItems(raw),
        }
      } catch (error) {
        lastError = error
        const isLastAttempt = index === queries.length - 1
        const shouldContinue = error instanceof CogniRequestError && error.statusCode === 400 && !isLastAttempt
        if (!shouldContinue) {
          throw error
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Falha ao carregar coleção da COGNI")
  }

  async fetchInvoiceData(params: CogniInvoiceFetchParams): Promise<CogniCollectionResponse> {
    const normalized = normalizeCogniFetchParams(params)

    return this.requestCollectionWithFallback(
      "/invoice/invoice_data",
      {
        company_id: normalized.companyId,
        months_back: normalized.monthsBack,
      },
      [
        {
          company: normalized.companyId,
          months_back: normalized.monthsBack,
        },
        {
          companyId: normalized.companyId,
          monthsBack: normalized.monthsBack,
        },
      ],
    )
  }

  async fetchInvoiceBill(params: CogniInvoiceFetchParams): Promise<CogniCollectionResponse> {
    const normalized = normalizeCogniFetchParams(params)

    return this.requestCollectionWithFallback(
      "/invoice/invoice_bill",
      {
        company_id: normalized.companyId,
        months_back: normalized.monthsBack,
      },
      [
        {
          company: normalized.companyId,
          months_back: normalized.monthsBack,
        },
        {
          companyId: normalized.companyId,
          monthsBack: normalized.monthsBack,
        },
      ],
    )
  }

  async fetchInvoiceShareRule(params: CogniInvoiceFetchParams): Promise<CogniCollectionResponse> {
    const normalized = normalizeCogniFetchParams(params)

    return this.requestCollectionWithFallback(
      "/invoice/invoice_share_rule",
      {
        company_id: normalized.companyId,
        months_back: normalized.monthsBack,
      },
      [
        {
          company: normalized.companyId,
          months_back: normalized.monthsBack,
        },
      ],
    )
  }
}

export function createCogniClient(config?: CogniConfig) {
  return new CogniClient(config)
}
