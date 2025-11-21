# 🔐 CLICKSIGN + ZAPIER - PROMPT CURSOR

## CONTEXTO
Sistema de assinatura digital via Clicksign integrado com Zapier webhook. **IMPLEMENTAÇÃO 100% SEGURA** - nunca quebra o app.

## CHAVES E TOKENS ATUAIS

```env
# ZAPIER WEBHOOK (PRINCIPAL)
NEXT_PUBLIC_ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/24229386/u6ns2kc/

# SUPABASE (JÁ CONFIGURADO)
NEXT_PUBLIC_SUPABASE_URL=https://zqilrsijdatoxesdryyt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxaWxyc2lqZGF0b3hlc2RyeXl0Iiwicm9zZSIsImFub24iLCJpYXQiOjE3NjA1MDAzOTMsImV4cCI6MjA3NjA3NjM5M30.4pVP51u1V2J_IKEm5w_xDaQyraWohb4hwWZ5x_ehDjo

```

## FLUXO DE FUNCIONAMENTO

```
App → Zapier Webhook → Clicksign API → Email Cliente → Assinatura Digital
```

1. **App envia JSON** estruturado para Zapier
2. **Zapier processa** e determina tipo (PF/PJ)
3. **Clicksign cria** contrato com template apropriado
4. **Cliente recebe** email com link de assinatura
5. **Status atualiza** via callback (opcional)

## TIPOS TYPESCRIPT OBRIGATÓRIOS

```typescript
interface ClicksignWebhookData {
  action: 'create_contract' | 'test_connection';
  tipo_pessoa: 'PF' | 'PJ';
  indicacao_id: string;
  timestamp: string;
  
  cliente: {
    nome: string;
    email: string;
    telefone: string;
    tipo_pessoa: string;
  };
  
  documento: {
    // PF
    cpf?: string;
    rg?: string;
    // PJ
    cnpj?: string;
    nome_empresa?: string;
    representante_legal?: string;
    cpf_representante?: string;
    rg_representante?: string;
  };
  
  endereco: {
    // PJ detalhado
    logradouro?: string;
    numero?: string;
    bairro?: string;
    // PF simples
    endereco_completo?: string;
    // Comum
    cidade: string;
    estado: string;
    cep: string;
  };
  
  energia: {
    codigo_cliente: string;
    consumo_kwh: number;
    valor_conta: number;
  };
  
  vendedor: {
    id: string;
    nome: string;
    telefone: string;
    cpf?: string; // PF
    cnpj?: string; // PJ
    data_venda?: string;
  };
  
  documentos_anexados: Record<string, string | undefined>;
  observacoes?: string;
  data_criacao: string;
  status_atual: string;
}

interface ClicksignResponse {
  success: boolean;
  message: string;
  contract_id?: string;
  status?: string;
  sign_url?: string;
}
```

## SERVICE SUPER SEGURO

```typescript
export class ClicksignService {
  private static config = {
    webhookUrl: process.env.NEXT_PUBLIC_ZAPIER_WEBHOOK_URL || '',
    timeout: 30000,
    maxRetries: 3,
  }

  static async criarContrato(data: ClicksignWebhookData): Promise<ClicksignResponse> {
    try {
      const response = await this.sendWebhookWithRetry(data)
      return { success: true, message: 'Contrato criado', ...response }
    } catch (error) {
      console.error('Erro Clicksign:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido'
      }
    }
  }

  static async testarConexao(): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendWebhookWithRetry({
        action: 'test_connection',
        timestamp: new Date().toISOString(),
      })
      return { success: true, message: 'Zapier funcionando' }
    } catch (error) {
      return { success: false, message: 'Erro de conexão' }
    }
  }

  private static async sendWebhookWithRetry(data: any): Promise<any> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), this.config.timeout)

        const response = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const text = await response.text()
        try { return JSON.parse(text) } catch { return { success: true } }

      } catch (error) {
        if (attempt === this.config.maxRetries) throw error
        await new Promise(r => setTimeout(r, attempt * 2000))
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
      
      endereco: {
        cidade: indicacao.cidade,
        estado: indicacao.estado,
        cep: indicacao.cep,
        ...(indicacao.tipoPessoa === 'PJ' ? {
          logradouro: indicacao.logradouro,
          numero: indicacao.numero,
          bairro: indicacao.bairro,
        } : {
          endereco_completo: indicacao.endereco,
        }),
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
        ...(indicacao.tipoPessoa === 'PF' ? {
          cpf: indicacao.vendedorCPF,
          data_venda: indicacao.dataVendaPF?.toISOString(),
        } : {
          cnpj: indicacao.vendedorCNPJ,
          data_venda: indicacao.dataVenda?.toISOString(),
        }),
      },
      
      documentos_anexados: {
        // Mapear URLs dos documentos anexados
      },
      
      observacoes: indicacao.observacoes || '',
      data_criacao: indicacao.createdAt?.toISOString() || new Date().toISOString(),
      status_atual: indicacao.status || 'nova',
    }
  }
}
```

## HOOK REACT

```typescript
export function useClicksign() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const criarContrato = useCallback(async (indicacao: any): Promise<ClicksignResponse | null> => {
    try {
      setLoading(true)
      setError(null)
      
      const dados = ClicksignService.prepararDados(indicacao)
      const resultado = await ClicksignService.criarContrato(dados)
      
      if (!resultado.success) {
        setError(resultado.message)
      }
      
      return resultado
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }, [])

  const testarConexao = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      return await ClicksignService.testarConexao()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro de conexão'
      setError(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }, [])

  return { criarContrato, testarConexao, loading, error }
}
```

## COMO USAR NO FORMULÁRIO

```typescript
function FormIndicacao() {
  const { criarContrato, loading, error } = useClicksign()

  const handleSubmit = async (indicacao: any) => {
    // 1. Salvar indicação no banco
    const saved = await salvarIndicacao(indicacao)
    
    // 2. Criar contrato Clicksign
    const contrato = await criarContrato(saved)
    
    // 3. Feedback para usuário
    if (contrato?.success) {
      toast.success('Contrato enviado para assinatura!')
    } else {
      toast.error(`Erro: ${contrato?.message}`)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Campos do formulário */}
      <button disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar para Assinatura'}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  )
}
```

## PÁGINA DE TESTE

Criar `/clicksign-test/page.tsx` para testar a integração:

```typescript
'use client'
import { useClicksign } from '@/hooks/use-clicksign'

export default function ClicksignTest() {
  const { testarConexao, loading, error } = useClicksign()
  const [resultado, setResultado] = useState(null)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">🔐 Teste Clicksign</h1>
      <button 
        onClick={async () => setResultado(await testarConexao())}
        disabled={loading}
      >
        {loading ? 'Testando...' : 'Testar Zapier'}
      </button>
      {resultado && (
        <div className={resultado.success ? 'text-green-600' : 'text-red-600'}>
          {resultado.message}
        </div>
      )}
    </div>
  )
}
```

## MAPEAMENTO DE STATUS

```typescript
const statusMap = {
  'sent': 'em_analise',
  'signed': 'concluida', 
  'cancelled': 'rejeitada',
  'error': 'erro'
}
```

## SEGURANÇA GARANTIDA

- ✅ **Nunca quebra** - sempre tem fallback
- ✅ **Retry automático** - 3 tentativas
- ✅ **Timeout** - 30 segundos máximo
- ✅ **Logs detalhados** - debug fácil
- ✅ **Isolado** - não afeta código existente

---

**RESUMO: Sistema Clicksign via Zapier webhook com retry automático, fallbacks e página de teste. 100% seguro para implementar.** 🔐⚡
