export type ClicksignWebhookData = {
  action: 'create_contract' | 'test_connection'
  tipo_pessoa?: 'PF' | 'PJ'
  indicacao_id?: string
  timestamp: string
  cliente?: {
    nome?: string
    email?: string
    telefone?: string
    tipo_pessoa?: string
  }
  documento?: {
    cpf?: string
    rg?: string
    cnpj?: string
    nome_empresa?: string
    representante_legal?: string
    cpf_representante?: string
    rg_representante?: string
  }
  endereco?: {
    logradouro?: string
    numero?: string
    bairro?: string
    endereco_completo?: string
    cidade?: string
    estado?: string
    cep?: string
  }
  energia?: {
    codigo_cliente?: string
    consumo_kwh?: number
    valor_conta?: number
  }
  vendedor?: {
    id?: string
    nome?: string
    telefone?: string
    cpf?: string
    cnpj?: string
    data_venda?: string
  }
  documentos_anexados?: Record<string, string | undefined>
  observacoes?: string
  data_criacao?: string
  status_atual?: string
}

export type ClicksignResponse = {
  success: boolean
  message: string
  contract_id?: string
  status?: string
  sign_url?: string
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function toOptionalIsoString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === "object") {
    const maybeDateLike = value as { toISOString?: unknown }
    if (typeof maybeDateLike.toISOString === "function") {
      try {
        return maybeDateLike.toISOString()
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export class ClicksignService {
  private static config = {
    webhookUrl: process.env.NEXT_PUBLIC_ZAPIER_WEBHOOK_URL || '',
    timeout: 30000,
    maxRetries: 3,
  }

  static async criarContrato(data: ClicksignWebhookData): Promise<ClicksignResponse> {
    try {
      const response = await this.sendWebhookWithRetry(data)
      return { success: true, message: 'Contrato criado', ...(response ?? {}) }
    } catch (error) {
      console.error('Erro Clicksign:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      }
    }
  }

  static async testarConexao(): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendWebhookWithRetry({ action: 'test_connection', timestamp: new Date().toISOString() })
      return { success: true, message: 'Zapier funcionando' }
    } catch {
      return { success: false, message: 'Erro de conexão' }
    }
  }

  private static async sendWebhookWithRetry(
    data: unknown
  ): Promise<Partial<ClicksignResponse> | { success: true }> {
    if (!this.config.webhookUrl) throw new Error('Webhook Zapier não configurado')

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.config.timeout)

        const res = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        })

        clearTimeout(timeout)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const text = await res.text()
        try {
          return JSON.parse(text)
        } catch {
          return { success: true }
        }
      } catch (err) {
        if (attempt === this.config.maxRetries) throw err
        await new Promise((r) => setTimeout(r, attempt * 2000))
      }
    }

    throw new Error("Falha inesperada ao enviar webhook do Clicksign.")
  }

  static prepararDados(indicacao: unknown): ClicksignWebhookData {
    const source = indicacao && typeof indicacao === "object" ? (indicacao as Record<string, unknown>) : {}
    const tipoPessoa = source.tipoPessoa === "PF" || source.tipoPessoa === "PJ" ? source.tipoPessoa : undefined
    const vendedorNome =
      toOptionalString(source.vendedorNome) ?? toOptionalString(source.vendedorNomePF)
    const vendedorTelefone =
      toOptionalString(source.vendedorTelefone) ?? toOptionalString(source.vendedorTelefonePF)
    const dataVenda =
      tipoPessoa === "PF"
        ? toOptionalIsoString(source.dataVendaPF)
        : toOptionalIsoString(source.dataVenda)

    return {
      action: 'create_contract',
      tipo_pessoa: tipoPessoa,
      indicacao_id: toOptionalString(source.id),
      timestamp: new Date().toISOString(),
      cliente: {
        nome: toOptionalString(source.nomeCliente),
        email: toOptionalString(source.emailCliente),
        telefone: toOptionalString(source.telefoneCliente),
        tipo_pessoa: tipoPessoa === 'PF' ? 'Pessoa Física' : tipoPessoa === 'PJ' ? 'Pessoa Jurídica' : undefined,
      },
      documento:
        tipoPessoa === 'PF'
          ? { cpf: toOptionalString(source.cpfCnpj), rg: toOptionalString(source.rg) }
          : {
              cnpj: toOptionalString(source.cpfCnpj),
              nome_empresa: toOptionalString(source.nomeEmpresa),
              representante_legal: toOptionalString(source.representanteLegal),
              cpf_representante: toOptionalString(source.cpfRepresentante),
              rg_representante: toOptionalString(source.rgRepresentante),
            },
      endereco: {
        cidade: toOptionalString(source.cidade),
        estado: toOptionalString(source.estado),
        cep: toOptionalString(source.cep),
        ...(tipoPessoa === 'PJ'
          ? {
              logradouro: toOptionalString(source.logradouro),
              numero: toOptionalString(source.numero),
              bairro: toOptionalString(source.bairro),
            }
          : { endereco_completo: toOptionalString(source.endereco) }),
      },
      energia: {
        codigo_cliente: toOptionalString(source.codigoClienteEnergia),
        consumo_kwh: toOptionalNumber(source.consumoMedioKwh),
        valor_conta: toOptionalNumber(source.valorContaEnergia),
      },
      vendedor: {
        id: toOptionalString(source.vendedorId),
        nome: vendedorNome,
        telefone: vendedorTelefone,
        ...(tipoPessoa === 'PF'
          ? { cpf: toOptionalString(source.vendedorCPF), data_venda: dataVenda }
          : { cnpj: toOptionalString(source.vendedorCNPJ), data_venda: dataVenda }),
      },
      documentos_anexados: {},
      observacoes: toOptionalString(source.observacoes) || '',
      data_criacao: toOptionalIsoString(source.createdAt) || new Date().toISOString(),
      status_atual: toOptionalString(source.status) || 'EM_ANALISE',
    }
  }
}
