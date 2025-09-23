# 🔋 PROMPT COGNI PARA CURSOR

## CONTEXTO RÁPIDO

O **COGNI** é uma API de monitoramento de energia solar que fornece dados financeiros e técnicos em tempo real para o sistema Rental Energias.

## O QUE FAZ

```typescript
// COGNI = "Google Analytics para Energia Solar"
const cogni = {
  funcao: "Monitorar sistemas de energia solar instalados",
  dados: {
    financeiros: "Economia em R$ (diária, mensal, acumulada)",
    tecnicos: "kWh gerados, consumidos, injetados na rede",
    status: "Online/offline, ativo/inativo, alertas"
  },
  usuarios: ["Vendedores", "Administradores", "Investidores", "Clientes"]
}
```

## CASOS DE USO PRINCIPAIS

### 1. **Dashboard do Vendedor**
```typescript
// Vendedor quer ver quanto seus clientes economizaram
const economia = await cogni.buscarCompensacao("CLI001");
// Resultado: "Cliente economizou R$ 1.250 este mês"
// Comissão: R$ 1.250 * 5% = R$ 62,50
```

### 2. **Dashboard Administrativo**
```typescript
// Admin quer ver métricas gerais
const usinas = await cogni.listarUsinas();
// Resultado: "150 usinas ativas, 2.5MW instalados, R$ 50.000 economia total"
```

### 3. **ROI do Investidor**
```typescript
// Investidor quer ver retorno do investimento
const roi = economia.total / investimento.inicial * 100;
// Resultado: "ROI: 15% - Payback em 4.2 anos"
```

## DADOS PRINCIPAIS

```typescript
interface CogniData {
  // Identificação
  clienteId: string;           // "CLI001" - código único do cliente
  
  // Economia (o que mais importa)
  compensacaoHoje: number;     // R$ 45,30 - economia hoje
  compensacaoMes: number;      // R$ 1.250,00 - economia no mês  
  economiaAcumulada: number;   // R$ 15.000,00 - economia total desde instalação
  
  // Status
  sistemaAtivo: boolean;       // true = gerando energia
  statusConexao: string;       // "online" | "offline" | "error"
}
```

## FLUXO DE NEGÓCIO

```
1. Cliente compra energia solar da Rental
2. Sistema é instalado e conectado ao COGNI
3. COGNI monitora geração e calcula economia
4. Vendedor recebe comissão baseada na economia
5. Investidor acompanha ROI
6. Admin monitora todas as operações
```

## ENDPOINTS ESSENCIAIS

```typescript
// Buscar dados de um cliente específico
GET /compensacao/cliente/{codigoCliente}
// → Retorna economia diária, mensal, acumulada

// Listar todas as usinas
GET /plantas
// → Retorna status, capacidade, localização

// Buscar alertas
GET /alertas
// → Sistema offline, fatura atrasada, etc.
```

## IMPLEMENTAÇÃO TÍPICA

```typescript
// 1. Service para API
class CogniService {
  static async buscarEconomia(clienteId: string) {
    return fetch(`/api/cogni/compensacao/${clienteId}`);
  }
}

// 2. Hook para React
function useCogniData(clienteId: string) {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    CogniService.buscarEconomia(clienteId)
      .then(setData);
  }, [clienteId]);
  
  return data;
}

// 3. Componente
function EconomiaCard({ clienteId }) {
  const economia = useCogniData(clienteId);
  
  return (
    <Card>
      <h3>Economia do Cliente</h3>
      <p>Hoje: R$ {economia?.compensacaoHoje}</p>
      <p>Mês: R$ {economia?.compensacaoMes}</p>
      <p>Total: R$ {economia?.economiaAcumulada}</p>
    </Card>
  );
}
```

## PONTOS IMPORTANTES

1. **Cache obrigatório** - API tem rate limit, cache por 5 minutos
2. **Retry automático** - API pode ficar instável, implementar retry
3. **Fallback** - Se API falhar, mostrar último valor conhecido
4. **Real-time** - Atualizar dados a cada 2-5 minutos
5. **Alertas** - Notificar quando sistema fica offline

## RESUMO PARA CURSOR

**COGNI = Sistema que monitora energia solar e calcula economia em R$**

- **Input**: Código do cliente (ex: "CLI001")  
- **Output**: Economia gerada em reais + status técnico
- **Uso**: Dashboards, comissões, ROI, alertas
- **Importante**: Cache, retry, real-time updates

**Sempre que ver referências ao COGNI, pense em "dados de economia de energia solar em tempo real"** ⚡💰
