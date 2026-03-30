# Analista de Vendas Dorata — Design Spec

**Data:** 2026-03-30
**Status:** Aprovado
**Escopo:** Orçamentos Dorata — módulo de análise de vendas com AI

---

## Visão Geral

Agente de AI dedicado à análise de vendas da Dorata. Integrado na página de orçamentos com três abas (Lista, Analista, Panorama) e chat lateral em cada orçamento individual. O analista questiona o vendedor como um supervisor exigente, registra o contexto da negociação, sugere mudanças de status e gera métricas de conversão.

---

## Usuários

- **Vendedor (adm_dorata / funcionario_n1/n2):** usa o chat para reportar o andamento de cada orçamento, atualiza status manualmente ou confirma sugestão do analista.
- **Chefe (adm_mestre / adm_dorata supervisor):** acessa o panorama geral, pode abrir qualquer orçamento e conversar com o analista para entender o status de cada negociação.

---

## Status de Negociação

Enum `negotiation_status`:

| Valor | Descrição |
|-------|-----------|
| `sem_contato` | Orçamento enviado, cliente ainda não respondeu |
| `em_negociacao` | Cliente engajado, conversando sobre condições |
| `followup` | Cliente pediu para ser contactado numa data futura |
| `parado` | Sem resposta há muito tempo, sem progresso |
| `perdido` | Cliente fechou com concorrente |
| `convertido` | Virou venda / indicação aprovada |

---

## Banco de Dados

### `proposal_negotiations`
Uma linha por orçamento. Guarda o estado atual da negociação.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `proposal_id` | uuid | FK → proposals.id |
| `negotiation_status` | enum | Status atual da negociação |
| `followup_date` | date | Data agendada para retorno (nullable) |
| `client_signal` | text | O que o cliente sinalizou (texto livre) |
| `objections` | text | Objeções registradas pelo vendedor |
| `updated_at` | timestamptz | Última atualização |
| `updated_by` | uuid | FK → users.id |
| `created_at` | timestamptz | Criação |

### `proposal_analyst_conversations`
Histórico de mensagens por orçamento (vendedor ↔ analista).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `proposal_id` | uuid | FK → proposals.id |
| `user_id` | uuid | FK → users.id (nullable para mensagens do analista) |
| `role` | enum `analyst \| user` | Quem enviou |
| `content` | text | Texto da mensagem |
| `status_suggestion` | negotiation_status | Status sugerido pelo analista (nullable) |
| `created_at` | timestamptz | Timestamp da mensagem |

---

## Arquitetura de Serviço

### `/src/services/sales-analyst-service.ts`
Serviço principal. Segue o padrão do `task-analyst-service.ts`.

**Responsabilidades:**
- Carrega contexto do orçamento: valor, margem, potência, dias sem update, status atual
- Carrega `proposal_negotiations` para contexto de negociação (sinais do cliente, objeções)
- Carrega histórico de conversa (`proposal_analyst_conversations`)
- Monta prompt do AI com persona de analista exigente
- Foca em 3 eixos de questionamento:
  1. **Sinal do cliente:** busca preço ou qualidade? qual sinalização já deu?
  2. **Próximo passo:** faz quanto tempo sem contato? qual é o plano?
  3. **Objeções ao fechamento:** o que está travando? o que ainda não foi apresentado?
- Detecta sugestão de mudança de status na resposta e retorna no payload

### `/src/app/api/ai/sales-analyst/route.ts`
Endpoint POST. Acesso restrito a `adm_dorata` e `adm_mestre`.

**Request:**
```ts
{ proposal_id: string; message: string }
```

**Response:**
```ts
{ reply: string; status_suggestion?: NegotiationStatus }
```

### `/src/app/actions/sales-analyst.ts`
Server Actions:

| Função | Descrição |
|--------|-----------|
| `getSalesAnalystConversation(proposalId)` | Carrega histórico de conversa |
| `sendSalesAnalystMessage(proposalId, message)` | Envia mensagem, salva resposta do AI |
| `updateNegotiationStatus(proposalId, status)` | Atualiza status manualmente |
| `confirmStatusSuggestion(proposalId, status)` | Confirma sugestão do analista |
| `getSalesAnalystPanorama()` | Agrega KPIs e lista para o panorama |

---

## Telas

### Página de Orçamentos — 3 abas

**Aba Lista** (padrão, existente com melhorias):
- Cada item exibe: nome do cliente, badge de `negotiation_status`, dias sem update, valor total, barra de margem com percentual colorido (verde ≥ 18%, amarelo 10–17%, vermelho < 10%)

**Aba Analista:**
- Alerta no topo para orçamentos críticos (parados há mais de X dias)
- Lista priorizada por urgência (mais dias sem update primeiro)
- Cada item mostra: nome, status badge, dias, valor, margem, e preview da próxima pergunta do analista
- Clique abre o orçamento com o chat lateral

**Aba Panorama:**
- KPIs: Total em aberto (R$), Total em fechamento (R$), Total concluído (R$), Qtd parados
- Lista de orçamentos em aberto com margem visual
- Gráfico de barras: tempo médio até conversão por mês

### Orçamento Individual — chat lateral

- Layout split: dados do orçamento à esquerda, chat do analista à direita
- Seletor de status manual (pills clicáveis) acima do chat
- Mensagens do analista em verde, do usuário em branco
- Quando analista detecta mudança de status: exibe card de sugestão com botão "Confirmar"
- Campo de input fixo no rodapé do chat

---

## Fora do Escopo (v1)

- Integração com WhatsApp (planejada para versão futura)
- Notificações automáticas de followup (pode ser adicionado via cron depois)
- Acesso de roles além de `adm_dorata` e `adm_mestre`

---

## Migrações Necessárias

1. Migration para enum `negotiation_status`
2. Migration para tabela `proposal_negotiations`
3. Migration para tabela `proposal_analyst_conversations`
4. RLS policies: vendedor vê/edita seus próprios orçamentos; adm_mestre vê todos
5. Service role grants para ambas as tabelas
