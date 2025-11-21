"use client"

import { useCallback, useState } from "react"
import { ClicksignService, type ClicksignResponse, type ClicksignWebhookData } from "@/lib/integrations/clicksign"

export function useClicksign() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const criarContrato = useCallback(async (indicacao: any): Promise<ClicksignResponse | null> => {
    try {
      setLoading(true)
      setError(null)
      const payload: ClicksignWebhookData = ClicksignService.prepararDados(indicacao)
      const result = await ClicksignService.criarContrato(payload)
      if (!result.success) setError(result.message)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido"
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
      const message = err instanceof Error ? err.message : "Erro de conexão"
      setError(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }, [])

  return { criarContrato, testarConexao, loading, error }
}
