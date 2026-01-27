import * as fs from "fs"
import path from "path"
import { headers } from "next/headers"

function normalizeBaseUrl(raw: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "")
  }
  return `https://${raw.replace(/\/$/, "")}`
}

function resolveBaseUrlFromEnv(): string | null {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL

  if (explicit) return normalizeBaseUrl(explicit)

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  return null
}

async function resolveBaseUrlFromHeaders(): Promise<string | null> {
  try {
    const headerList = await headers()
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
    if (!host) return null
    const proto = headerList.get("x-forwarded-proto") ?? "https"
    return `${proto}://${host}`
  } catch {
    return null
  }
}

export async function loadTemplateDocx(templateName: string): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "public", "templates", `${templateName}.docx`)

  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath)
  }

  const baseUrl = resolveBaseUrlFromEnv() ?? (await resolveBaseUrlFromHeaders())
  if (!baseUrl) {
    throw new Error(
      `Template not found locally at ${templatePath} and base URL is unavailable to fetch /templates/${templateName}.docx`,
    )
  }

  const url = `${baseUrl}/templates/${templateName}.docx`
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Template not found via HTTP: ${url} (status ${response.status})`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
