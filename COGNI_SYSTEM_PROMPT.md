# 🔋 SISTEMA COGNI - Guia Completo para Desenvolvimento

## 📋 O QUE É O COGNI?

O **COGNI** é um sistema de **monitoramento e compensação energética** para energia solar fotovoltaica. É uma API externa que fornece dados em tempo real sobre:

- **Geração de energia solar** (kWh produzidos)
- **Consumo energético** dos clientes
- **Compensação energética** (créditos de energia injetados na rede)
- **Valores de economia** em reais (R$)
- **Status das usinas** geradoras
- **Faturas e pagamentos** relacionados à energia

## 🎯 PROPÓSITO NO SISTEMA RENTAL

### **Contexto do Negócio:**
A Rental Energias é uma empresa que:
1. **Vende sistemas de energia solar** para clientes
2. **Monitora a performance** dos sistemas instalados
3. **Calcula comissões** dos vendedores baseado na economia gerada
4. **Acompanha o ROI** dos investidores
5. **Oferece dashboards** administrativos com métricas reais

### **Fluxo de Negócio:**
```
Cliente compra energia solar → Sistema instalado → COGNI monitora → 
Economia gerada → Comissão calculada → Vendedor recebe → ROI para investidores
```

## 🔧 COMO FUNCIONA A INTEGRAÇÃO?

### **1. Identificação do Cliente**
- Cada cliente tem um **código único** (ex: "CLI001", "CLIENTE_JOAO_SILVA")
- Este código é usado para buscar dados específicos no COGNI
- O código liga o cliente do sistema Rental com os dados de energia do COGNI

### **2. Tipos de Dados Obtidos**
```typescript
interface CogniData {
  // Identificação
  clienteId: string;           // "CLI001" - código do cliente
  plantId: string;             // ID da usina geradora
  
  // Dados Financeiros
  compensacaoHoje: number;     // R$ 45.30 - economia hoje
  compensacaoMes: number;      // R$ 1.250,00 - economia no mês
  economiaAcumulada: number;   // R$ 15.000,00 - economia total
  
  // Status Técnico
  sistemaAtivo: boolean;       // true/false - sistema funcionando
  statusConexao: string;       // "online", "offline", "error"
  timestamp: Date;             // última atualização
  
  // Dados Técnicos
  totalGeneration: number;     // kWh gerados
  totalConsumption: number;    // kWh consumidos
  totalInjection: number;      // kWh injetados na rede
}
```

### **3. Endpoints Principais**
```typescript
// Buscar compensação por código do cliente
GET /compensacao/cliente/{codigoCliente}
// Retorna: economia diária, mensal, acumulada

// Listar usinas/plantas
GET /plants
// Retorna: todas as usinas com status e capacidade

// Buscar dados de energia
GET /energy/summary/{pointId}?start={date}&end={date}
// Retorna: geração, consumo, compensação por período

// Status em tempo real
GET /realtime/{clienteId}
// Retorna: dados atuais de geração e consumo
```

## 💰 CASOS DE USO NO SISTEMA

### **1. Dashboard do Vendedor**
```typescript
// Mostrar economia gerada pelos clientes do vendedor
const clientesDoVendedor = ["CLI001", "CLI002", "CLI003"];
const economiaTotal = 0;

for (const codigo of clientesDoVendedor) {
  const compensacao = await cogni.buscarCompensacao(codigo);
  economiaTotal += compensacao.economiaAcumulada;
}

// Exibir: "Seus clientes economizaram R$ 45.000 este mês!"
```

### **2. Cálculo de Comissões**
```typescript
// Vendedor recebe % da economia gerada
const compensacao = await cogni.buscarCompensacao("CLI001");
const comissao = compensacao.compensacaoMes * 0.05; // 5% da economia

// Se cliente economizou R$ 1.000, vendedor ganha R$ 50
```

### **3. Dashboard Administrativo**
```typescript
// Métricas gerais da empresa
const todasUsinas = await cogni.listarUsinas();
const capacidadeTotal = todasUsinas.reduce((sum, usina) => sum + usina.capacity, 0);
const usinasAtivas = todasUsinas.filter(u => u.status === 'active').length;

// Exibir: "150 usinas ativas, 2.5MW de capacidade instalada"
```

