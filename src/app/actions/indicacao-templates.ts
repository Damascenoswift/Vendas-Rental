'use server'

import Papa from 'papaparse'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { hasFullAccess, type UserProfile, type UserRole } from '@/lib/auth'
import { createIndicationAction } from '@/app/actions/indicacoes'
import { assertSupervisorCanAssignInternalVendor } from '@/lib/supervisor-scope'
import { hasSalesAccess } from '@/lib/sales-access'

type TemplateBasePayload = Record<string, any>

const normalizeString = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeHeader = (value: string) =>
  normalizeString(value).replace(/[\s_-]+/g, '')

const normalizeInstallationCode = (value: string) => value.trim()

const sanitizePhone = (value: string) => value.replace(/\D/g, '')

const sanitizeDigits = (value: string) => value.replace(/\D/g, '')

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const templateSchema = z.object({
  name: z.string().min(1, 'Nome do template é obrigatório'),
  vendedor_id: z.string().min(1, 'Vendedor obrigatório'),
  cnpj: z.string().min(1, 'CNPJ obrigatório'),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(1, 'Telefone obrigatório'),
  nome_empresa: z.string().optional(),
  representante_legal: z.string().optional(),
  cpf_representante: z.string().optional(),
  rg_representante: z.string().optional(),
})

