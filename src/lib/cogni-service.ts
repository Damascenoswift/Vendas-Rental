// 🔋 COGNI SERVICE - Integração super segura com API de energia solar
// CAUTELA MÁXIMA: Múltiplos fallbacks, nunca quebra a aplicação

import type { 
  CogniCompensacao, 
  CogniUsina, 
  CogniAlert, 
  CogniMetricas,
  CogniApiResponse 
} from '@/types/cogni'

/**
 * Configuração da API COGNI
 * SEGURO: Valores padrão para evitar quebras
 */
const COGNI_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_COGNI_API_URL || 'https://api.cogni.group',
  apiToken: process.env.NEXT_PUBLIC_COGNI_API_TOKEN || '',
  secretKey: process.env.NEXT_PUBLIC_COGNI_SECRET_KEY || '',
  timeout: 10000, // 10s timeout
  maxRetries: 3,
  retryDelay: 2000, // 2s entre tentativas
} as const

/**
 * Cache simples em memória
 * SEGURO: Evita chamadas desnecessárias à API
 */
class CogniCache {
  private static cache = new Map<string, { data: any; timestamp: number }>()
  private static TTL = 5 * 60 * 1000 // 5 minutos

  static get<T>(key: string): T | null {
    try {
      const item = this.cache.get(key)
      if (!item) return null
      
      if (Date.now() - item.timestamp > this.TTL) {
        this.cache.delete(key)
        return null
      }
      
      return item.data as T
    } catch (error) {
      console.warn('🔶 Cache error:', error)
      return null
    }
  }

  static set(key: string, data: any): void {
    try {
      this.cache.set(key, { data, timestamp: Date.now() })
    } catch (error) {
      console.warn('🔶 Cache set error:', error)
    }
  }

  static clear(): void {
    try {
      this.cache.clear()
    } catch (error) {
      console.warn('🔶 Cache clear error:', error)
    }
  }
}

/**
 * Service principal do COGNI
 * SUPER SEGURO: Nunca quebra, sempre retorna algo
 */
