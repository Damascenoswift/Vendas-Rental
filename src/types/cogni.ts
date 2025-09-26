// 🔋 TIPOS COGNI - Definições TypeScript para dados de energia solar
// SEGURO: Apenas interfaces, não afeta código existente

/**
 * Dados principais de compensação energética de um cliente
 * Baseado na API COGNI real do projeto Flutter
 */
export interface CogniCompensacao {
  /** Código único do cliente (ex: "CLI001") */
  clienteId: string;
  
  /** ID da usina/planta geradora */
  plantId: string;
  
  /** Economia gerada hoje em R$ */
  compensacaoHoje: number;
  
  /** Economia gerada no mês atual em R$ */
  compensacaoMes: number;
  
  /** Economia total acumulada em R$ */
  economiaAcumulada: number;
  
  /** Sistema está ativo e gerando energia */
  sistemaAtivo: boolean;
  
  /** Status da conexão: "online" | "offline" | "error" */
  statusConexao: string;
  
  /** Timestamp da última atualização */
  timestamp: Date;
  
  /** Dados técnicos opcionais */
  ultimoResumo?: CogniResumoEnergia;
}

/**
 * Resumo técnico de energia (kWh)
 */
export interface CogniResumoEnergia {
  /** ID do ponto de medição */
  pointId: string;
  
  /** Período de início */
  periodStart: Date;
  
  /** Período de fim */
  periodEnd: Date;
  
  /** Total de energia gerada (kWh) */
  totalGeneration: number;
  
  /** Total de energia consumida (kWh) */
  totalConsumption: number;
  
  /** Total de energia injetada na rede (kWh) */
  totalInjection: number;
  
  /** Valor da compensação em R$ */
  compensationValue: number;
  
  /** Número de medições no período */
  measurementCount: number;
}

/**
 * Informações de uma usina geradora
 */
export interface CogniUsina {
  /** ID único da usina */
  id: string;
  
  /** Nome da usina */
  name: string;
  
  /** Descrição opcional */
  description?: string;
  
  /** Status: "active" | "inactive" | "maintenance" */
  status: string;
  
  /** Capacidade instalada em kW */
  capacity?: number;
  
  /** Localização */
  location: string;
  
  /** Data de criação */
  createdAt: Date;
  
  /** Última atualização */
  lastUpdateAt?: Date;
  
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

/**
 * Alerta do sistema COGNI
 */
export interface CogniAlert {
  /** Tipo do alerta */
  tipo: 'ponto_inativo' | 'usina_problema' | 'fatura_atrasada' | 'baixa_performance';
  
  /** Severidade */
  severidade: 'info' | 'warning' | 'error';
  
  /** Título do alerta */
  titulo: string;
  
  /** Mensagem detalhada */
  mensagem: string;
  
  /** Cliente afetado (opcional) */
  clienteAfetado?: string;
  
  /** Timestamp do alerta */
  timestamp: Date;
  
  /** Dados adicionais */
  dados?: Record<string, unknown>;
}

/**
 * Métricas gerais do COGNI
 */
export interface CogniMetricas {
  /** Total de usinas ativas */
  usinasAtivas: number;
  
  /** Total de usinas */
  usinasTotal: number;
  
  /** Capacidade total instalada (kW) */
  capacidadeTotal: number;
  
  /** Economia total de todos os clientes (R$) */
  economiaTotal: number;
  
  /** Número de clientes ativos */
  clientesAtivos: number;
  
  /** Última atualização */
  ultimaAtualizacao: Date;
}

/**
 * Response padrão da API COGNI
 */
export interface CogniApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

/**
 * Configuração do cache COGNI
 */
export interface CogniCacheConfig {
  /** TTL em milissegundos (padrão: 5 minutos) */
  ttl: number;
  
  /** Máximo de entradas no cache */
  maxEntries: number;
  
  /** Auto-refresh em background */
  autoRefresh: boolean;
}