export async function createIndicationTemplate(payload: z.infer<typeof templateSchema>) {
  const parsed = templateSchema.safeParse(payload)
  if (!parsed.success) {
    return { success: false, message: 'Dados inválidos.', errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autorizado.' }

  const supabaseAdmin = createSupabaseServiceClient()
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, department')
    .eq('id', user.id)
    .single()

  const role = profile?.role as UserRole | undefined
  const department = (profile as { department?: UserProfile['department'] | null } | null)?.department ?? null

  let { data: targetVendor, error: targetVendorError } = await supabaseAdmin
    .from('users')
    .select('id, role, status, sales_access')
    .eq('id', parsed.data.vendedor_id)
    .maybeSingle()

  const missingSalesAccessColumn =
    targetVendorError &&
    /could not find the 'sales_access' column/i.test(targetVendorError.message ?? '')

  if (missingSalesAccessColumn) {
    const fallback = await supabaseAdmin
      .from('users')
      .select('id, role, status')
      .eq('id', parsed.data.vendedor_id)
      .maybeSingle()
    targetVendor = fallback.data as typeof targetVendor
    targetVendorError = fallback.error as typeof targetVendorError
  }

  if (targetVendorError || !targetVendor) {
    return { success: false, message: 'Vendedor selecionado não encontrado.' }
  }

  if (!hasSalesAccess(targetVendor as { role?: string | null; sales_access?: boolean | null })) {
    return { success: false, message: 'Usuário sem acesso a vendas (indicações/comissão).' }
  }

  // If assigning to another vendor, validate permissions (supervisor or admin)
  if (parsed.data.vendedor_id !== user.id) {
    if (role === 'supervisor') {
      const permission = await assertSupervisorCanAssignInternalVendor(user.id, parsed.data.vendedor_id)
      if (!permission.allowed) {
        return { success: false, message: permission.message }
      }
    } else {
      const isAdmin = hasFullAccess(role ?? null, department) || ['funcionario_n1', 'funcionario_n2'].includes(role ?? '')
      if (!isAdmin) {
        return { success: false, message: 'Você não tem permissão para atribuir templates para este vendedor.' }
      }
    }
  }

  const base_payload: TemplateBasePayload = {
    marca: 'rental',
    tipoPessoa: 'PJ',
    nomeEmpresa: parsed.data.nome_empresa?.trim() || '',
    cnpj: sanitizeDigits(parsed.data.cnpj),
    emailSignatario: parsed.data.email.trim().toLowerCase(),
    emailFatura: parsed.data.email.trim().toLowerCase(),
    telefoneCobranca: sanitizePhone(parsed.data.telefone),
    whatsappSignatario: sanitizePhone(parsed.data.telefone),
    representanteLegal: parsed.data.representante_legal?.trim() || '',
    cpfRepresentante: parsed.data.cpf_representante ? sanitizeDigits(parsed.data.cpf_representante) : '',
    rgRepresentante: parsed.data.rg_representante?.trim() || '',
  }

  const { data, error } = await supabase
    .from('indicacao_templates')
    .insert({
      name: parsed.data.name.trim(),
      user_id: user.id,
      vendedor_id: parsed.data.vendedor_id,
      marca: 'rental',
      tipo: 'PJ',
      base_payload,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Erro ao criar template:', error)
    return { success: false, message: error.message }
  }

  revalidatePath('/admin/indicacoes/templates')
  return { success: true, id: data?.id }
}

const csvSchema = z.object({
  templateId: z.string().min(1),
  rawCsv: z.string().min(1, 'Cole ou envie um CSV válido.'),
})

type ImportError = { line: number; codigo_instalacao?: string | null; reason: string }

function extractField(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (key in row && row[key] != null && String(row[key]).trim().length > 0) {
      return String(row[key]).trim()
    }
  }
  return ''
}

export async function importTemplateItemsFromCsv(payload: z.infer<typeof csvSchema>) {
  const parsed = csvSchema.safeParse(payload)
  if (!parsed.success) {
    return { success: false, message: 'CSV inválido.', errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autorizado.' }

  const { data: template, error: templateError } = await supabase
    .from('indicacao_templates')
    .select('id')
    .eq('id', parsed.data.templateId)
    .single()

  if (templateError || !template) {
    return { success: false, message: 'Template não encontrado.' }
  }

  const csvParsed = Papa.parse<Record<string, string>>(parsed.data.rawCsv.trim(), {
    header: true,
    skipEmptyLines: true,
    delimiter: "",
  })

  if (csvParsed.errors?.length) {
    return {
      success: false,
      message: `Erro ao ler CSV: ${csvParsed.errors[0]?.message ?? 'formato inválido'}`,
    }
  }

  const rows = csvParsed.data ?? []
  if (rows.length === 0) {
    return { success: false, message: 'Nenhuma linha encontrada no CSV.' }
  }

  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string> = {}
    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = normalizeHeader(key)
      if (!normalizedKey) return
      normalized[normalizedKey] = String(value ?? '').trim()
    })
    return normalized
  })

  const headerKeys = Object.keys(normalizedRows[0] ?? {})
  const expectedHeaderKeys = [
    'codigoinstalacao',
    'codigo_instalacao',
    'instalacao',
    'codinstalacao',
    'codigocliente',
    'codigo_cliente',
    'unidadeconsumidora',
    'localizacaouc',
    'endereco',
  ]
  const hasExpectedHeader = headerKeys.some((key) => expectedHeaderKeys.includes(key))
  if (!hasExpectedHeader) {
    return {
      success: false,
      message: 'Cabeçalho inválido. Use: codigo_instalacao;codigo_cliente;unidade_consumidora',
    }
  }

  const items: Array<{
    line: number
    codigo_instalacao: string
    codigo_cliente?: string | null
    unidade_consumidora?: string | null
  }> = []
  const errors: ImportError[] = []
  const seenCodes = new Set<string>()

  normalizedRows.forEach((row, index) => {
    const line = index + 2 // header + 1
    const codigoInstalacao = extractField(row, [
      'codigoinstalacao',
      'codigo_instalacao',
      'instalacao',
      'codinstalacao',
    ])
    const codigoCliente = extractField(row, [
      'codigocliente',
      'codigo_cliente',
      'uc',
      'unidade',
      'codigouc',
    ])
    const unidadeConsumidora = extractField(row, [
      'unidadeconsumidora',
      'localizacaouc',
      'endereco',
      'localizacao',
    ])

    const normalizedCode = codigoInstalacao ? normalizeInstallationCode(codigoInstalacao) : ''
    if (!normalizedCode) {
      errors.push({ line, reason: 'Código de instalação ausente.' })
      return
    }

    if (seenCodes.has(normalizedCode)) {
      errors.push({ line, codigo_instalacao: normalizedCode, reason: 'Código de instalação duplicado no CSV.' })
      return
    }

    if (!unidadeConsumidora) {
      errors.push({ line, codigo_instalacao: normalizedCode, reason: 'Endereço da UC ausente.' })
      return
    }

    seenCodes.add(normalizedCode)
    items.push({
      line,
      codigo_instalacao: normalizedCode,
      codigo_cliente: codigoCliente || null,
      unidade_consumidora: unidadeConsumidora || null,
    })
  })

  if (items.length === 0) {
    return { success: false, message: 'Nenhuma linha válida para importar.', errors }
  }

  // Check duplicates against existing indications and template items
  const supabaseAdmin = createSupabaseServiceClient()
  const codes = items.map((item) => item.codigo_instalacao)

  const existingCodes = new Set<string>()
  for (const chunk of chunkArray(codes, 200)) {
    const { data } = await supabaseAdmin
      .from('indicacoes')
      .select('codigo_instalacao')
      .in('codigo_instalacao', chunk)
    ;(data ?? []).forEach((row) => {
      if (row.codigo_instalacao) existingCodes.add(row.codigo_instalacao)
    })
  }

  const existingTemplateCodes = new Set<string>()
  for (const chunk of chunkArray(codes, 200)) {
    const { data } = await supabaseAdmin
      .from('indicacao_template_items')
      .select('codigo_instalacao')
      .in('codigo_instalacao', chunk)
    ;(data ?? []).forEach((row) => {
      if (row.codigo_instalacao) existingTemplateCodes.add(row.codigo_instalacao)
    })
  }

  const insertRows: Array<{
    template_id: string
    codigo_cliente: string | null
    codigo_instalacao: string
    unidade_consumidora: string | null
  }> = []
  items.forEach((item) => {
    const line = item.line
    if (existingCodes.has(item.codigo_instalacao)) {
      errors.push({
        line,
        codigo_instalacao: item.codigo_instalacao,
        reason: 'Código de instalação já existe nas indicações.',
      })
      return
    }
    if (existingTemplateCodes.has(item.codigo_instalacao)) {
      errors.push({
        line,
        codigo_instalacao: item.codigo_instalacao,
        reason: 'Código de instalação já existe em outro template.',
      })
      return
    }
    insertRows.push({
      template_id: parsed.data.templateId,
      codigo_cliente: item.codigo_cliente ?? null,
      codigo_instalacao: item.codigo_instalacao,
      unidade_consumidora: item.unidade_consumidora ?? null,
    })
  })

  if (insertRows.length === 0) {
    return { success: false, message: 'Nenhuma linha válida para inserir.', errors }
  }

  for (const chunk of chunkArray(insertRows, 200)) {
    const { error } = await supabase
      .from('indicacao_template_items')
      .insert(chunk)
    if (error) {
      console.error('Erro ao inserir itens do template:', error)
      return { success: false, message: error.message, errors }
    }
  }

  revalidatePath(`/admin/indicacoes/templates/${parsed.data.templateId}`)
  return {
    success: true,
    inserted: insertRows.length,
    skipped: errors.length,
    errors,
  }
}

