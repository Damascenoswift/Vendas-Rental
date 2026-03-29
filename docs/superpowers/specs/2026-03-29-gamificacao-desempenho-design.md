# Design: Gamificação de Desempenho por Tempo

**Data:** 2026-03-29
**Status:** Aprovado

---

## Visão Geral

Sistema de gamificação baseado em tempo, onde cada funcionário compete consigo mesmo. O objetivo é criar uma sensação de prazer e progressão ao cumprir tarefas e processos dentro do tempo estipulado pelo admin — sem ranking entre pessoas, sem XP numérico.

---

## Decisões de Design

| Decisão | Escolha |
|---|---|
| Estilo de gamificação | Visual misto — barras de progresso, badges de conquista, toast de conclusão |
| Onde vive | Widget no final do "Minha Semana" + página Arena dedicada |
| Competição | Apenas com si mesmo (recorde pessoal por categoria) |
| Métrica | Tempo real vs tempo estipulado por categoria (dias úteis) |
| Quem configura os tempos | Admin, via tabela global por departamento/categoria |
| Feedback visual | Camadas: barra inline na lista → toast ao concluir → histórico na Arena |
| Emojis | Nenhum — apenas ícones SVG (Lucide) |

---

## Parte 1 — Dados

### Nova tabela: `task_time_benchmarks`
Configurada pelo admin. Define o tempo esperado por tipo de tarefa.

```
id                  uuid PK
department          text (vendas | cadastro | energia | juridico | financeiro | ti | diretoria | obras | outro)
label               text  — ex: "Contrato de Aluguel", "Fase de Execução"
expected_business_days  integer
active              boolean default true
created_at          timestamptz
updated_at          timestamptz
```

### Nova tabela: `task_personal_records`
Guarda o melhor tempo de cada funcionário por benchmark.

```
id                  uuid PK
user_id             uuid FK → profiles
benchmark_id        uuid FK → task_time_benchmarks
best_business_days  integer
achieved_at         timestamptz
created_at          timestamptz
```

### Duração real das tarefas
Derivada dos eventos existentes em `task_activity_events` (já registrado pelo `task_analyst_core`): diferença entre o evento `status_changed → IN_PROGRESS` e o evento `status_changed → DONE`, em dias úteis.

### Duração real das obras
Já disponível: `execution_deadline_at` (meta) e `completed_at` (real), ambos em `work_cards`. Nenhuma tabela nova necessária.

---

## Parte 2 — "Minha Semana" expandido

### O que muda na tela atual
- Card de estatísticas no topo ganha um quarto item: **Obras ativas**
- Nova seção **"Obras em andamento"** inserida antes da seção de tarefas
  - Cada obra mostra: nome, fase atual, prazo, barra de progresso de tempo (dias decorridos / meta), badge verde/vermelho de status
- Cada tarefa na lista existente ganha uma **barra de progresso inline** discreta mostrando dias decorridos vs meta do benchmark correspondente ao seu departamento
- **Widget "Seu desempenho esta semana"** adicionado ao final da página
  - Três métricas: tarefas dentro do prazo / fora do prazo / taxa percentual
  - Badges de conquista da semana (ex: "Recorde pessoal em Cadastro", "3 dias seguidos no prazo")
  - Link "Ver histórico completo →" para a página Arena

### Lógica de benchmark por tarefa
Ao carregar o "Minha Semana", para cada tarefa em andamento:
1. Busca o benchmark ativo com `department` igual ao da tarefa
2. Calcula dias úteis decorridos desde `IN_PROGRESS`
3. Exibe barra proporcional: `decorridos / expected_business_days`
4. Cor: verde se abaixo de 80% da meta, âmbar entre 80–100%, vermelho acima de 100%

---

## Parte 3 — Toast de conclusão

Disparado quando status da tarefa muda para `DONE` ou fase de obra é concluída.

**Conteúdo do toast:**
- Nome da tarefa/obra
- Tempo real vs meta: ex: "3 dias úteis / meta 5 dias"
- Se for recorde pessoal: badge adicional "Melhor tempo em [Categoria]"

**Comportamento:**
- Toast discreto no canto inferior direito (padrão sonner/shadcn já usado no app)
- Duração: 6 segundos
- Sem animações exageradas

---

## Parte 4 — Página Arena (`/dashboard/arena`)

### Estrutura
Nova rota na área do dashboard, acessível pelo link no widget do "Minha Semana".

**Seções da página:**
1. **Resumo geral** — total de tarefas no prazo / fora do prazo no mês atual
2. **Por categoria** — para cada benchmark ativo associado ao departamento do usuário:
   - Tempo médio histórico
   - Recorde pessoal (melhor tempo e data)
   - Gráfico de linha simples com os últimos 8 registros (evolução temporal)
3. **Conquistas** — lista de badges ganhos (ex: "Recorde pessoal em Cadastro — 29/03/2026")

**Visibilidade:** Cada funcionário vê apenas seus próprios dados. Nenhum dado de outros usuários é exibido.

---

## Parte 5 — Configuração de Benchmarks (Admin)

Nova seção na área admin, acessível por usuários com papel `adm_mestre` ou `supervisor`.

**Interface:**
- Tabela com colunas: Departamento · Categoria · Dias úteis esperados · Ativo/Inativo · Ações
- Botão "Adicionar benchmark"
- Inline edit ou dialog para criar/editar entradas
- Toggle para ativar/desativar sem excluir

**Rota sugerida:** `/admin/configuracoes/benchmarks` ou seção dentro de configurações existentes.

---

## Impacto em Componentes Existentes

| Componente | Impacto |
|---|---|
| `task-my-week-dashboard.tsx` | Adição de seção de obras + barra inline nas tarefas + widget desempenho |
| `task-personal-weekly-service.ts` | Novos campos no summary: obras ativas, dados de benchmark por tarefa |
| `task-service.ts` | Hook no `updateTaskStatus` para disparar toast e verificar recorde pessoal ao ir para DONE |
| `work-cards-service.ts` | Hook ao fechar obra para verificar desempenho vs meta |
| Admin de configurações | Nova seção de benchmarks |
| Rotas | Nova: `/dashboard/arena` |

---

## Não está no escopo

- Ranking entre funcionários
- XP numérico acumulado
- Notificações push de desempenho
- Comparação entre setores
- Gamificação em outras áreas além de tarefas e obras
