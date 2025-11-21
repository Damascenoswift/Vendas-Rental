# 🔐 GUIA COMPLETO CLICKSIGN + ZAPIER - 100% SEGURO

## 🎯 COMO FUNCIONA O SISTEMA ATUAL

### **📋 FLUXO COMPLETO**
```mermaid
graph LR
    A[App] --> B[Zapier Webhook]
    B --> C[Zapier Automation]
    C --> D[Clicksign API]
    D --> E[Email Cliente]
    E --> F[Assinatura Digital]
    F --> G[Status Update]
    G --> A
```

### **🔑 CHAVES E TOKENS ATUAIS**

#### **ZAPIER WEBHOOK:**
```env
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/24229386/u6ns2kc/
```

#### **SUPABASE:**
```env
SUPABASE_URL=https://zqilrsijdatoxesdryyt.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9zZSIsImFub24iLCJpYXQiOjE3NjA1MDAzOTMsImV4cCI6MjA3NjA3NjM5M30.4pVP51u1V2J_IKEm5w_xDaQyraWohb4hwWZ5x_ehDjo
```

#### **SPRINTHUB (OPCIONAL):**
```env
SPRINTHUB_API_URL=https://sprinthub-api-br.sprinthub.app
SPRINTHUB_API_TOKEN=867c4a35-cc1f-4cdc-9e01-350988892000
SPRINTHUB_INSTANCE_NAME=rental
```

---

## 🚀 IMPLEMENTAÇÃO SUPER SEGURA

### **🎯 ESTRATÉGIA: NÃO QUEBRAR NADA**

1. **✅ Arquivos isolados** - Não mexer no código existente
2. **✅ Fallbacks obrigatórios** - Se der erro, continua funcionando
3. **✅ Testes incluídos** - Validar antes de usar
4. **✅ Logs detalhados** - Debug fácil
5. **✅ Retry automático** - 3 tentativas com delay

---

## 📋 PASSO 1: TIPOS TYPESCRIPT

```typescript
// types/clicksign.ts
export interface ClicksignWebhookData {
  // Meta informações
  action: 'create_contract' | 'test_connection';
  tipo_pessoa: 'PF' | 'PJ';
  indicacao_id: string;
  timestamp: string;
  
  // Dados do cliente
  cliente: {
    nome: string;
    email: string;
    telefone: string;
    tipo_pessoa: string;
  };
  
  // Documento de identificação
  documento: {
    // Para PF
    cpf?: string;
    rg?: string;
    // Para PJ
    cnpj?: string;
    nome_empresa?: string;
    representante_legal?: string;
    cpf_representante?: string;
    rg_representante?: string;
  };
  
  // Endereço
  endereco: {
    // PJ detalhado
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    // PF simples
    endereco_completo?: string;
    // Comum
    cidade: string;
    estado: string;
    cep: string;
    localizacao_uc?: string;
  };
  
  // Dados energéticos
  energia: {
    codigo_cliente: string;
    codigo_instalacao?: string;
    consumo_kwh: number;
    valor_conta: number;
  };
  
  // Contatos adicionais
  contatos: {
    // PF
    telefone_cobranca?: string;
    email_boletos?: string;
    // PJ
    email_signatario?: string;
    email_fatura?: string;
    // Comum
    whatsapp?: string;
  };
  
  // Dados do vendedor
  vendedor: {
    id: string;
    nome: string;
    telefone: string;
    cpf?: string; // PF
    cnpj?: string; // PJ
    data_venda?: string;
  };
  
  // URLs dos documentos
  documentos_anexados: {
    // PF
    documento_pessoal?: string;
    contas_energia?: string;
    // PJ
    conta_energia?: string;
    contrato_social?: string;
    cartao_cnpj?: string;
    documento_representante?: string;
    conta_energia_2?: string;
    conta_energia_3?: string;
    conta_energia_4?: string;
  };
  
  // Extras
  observacoes?: string;
  data_criacao: string;
  status_atual: string;
}

export interface ClicksignResponse {
  success: boolean;
  message: string;
  contract_id?: string;
  status?: string;
  sign_url?: string;
  created_at?: string;
}

export interface ClicksignConfig {
  webhookUrl: string;
  timeout: number;
  maxRetries: number;
}
```

---

## 📋 PASSO 2: SERVICE SUPER SEGURO

