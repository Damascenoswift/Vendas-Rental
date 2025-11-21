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
    } catch (_e) {
      return { success: false, message: 'Erro de conexão' }
    }
  }

  private static async sendWebhookWithRetry(data: unknown): Promise<any> {
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
  }

  static prepararDados(indicacao: any): ClicksignWebhookData {
    return {
      action: 'create_contract',
      tipo_pessoa: indicacao.tipoPessoa,
      indicacao_id: indicacao.id,
      timestamp: new Date().toISOString(),
      cliente: {
        nome: indicacao.nomeCliente,
        email: indicacao.emailCliente,
        telefone: indicacao.telefoneCliente,
        tipo_pessoa: indicacao.tipoPessoa === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica',
      },
      documento:
        indicacao.tipoPessoa === 'PF'
          ? { cpf: indicacao.cpfCnpj, rg: indicacao.rg }
          : {
              cnpj: indicacao.cpfCnpj,
              nome_empresa: indicacao.nomeEmpresa,
              representante_legal: indicacao.representanteLegal,
              cpf_representante: indicacao.cpfRepresentante,
              rg_representante: indicacao.rgRepresentante,
            },
      endereco: {
        cidade: indicacao.cidade,
        estado: indicacao.estado,
        cep: indicacao.cep,
        ...(indicacao.tipoPessoa === 'PJ'
          ? { logradouro: indicacao.logradouro, numero: indicacao.numero, bairro: indicacao.bairro }
          : { endereco_completo: indicacao.endereco }),
      },
      energia: {
        codigo_cliente: indicacao.codigoClienteEnergia,
        consumo_kwh: indicacao.consumoMedioKwh,
        valor_conta: indicacao.valorContaEnergia,
      },
      vendedor: {
        id: indicacao.vendedorId,
        nome: indicacao.vendedorNome || indicacao.vendedorNomePF,
        telefone: indicacao.vendedorTelefone || indicacao.vendedorTelefonePF,
        ...(indicacao.tipoPessoa === 'PF'
          ? { cpf: indicacao.vendedorCPF, data_venda: indicacao.dataVendaPF?.toISOString?.() }
          : { cnpj: indicacao.vendedorCNPJ, data_venda: indicacao.dataVenda?.toISOString?.() }),
      },
      documentos_anexados: {},
      observacoes: indicacao.observacoes || '',
      data_criacao: indicacao.createdAt?.toISOString?.() || new Date().toISOString(),
      status_atual: indicacao.status || 'EM_ANALISE',
    }
  }
}