export async function generateIndicacoesFromTemplate(templateId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Não autorizado.' }

  const { data: template, error: templateError } = await supabase
    .from('indicacao_templates')
    .select('id, vendedor_id, base_payload')
    .eq('id', templateId)
    .single()

  if (templateError || !template) {
    return { success: false, message: 'Template não encontrado.' }
  }

  const basePayload = (template.base_payload ?? {}) as TemplateBasePayload
  const email =
    String(basePayload.emailSignatario || basePayload.emailFatura || basePayload.email || '')
      .toLowerCase()
      .trim()
  const telefone = sanitizePhone(String(basePayload.telefoneCobranca || basePayload.whatsappSignatario || basePayload.telefone || ''))

  if (!email || !telefone) {
    return {
      success: false,
      message: 'Template inválido: email e telefone são obrigatórios.',
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('indicacao_template_items')
    .select('id, codigo_instalacao, codigo_cliente, unidade_consumidora, status')
    .eq('template_id', templateId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })

  if (itemsError) {
    console.error('Erro ao buscar itens do template:', itemsError)
    return { success: false, message: itemsError.message }
  }

  if (!items || items.length === 0) {
    return { success: false, message: 'Nenhum item pendente para gerar.' }
  }

  const codes = items.map((item) => item.codigo_instalacao).filter(Boolean)
  const supabaseAdmin = createSupabaseServiceClient()
  const existingCodes = new Set<string>()
  for (const chunk of chunkArray(codes, 200)) {
    const { data } = await supabaseAdmin
      .from('indicacoes')
      .select('codigo_instalacao')
      .in('codigo_instalacao', chunk)
    ;(data ?? []).forEach((row) => {
      if (row.codigo_instalacao) existingCodes.add(row.codigo_instalacao)
    })
  }

  let created = 0
  let skipped = 0
  let failed = 0

  for (const item of items) {
    const codigoInstalacao = normalizeInstallationCode(item.codigo_instalacao || '')
    if (!codigoInstalacao) {
      skipped++
      await supabase
        .from('indicacao_template_items')
        .update({ status: 'ERROR', error_message: 'Código de instalação ausente.' })
        .eq('id', item.id)
      continue
    }

    if (existingCodes.has(codigoInstalacao)) {
      skipped++
      await supabase
        .from('indicacao_template_items')
        .update({ status: 'ERROR', error_message: 'Código de instalação já existe nas indicações.' })
        .eq('id', item.id)
      continue
    }

    const payload = {
      tipo: 'PJ',
      nome: codigoInstalacao,
      email,
      telefone,
      status: 'EM_ANALISE',
      user_id: template.vendedor_id,
      marca: 'rental',
      documento: basePayload.cnpj ? sanitizeDigits(String(basePayload.cnpj)) : null,
      unidade_consumidora: item.unidade_consumidora ?? null,
      codigo_cliente: item.codigo_cliente ?? null,
      codigo_instalacao: codigoInstalacao,
    }

    const result = await createIndicationAction(payload)
    if (!result.success || !result.id) {
      failed++
      await supabase
        .from('indicacao_template_items')
        .update({
          status: 'ERROR',
          error_message: result.message || 'Erro ao criar indicação.',
        })
        .eq('id', item.id)
      continue
    }

    const metadata = {
      ...basePayload,
      codigoInstalacao: codigoInstalacao,
      codigoClienteEnergia: item.codigo_cliente ?? null,
      localizacaoUC: item.unidade_consumidora ?? null,
    }

    const storageOwnerId = template.vendedor_id || user.id
    const storage = supabaseAdmin.storage.from('indicacoes')
    const metadataUpload = await storage.upload(
      `${storageOwnerId}/${result.id}/metadata.json`,
      new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
      { upsert: true, cacheControl: '3600', contentType: 'application/json' }
    )

    if (metadataUpload.error) {
      console.error('Erro ao salvar metadata do template:', metadataUpload.error)
    }

    created++
    existingCodes.add(codigoInstalacao)
    await supabase
      .from('indicacao_template_items')
      .update({
        status: 'CREATED',
        indicacao_id: result.id,
        error_message: null,
      })
      .eq('id', item.id)
  }

  revalidatePath(`/admin/indicacoes/templates/${templateId}`)
  revalidatePath('/admin/indicacoes')

  return {
    success: true,
    created,
    skipped,
    failed,
  }
}