### **4. Acompanhamento do Investidor**
```typescript
// Investidor quer ver ROI da usina que financiou
const codigoCliente = "CLI001";
const compensacao = await cogni.buscarCompensacao(codigoCliente);
const investimentoInicial = 50000; // R$ 50.000 investidos
const roi = (compensacao.economiaAcumulada / investimentoInicial) * 100;

// Exibir: "ROI atual: 15% - Economia gerada: R$ 7.500"
```

## 🔄 FLUXO DE DADOS EM TEMPO REAL

### **Sistema de Cache Inteligente:**
```typescript
// 1. Busca no cache local primeiro (performance)
let dados = cache.buscar(codigoCliente);

// 2. Se cache expirado, busca na API COGNI
if (!dados || cache.expirado(dados)) {
  dados = await cogni.buscarCompensacao(codigoCliente);
  cache.salvar(codigoCliente, dados, ttl: '5 minutos');
}

// 3. Atualização automática em background
setInterval(() => {
  atualizarDadosEmBackground();
}, 2 * 60 * 1000); // A cada 2 minutos
```

## 🚨 SISTEMA DE ALERTAS

O COGNI também fornece alertas automáticos:

```typescript
interface CogniAlert {
  tipo: 'ponto_inativo' | 'usina_problema' | 'fatura_atrasada';
  severidade: 'warning' | 'error';
  titulo: string;
  mensagem: string;
  clienteAfetado: string;
  timestamp: Date;
}

// Exemplos de alertas:
// ⚠️  "Usina CLI001 está offline há 2 horas"
// 🔴 "Fatura de CLI002 venceu há 5 dias"
// ⚠️  "Produção de CLI003 abaixo do esperado"
```

## 📊 MÉTRICAS IMPORTANTES

### **Para Vendedores:**
- Quantidade de clientes ativos
- Economia total gerada pelos clientes
- Comissões acumuladas no mês
- Performance média dos sistemas vendidos

### **Para Administradores:**
- Capacidade total instalada (MW)
- Número de usinas ativas/inativas
- Economia total de todos os clientes
- Receita total gerada pela empresa

### **Para Investidores:**
- ROI individual por usina financiada
- Tempo de payback estimado
- Economia mensal vs projetada
- Status de funcionamento dos sistemas

## 💡 IMPLEMENTAÇÃO RECOMENDADA

### **1. Estrutura de Dados**
```typescript
// types/cogni.ts
export interface CogniCompensacao {
  clienteId: string;
  compensacaoHoje: number;
  compensacaoMes: number;
  economiaAcumulada: number;
  sistemaAtivo: boolean;
  ultimaAtualizacao: Date;
}
```

### **2. Service Layer**
```typescript
// services/cogni.ts
export class CogniService {
  static async buscarCompensacao(codigoCliente: string) {
    const response = await fetch(`/api/cogni/compensacao/${codigoCliente}`);
    return response.json();
  }
  
  static async listarUsinas() {
    const response = await fetch('/api/cogni/plantas');
    return response.json();
  }
}
```

### **3. Cache Strategy**
```typescript
// lib/cache.ts
export class CogniCache {
  private static cache = new Map();
  private static TTL = 5 * 60 * 1000; // 5 minutos
  
  static get(key: string) {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > this.TTL) {
      return null;
    }
    return item.data;
  }
  
  static set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}
```

## 🎯 RESUMO PARA O CURSOR

**O COGNI é essencialmente um "Google Analytics para energia solar":**

- **Monitora** sistemas de energia solar em tempo real
- **Calcula** economia financeira gerada (em R$)
- **Fornece** dados para dashboards e relatórios
- **Permite** cálculo de comissões e ROI
- **Envia** alertas quando algo está errado

**Principais integrações:**
1. **Buscar compensação** por código do cliente
2. **Listar usinas** e seus status
3. **Calcular métricas** financeiras
4. **Exibir dashboards** em tempo real
5. **Gerar alertas** automáticos

**É crucial para o negócio porque:**
- Vendedores dependem dele para ver suas comissões
- Investidores usam para acompanhar ROI
- Administradores monitoram toda a operação
- Clientes veem sua economia em tempo real

---

**Use este contexto sempre que trabalhar com dados do COGNI no sistema!** 🔋⚡
