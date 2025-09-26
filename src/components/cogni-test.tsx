// 🔋 COMPONENTE TESTE COGNI - Isolado e seguro para validar integração
// SUPER SEGURO: Pode ser removido facilmente, não afeta nada

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCogniCompensacao, useCogniUsinas, useCogniStatus } from '@/hooks/use-cogni'

/**
 * Card para mostrar dados de compensação
 * SEGURO: Trata todos os casos (loading, error, dados)
 */
function CompensacaoCard({ codigoCliente }: { codigoCliente: string }) {
  const { data, loading, error, lastUpdate, refetch } = useCogniCompensacao(codigoCliente)

  if (!codigoCliente.trim()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>💡 Compensação Energética</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Digite um código de cliente para buscar dados</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>💡 Compensação - {codigoCliente}</CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refetch}
          disabled={loading}
        >
          {loading ? '⏳' : '🔄'} Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin">⏳</div>
            <span>Buscando dados COGNI...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">❌ Erro: {error}</p>
            <p className="text-sm text-red-500 mt-1">
              Isso é normal se a API COGNI não estiver configurada
            </p>
          </div>
        )}

        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-50 rounded-md">
                <p className="text-sm text-green-600">Hoje</p>
                <p className="text-lg font-bold text-green-700">
                  R$ {data.compensacaoHoje.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-600">Este Mês</p>
                <p className="text-lg font-bold text-blue-700">
                  R$ {data.compensacaoMes.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="p-3 bg-purple-50 rounded-md">
              <p className="text-sm text-purple-600">Economia Total</p>
              <p className="text-xl font-bold text-purple-700">
                R$ {data.economiaAcumulada.toFixed(2)}
              </p>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Status: 
                <span className={`ml-1 font-medium ${
                  data.sistemaAtivo ? 'text-green-600' : 'text-red-600'
                }`}>
                  {data.sistemaAtivo ? '🟢 Ativo' : '🔴 Inativo'}
                </span>
              </span>
              <span>Conexão: {data.statusConexao}</span>
            </div>

            {lastUpdate && (
              <p className="text-xs text-gray-500">
                Última atualização: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Card para mostrar usinas
 * SEGURO: Sempre mostra algo, mesmo que seja lista vazia
 */
function UsinasCard() {
  const { data, loading, error, refetch } = useCogniUsinas()

  return (
    <Card>
      <CardHeader>
        <CardTitle>🏭 Usinas Geradoras</CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refetch}
          disabled={loading}
        >
          {loading ? '⏳' : '🔄'} Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin">⏳</div>
            <span>Carregando usinas...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">❌ Erro: {error}</p>
          </div>
        )}

        {data && data.length === 0 && !loading && (
          <p className="text-gray-500">Nenhuma usina encontrada</p>
        )}

        {data && data.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {data.length} usina{data.length !== 1 ? 's' : ''} encontrada{data.length !== 1 ? 's' : ''}
            </p>
            
            <div className="max-h-48 overflow-y-auto space-y-2">
              {data.slice(0, 5).map((usina, index) => (
                <div key={usina.id || index} className="p-2 bg-gray-50 rounded-md text-sm">
                  <div className="font-medium">{usina.name}</div>
                  <div className="text-gray-600">
                    Status: {usina.status} | 
                    Capacidade: {usina.capacity ? `${usina.capacity}kW` : 'N/A'}
                  </div>
                </div>
              ))}
              {data.length > 5 && (
                <p className="text-xs text-gray-500">
                  ... e mais {data.length - 5} usinas
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Card para testar status da API
 * ÚTIL: Para debug e verificação de conectividade
 */
function StatusCard() {
  const { status, loading, testar } = useCogniStatus()

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔌 Status da API COGNI</CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={testar}
          disabled={loading}
        >
          {loading ? '⏳' : '🔍'} Testar Conexão
        </Button>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin">⏳</div>
            <span>Testando conexão...</span>
          </div>
        )}

        {status && (
          <div className={`p-3 rounded-md ${
            status.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`font-medium ${
              status.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {status.success ? '✅ Conectado' : '❌ Erro de Conexão'}
            </p>
            <p className={`text-sm mt-1 ${
              status.success ? 'text-green-600' : 'text-red-600'
            }`}>
              {status.message}
            </p>
          </div>
        )}

        {!status && !loading && (
          <p className="text-gray-500">Clique em &quot;Testar Conexão&quot; para verificar a API</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Componente principal de teste COGNI
 * COMPLETAMENTE ISOLADO: Pode ser removido sem afetar nada
 */
export default function CogniTest() {
  const [codigoCliente, setCodigoCliente] = useState('CLI001')

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">🔋 Teste COGNI</h1>
        <p className="text-gray-600 mt-2">
          Componente isolado para testar integração com API de energia solar
        </p>
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-700">
            ⚠️ Este é um componente de teste. Pode ser removido facilmente.
          </p>
        </div>
      </div>

      {/* Input para código do cliente */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 Buscar Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Digite o código do cliente (ex: CLI001)"
              value={codigoCliente}
              onChange={(e) => setCodigoCliente(e.target.value)}
              className="flex-1"
            />
            <Button 
              variant="outline"
              onClick={() => setCodigoCliente('CLI001')}
            >
              Exemplo
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Use códigos como: CLI001, CLIENTE_JOAO, etc.
          </p>
        </CardContent>
      </Card>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompensacaoCard codigoCliente={codigoCliente} />
        <UsinasCard />
      </div>

      <StatusCard />

      {/* Footer de debug */}
      <Card>
        <CardHeader>
          <CardTitle>🛠️ Debug Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>Ambiente:</strong> {process.env.NODE_ENV}</p>
            <p><strong>API URL:</strong> {process.env.NEXT_PUBLIC_COGNI_API_URL || 'Não configurada'}</p>
            <p><strong>Token:</strong> {process.env.NEXT_PUBLIC_COGNI_API_TOKEN ? '✅ Configurado' : '❌ Não configurado'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