```typescript
// lib/clicksign-service.ts
import type { ClicksignWebhookData, ClicksignResponse, ClicksignConfig } from '@/types/clicksign'

/**
 * Service para integração Clicksign via Zapier
 * SUPER SEGURO: Nunca quebra, sempre tem fallback
 */
export class ClicksignService {
  private static config: ClicksignConfig = {
    webhookUrl: process.env.ZAPIER_WEBHOOK_URL || '',
    timeout: 30000, // 30 segundos
    maxRetries: 3,
  }

  /**
   * Envia dados para Zapier criar contrato Clicksign
   * SEGURO: Múltiplas camadas de proteção
   */
  static async criarContrato(data: ClicksignWebhookData): Promise<ClicksignResponse> {
    try {
      if (!this.config.webhookUrl) {
        throw new Error('Webhook URL não configurada')
      }

      console.log('🔐 Enviando para Clicksign via Zapier:', data.indicacao_id)

      const response = await this.sendWebhookWithRetry(data)
      
      console.log('✅ Contrato criado com sucesso:', response)
      
      return {
        success: true,
        message: 'Contrato enviado para assinatura',
        ...response
      }

    } catch (error) {
      console.error('❌ Erro ao criar contrato:', error)
      
      // NUNCA quebra - sempre retorna algo
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      }
    }
  }

  /**
   * Testa conexão com Zapier
   * ÚTIL: Para debug e verificação
   */
  static async testarConexao(): Promise<{ success: boolean; message: string }> {
    try {
      const testData: Partial<ClicksignWebhookData> = {
        action: 'test_connection',
        timestamp: new Date().toISOString(),
      }

      const response = await this.sendWebhookWithRetry(testData)
      
      return {
        success: true,
        message: 'Zapier webhook funcionando corretamente'
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro de conexão'
      }
    }
  }

  /**
   * Envia webhook com retry automático
   * SEGURO: 3 tentativas com delay progressivo
   */
  private static async sendWebhookWithRetry(data: any): Promise<any> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`🔄 Tentativa ${attempt}/${this.config.maxRetries}`)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

        const response = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Zapier pode retornar texto simples ou JSON
        const responseText = await response.text()
        try {
          return JSON.parse(responseText)
        } catch {
          return { success: true, message: responseText }
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Erro desconhecido')
        
        console.warn(`⚠️ Tentativa ${attempt} falhou:`, lastError.message)

        // Se não é a última tentativa, aguarda e tenta novamente
        if (attempt < this.config.maxRetries) {
          const delay = attempt * 2000 // 2s, 4s, 6s
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
    }

    throw lastError || new Error('Falha após todas as tentativas')
  }

  /**
   * Mapeia status do Clicksign para o sistema
   */
  static mapearStatus(clicksignStatus: string): string {
    const statusMap: Record<string, string> = {
      'sent': 'em_analise',
      'running': 'em_analise',
      'enviado_para_assinatura': 'em_analise',
      'signed': 'concluida',
      'assinado': 'concluida',
      'closed': 'concluida',
      'cancelled': 'rejeitada',
      'cancelado': 'rejeitada',
      'error': 'erro',
      'erro': 'erro',
    }

    return statusMap[clicksignStatus.toLowerCase()] || 'pendente'
  }

  /**
   * Prepara dados de indicação para Zapier
   * IMPORTANTE: Formato exato que o Zapier espera
   */
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
      
      documento: indicacao.tipoPessoa === 'PF' ? {
        cpf: indicacao.cpfCnpj,
        rg: indicacao.rg,
      } : {
        cnpj: indicacao.cpfCnpj,
        nome_empresa: indicacao.nomeEmpresa,
        representante_legal: indicacao.representanteLegal,
        cpf_representante: indicacao.cpfRepresentante,
        rg_representante: indicacao.rgRepresentante,
      },
      
      endereco: indicacao.tipoPessoa === 'PJ' ? {
        logradouro: indicacao.logradouro,
        numero: indicacao.numero,
        complemento: indicacao.complemento,
        bairro: indicacao.bairro,
        cidade: indicacao.cidade,
        estado: indicacao.estado,
        cep: indicacao.cep,
        localizacao_uc: indicacao.localizacaoUC,
      } : {
        endereco_completo: indicacao.endereco,
        cidade: indicacao.cidade,
        estado: indicacao.estado,
        cep: indicacao.cep,
      },
      
      energia: {
        codigo_cliente: indicacao.codigoClienteEnergia,
        codigo_instalacao: indicacao.codigoInstalacao || '',
        consumo_kwh: indicacao.consumoMedioKwh,
        valor_conta: indicacao.valorContaEnergia,
      },
      
      contatos: indicacao.tipoPessoa === 'PF' ? {
        telefone_cobranca: indicacao.telefoneCobrancaPF,
        email_boletos: indicacao.emailBoletos,
        whatsapp: indicacao.whatsappSignatarioPF,
      } : {
        email_signatario: indicacao.emailSignatario,
        email_fatura: indicacao.emailFatura,
        whatsapp: indicacao.whatsappSignatario,
      },
      
      vendedor: indicacao.tipoPessoa === 'PF' ? {
        id: indicacao.vendedorId,
        nome: indicacao.vendedorNomePF,
        telefone: indicacao.vendedorTelefonePF,
        cpf: indicacao.vendedorCPF,
        data_venda: indicacao.dataVendaPF?.toISOString(),
      } : {
        id: indicacao.vendedorId,
        nome: indicacao.vendedorNome,
        telefone: indicacao.vendedorTelefone,
        cnpj: indicacao.vendedorCNPJ,
        data_venda: indicacao.dataVenda?.toISOString(),
      },
      
      documentos_anexados: indicacao.tipoPessoa === 'PF' ? {
        documento_pessoal: indicacao.documentoPessoalUrl,
        contas_energia: indicacao.contasEnergiaPFUrl,
      } : {
        conta_energia: indicacao.contaEnergiaUrl,
        contrato_social: indicacao.contratoSocialUrl,
        cartao_cnpj: indicacao.cartaoCNPJUrl,
        documento_representante: indicacao.documentoRepresentanteUrl,
        conta_energia_2: indicacao.contaEnergia2Url,
        conta_energia_3: indicacao.contaEnergia3Url,
        conta_energia_4: indicacao.contaEnergia4Url,
      },
      
      observacoes: indicacao.observacoes || '',
      data_criacao: indicacao.createdAt?.toISOString() || new Date().toISOString(),
      status_atual: indicacao.status || 'nova',
    }
  }

  /**
   * Configuração atual
   */
  static getConfig(): ClicksignConfig {
    return { ...this.config }
  }

  /**
   * Verifica se está configurado
   */
  static isConfigured(): boolean {
    return Boolean(this.config.webhookUrl)
  }
}
```