export class CogniService {
  /**
   * Headers padrão para requisições
   * SEGURO: Verifica se tokens existem
   */
  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'RentalApp-NextJS/1.0',
    }

    if (COGNI_CONFIG.apiToken) {
      headers['Authorization'] = `Bearer ${COGNI_CONFIG.apiToken}`
    }

    if (COGNI_CONFIG.secretKey) {
      headers['X-Secret-Key'] = COGNI_CONFIG.secretKey
    }

    return headers
  }

  /**
   * Requisição HTTP com retry e timeout
   * SUPER SEGURO: Múltiplas camadas de proteção
   */
  private static async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<CogniApiResponse<T>> {
    const url = `${COGNI_CONFIG.baseUrl}${endpoint}`
    
    for (let attempt = 1; attempt <= COGNI_CONFIG.maxRetries; attempt++) {
      try {
        console.log(`🔋 COGNI Request [${attempt}/${COGNI_CONFIG.maxRetries}]:`, endpoint)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), COGNI_CONFIG.timeout)

        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getHeaders(),
            ...options.headers,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        
        console.log('✅ COGNI Response:', { endpoint, success: true })
        
        return {
          success: true,
          data,
          timestamp: new Date(),
        }

      } catch (error) {
        console.warn(`🔶 COGNI Error [${attempt}/${COGNI_CONFIG.maxRetries}]:`, error)

        // Se não é a última tentativa, aguarda e tenta novamente
        if (attempt < COGNI_CONFIG.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, COGNI_CONFIG.retryDelay))
          continue
        }

        // Última tentativa falhou - retorna erro estruturado
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          timestamp: new Date(),
        }
      }
    }

    // Fallback final (nunca deveria chegar aqui)
    return {
      success: false,
      error: 'Falha após todas as tentativas',
      timestamp: new Date(),
    }
  }

  /**
   * Busca compensação de um cliente
   * SUPER SEGURO: Cache + fallback + dados mock se necessário
   */
  static async buscarCompensacao(codigoCliente: string): Promise<CogniCompensacao | null> {
    try {
      if (!codigoCliente?.trim()) {
        console.warn('🔶 COGNI: Código do cliente inválido')
        return null
      }

      // 1. Verifica cache primeiro
      const cacheKey = `compensacao_${codigoCliente}`
      const cached = CogniCache.get<CogniCompensacao>(cacheKey)
      if (cached) {
        console.log('🎯 COGNI Cache hit:', codigoCliente)
        return cached
      }

      // 2. Busca na API
      const response = await this.request<any>(`/compensacao/cliente/${codigoCliente}`)
      
      if (response.success && response.data) {
        const compensacao: CogniCompensacao = {
          clienteId: codigoCliente,
          plantId: response.data.plantId || 'unknown',
          compensacaoHoje: response.data.compensacaoHoje || 0,
          compensacaoMes: response.data.compensacaoMes || 0,
          economiaAcumulada: response.data.economiaAcumulada || 0,
          sistemaAtivo: response.data.sistemaAtivo ?? false,
          statusConexao: response.data.statusConexao || 'offline',
          timestamp: new Date(),
        }

        // Salva no cache
        CogniCache.set(cacheKey, compensacao)
        
        return compensacao
      }

      // 3. Se API falhou, retorna dados padrão (não quebra a aplicação)
      console.warn('🔶 COGNI API falhou, usando dados padrão')
      return {
        clienteId: codigoCliente,
        plantId: 'offline',
        compensacaoHoje: 0,
        compensacaoMes: 0,
        economiaAcumulada: 0,
        sistemaAtivo: false,
        statusConexao: 'error',
        timestamp: new Date(),
      }

    } catch (error) {
      console.error('❌ COGNI Erro crítico:', error)
      
      // NUNCA quebra - sempre retorna algo
      return {
        clienteId: codigoCliente,
        plantId: 'error',
        compensacaoHoje: 0,
        compensacaoMes: 0,
        economiaAcumulada: 0,
        sistemaAtivo: false,
        statusConexao: 'error',
        timestamp: new Date(),
      }
    }
  }

  /**
   * Lista todas as usinas
   * SEGURO: Retorna array vazio se der erro
   */
  static async listarUsinas(): Promise<CogniUsina[]> {
    try {
      const cacheKey = 'usinas_list'
      const cached = CogniCache.get<CogniUsina[]>(cacheKey)
      if (cached) {
        return cached
      }

      const response = await this.request<CogniUsina[]>('/plantas')
      
      if (response.success && Array.isArray(response.data)) {
        CogniCache.set(cacheKey, response.data)
        return response.data
      }

      console.warn('🔶 COGNI: Falha ao listar usinas')
      return []

    } catch (error) {
      console.error('❌ COGNI Erro ao listar usinas:', error)
      return []
    }
  }

  /**
   * Busca alertas do sistema
   * SEGURO: Retorna array vazio se der erro
   */
  static async buscarAlertas(): Promise<CogniAlert[]> {
    try {
      const response = await this.request<CogniAlert[]>('/alertas')
      
      if (response.success && Array.isArray(response.data)) {
        return response.data
      }

      return []

    } catch (error) {
      console.error('❌ COGNI Erro ao buscar alertas:', error)
      return []
    }
  }

  /**
   * Testa conexão com a API
   * SEGURO: Não quebra nunca
   */
  static async testarConexao(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.request('/health')
      
      return {
        success: response.success,
        message: response.success ? 'Conexão OK' : response.error || 'Erro desconhecido'
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro de conexão'
      }
    }
  }

  /**
   * Limpa cache (útil para debug)
   */
  static limparCache(): void {
    CogniCache.clear()
    console.log('🧹 COGNI Cache limpo')
  }
}
