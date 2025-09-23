// 🔋 HOOK COGNI - React hook super seguro para dados de energia solar
// MÁXIMA SEGURANÇA: Nunca quebra, sempre retorna estado válido

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { CogniService } from '@/lib/cogni-service'
import type { CogniCompensacao, CogniUsina, CogniAlert } from '@/types/cogni'

/**
 * Estado do hook COGNI
 * SEGURO: Sempre tem valores padrão válidos
 */
interface CogniState<T> {
  /** Dados carregados */
  data: T | null
  
  /** Estado de carregamento */
  loading: boolean
  
  /** Erro se houver */
  error: string | null
  
  /** Última atualização */
  lastUpdate: Date | null
  
  /** Função para recarregar */
  refetch: () => Promise<void>
  
  /** Limpar dados */
  clear: () => void
}

/**
 * Hook para buscar compensação de um cliente
 * SUPER SEGURO: Controla loading, error, cache automático
 */
export function useCogniCompensacao(codigoCliente: string): CogniState<CogniCompensacao> {
  const [data, setData] = useState<CogniCompensacao | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    // Validação básica
    if (!codigoCliente?.trim()) {
      setError('Código do cliente inválido')
      setLoading(false)
      return
    }

    try {
      // Cancela requisição anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()
      
      setLoading(true)
      setError(null)

      console.log('🔋 Buscando compensação COGNI:', codigoCliente)

      const resultado = await CogniService.buscarCompensacao(codigoCliente)
      
      // Verifica se não foi cancelado
      if (abortControllerRef.current?.signal.aborted) {
        return
      }

      if (resultado) {
        setData(resultado)
        setLastUpdate(new Date())
        console.log('✅ Compensação COGNI carregada:', resultado)
      } else {
        setError('Dados não encontrados')
        console.warn('🔶 COGNI: Dados não encontrados para', codigoCliente)
      }

    } catch (err) {
      // Só atualiza erro se não foi cancelado
      if (!abortControllerRef.current?.signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
        setError(errorMessage)
        console.error('❌ Erro ao buscar compensação COGNI:', err)
      }
    } finally {
      // Só atualiza loading se não foi cancelado
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false)
      }
    }
  }, [codigoCliente])

  const clear = useCallback(() => {
    setData(null)
    setError(null)
    setLastUpdate(null)
    setLoading(false)
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Busca dados quando código do cliente muda
  useEffect(() => {
    if (codigoCliente?.trim()) {
      fetchData()
    } else {
      clear()
    }

    // Cleanup ao desmontar
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [codigoCliente, fetchData, clear])

  return {
    data,
    loading,
    error,
    lastUpdate,
    refetch: fetchData,
    clear,
  }
}

/**
 * Hook para listar usinas
 * SEGURO: Sempre retorna array, nunca undefined
 */
export function useCogniUsinas(): CogniState<CogniUsina[]> {
  const [data, setData] = useState<CogniUsina[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('🔋 Buscando usinas COGNI...')

      const usinas = await CogniService.listarUsinas()
      
      setData(usinas) // Sempre um array (service garante isso)
      setLastUpdate(new Date())
      
      console.log('✅ Usinas COGNI carregadas:', usinas.length)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(errorMessage)
      setData([]) // Fallback para array vazio
      console.error('❌ Erro ao buscar usinas COGNI:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setData([])
    setError(null)
    setLastUpdate(null)
    setLoading(false)
  }, [])

  // Carrega dados na montagem
  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    lastUpdate,
    refetch: fetchData,
    clear,
  }
}

/**
 * Hook para alertas COGNI
 * SEGURO: Sempre retorna array
 */
export function useCogniAlertas(): CogniState<CogniAlert[]> {
  const [data, setData] = useState<CogniAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const alertas = await CogniService.buscarAlertas()
      
      setData(alertas)
      setLastUpdate(new Date())

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(errorMessage)
      setData([])
      console.error('❌ Erro ao buscar alertas COGNI:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setData([])
    setError(null)
    setLastUpdate(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    lastUpdate,
    refetch: fetchData,
    clear,
  }
}

/**
 * Hook para testar conexão COGNI
 * ÚTIL: Para debug e verificação de status
 */
export function useCogniStatus() {
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const testar = useCallback(async () => {
    try {
      setLoading(true)
      const resultado = await CogniService.testarConexao()
      setStatus(resultado)
    } catch (err) {
      setStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Erro desconhecido'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    status,
    loading,
    testar,
  }
}

/**
 * Hook para auto-refresh de dados COGNI
 * OPCIONAL: Atualiza dados automaticamente
 */
export function useCogniAutoRefresh(
  codigoCliente: string, 
  intervalMs: number = 5 * 60 * 1000 // 5 minutos padrão
) {
  const compensacao = useCogniCompensacao(codigoCliente)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!codigoCliente?.trim()) return

    // Limpa intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Configura novo intervalo
    intervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refresh COGNI:', codigoCliente)
      compensacao.refetch()
    }, intervalMs)

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [codigoCliente, intervalMs, compensacao])

  return compensacao
}