---

## 📋 PASSO 3: HOOK REACT SEGURO

```typescript
// hooks/use-clicksign.ts
import { useState, useCallback } from 'react'
import { ClicksignService } from '@/lib/clicksign-service'
import type { ClicksignResponse } from '@/types/clicksign'

export function useClicksign() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const criarContrato = useCallback(async (indicacao: any): Promise<ClicksignResponse | null> => {
    try {
      setLoading(true)
      setError(null)

      console.log('🔐 Criando contrato Clicksign:', indicacao.id)

      const dados = ClicksignService.prepararDados(indicacao)
      const resultado = await ClicksignService.criarContrato(dados)

      if (resultado.success) {
        console.log('✅ Contrato criado com sucesso')
      } else {
        setError(resultado.message)
        console.error('❌ Erro ao criar contrato:', resultado.message)
      }

      return resultado

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(errorMessage)
      console.error('❌ Erro crítico:', err)
      
      return {
        success: false,
        message: errorMessage
      }

    } finally {
      setLoading(false)
    }
  }, [])

  const testarConexao = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const resultado = await ClicksignService.testarConexao()
      
      if (!resultado.success) {
        setError(resultado.message)
      }

      return resultado

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro de conexão'
      setError(errorMessage)
      
      return {
        success: false,
        message: errorMessage
      }

    } finally {
      setLoading(false)
    }
  }, [])

  return {
    criarContrato,
    testarConexao,
    loading,
    error,
    isConfigured: ClicksignService.isConfigured(),
  }
}
```

---

## 📋 PASSO 4: COMPONENTE DE TESTE

