/**
 * Integrações de APIs Externas
 * 
 * Este módulo centraliza todas as integrações com APIs externas:
 * 1. Clicksign - Assinatura digital de contratos
 * 2. Zapier - Automações e webhooks
 * 3. Cogni - Dados imobiliários e CRM
 */

export * from './clicksign'
export * from './zapier'
export * from './cogni'

// Tipos comuns para todas as integrações
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  statusCode?: number
}

export interface WebhookPayload {
  event: string
  timestamp: string
  data: Record<string, unknown>
}

// Configurações gerais
export const INTEGRATION_CONFIG = {
  timeout: 30000, // 30 segundos
  retries: 3,
  baseHeaders: {
    'Content-Type': 'application/json',
    'User-Agent': 'Rental-V2-Clean/1.0'
  }
}