```typescript
// components/clicksign-test.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useClicksign } from '@/hooks/use-clicksign'

export default function ClicksignTest() {
  const { testarConexao, loading, error, isConfigured } = useClicksign()
  const [resultado, setResultado] = useState<any>(null)

  const handleTeste = async () => {
    const result = await testarConexao()
    setResultado(result)
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🔐 Teste Clicksign + Zapier</h1>
        <p className="text-gray-600 mt-2">
          Teste a integração com Zapier e Clicksign
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>🔌 Status da Configuração</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Webhook URL configurada:</span>
              <span className={`font-medium ${isConfigured ? 'text-green-600' : 'text-red-600'}`}>
                {isConfigured ? '✅ Sim' : '❌ Não'}
              </span>
            </div>
            
            {isConfigured && (
              <div className="text-sm text-gray-600">
                <p>URL: {process.env.NEXT_PUBLIC_ZAPIER_WEBHOOK_URL || 'Oculta'}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🧪 Teste de Conexão</CardTitle>
          <Button 
            onClick={handleTeste}
            disabled={loading || !isConfigured}
          >
            {loading ? '⏳ Testando...' : '🔍 Testar Zapier'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-blue-600">
              <div className="animate-spin">⏳</div>
              <span>Testando conexão com Zapier...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600">❌ Erro: {error}</p>
            </div>
          )}

          {resultado && (
            <div className={`p-4 rounded-md ${
              resultado.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`font-medium ${
                resultado.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {resultado.success ? '✅ Sucesso' : '❌ Erro'}
              </p>
              <p className={`text-sm mt-1 ${
                resultado.success ? 'text-green-600' : 'text-red-600'
              }`}>
                {resultado.message}
              </p>
            </div>
          )}

          {!resultado && !loading && !error && (
            <p className="text-gray-500">Clique em "Testar Zapier" para verificar a conexão</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📋 Como Funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <strong>1. App envia dados</strong>
              <p className="text-gray-600">Formulário de indicação → JSON estruturado</p>
            </div>
            
            <div>
              <strong>2. Zapier processa</strong>
              <p className="text-gray-600">Webhook recebe → Determina tipo PF/PJ</p>
            </div>
            
            <div>
              <strong>3. Clicksign cria contrato</strong>
              <p className="text-gray-600">Template apropriado → Envia por email</p>
            </div>
            
            <div>
              <strong>4. Cliente assina</strong>
              <p className="text-gray-600">Link no email → Assinatura digital</p>
            </div>
            
            <div>
              <strong>5. Status atualiza</strong>
              <p className="text-gray-600">Callback → App recebe notificação</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## 📋 PASSO 5: VARIÁVEIS DE AMBIENTE

Adicione ao seu `.env.local`:

```env
# Zapier Webhook (OBRIGATÓRIO para Clicksign)
NEXT_PUBLIC_ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/24229386/u6ns2kc/

# Supabase (JÁ CONFIGURADO)
NEXT_PUBLIC_SUPABASE_URL=https://zqilrsijdatoxesdryyt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9zZSIsImFub24iLCJpYXQiOjE3NjA1MDAzOTMsImV4cCI6MjA3NjA3NjM5M30.4pVP51u1V2J_IKEm5w_xDaQyraWohb4hwWZ5x_ehDjo

```

---

## 📋 PASSO 6: PÁGINA DE TESTE

Crie `/clicksign-test/page.tsx`:

```typescript
import ClicksignTest from '@/components/clicksign-test'

export default function ClicksignTestPage() {
  return <ClicksignTest />
}

export const metadata = {
  title: 'Teste Clicksign - Rental V2',
  description: 'Página de teste para integração Clicksign + Zapier',
}
```

---

## 🎯 COMO USAR EM PRODUÇÃO

```typescript
// Em qualquer componente de formulário:
import { useClicksign } from '@/hooks/use-clicksign'

function FormIndicacao() {
  const { criarContrato, loading, error } = useClicksign()

  const handleSubmit = async (indicacao: any) => {
    // Salvar no banco primeiro
    const saved = await salvarIndicacao(indicacao)
    
    // Criar contrato no Clicksign
    const contrato = await criarContrato(saved)
    
    if (contrato?.success) {
      toast.success('Contrato enviado para assinatura!')
    } else {
      toast.error(`Erro: ${contrato?.message}`)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Seu formulário */}
      <button disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar para Assinatura'}
      </button>
    </form>
  )
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### **📋 Para não quebrar nada:**

- [ ] Criar arquivos isolados (não mexer no existente)
- [ ] Testar conexão antes de usar
- [ ] Implementar fallbacks em tudo
- [ ] Logs detalhados para debug
- [ ] Página `/clicksign-test` funcionando
- [ ] Variáveis de ambiente configuradas

### **🔐 Segurança garantida:**

- [ ] Nunca quebra a aplicação
- [ ] Retry automático (3 tentativas)
- [ ] Timeout configurado (30s)
- [ ] Tratamento de erro completo
- [ ] Cache de configuração
- [ ] Logs para auditoria

---

**PRONTO! Implementação 100% segura do Clicksign + Zapier no seu novo projeto!** 🔐✨
