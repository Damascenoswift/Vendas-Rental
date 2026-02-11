# Estrutura de Fechamento de Comissoes (Antes da Implementacao)

## Objetivo
Organizar o fluxo para o setor financeiro:
- Ver o que esta liberado para pagamento (Rental + Dorata).
- Fechar pagamentos em lote (fechamento).
- Manter historico claro de tudo que ja foi pago.
- Permitir entrada manual do relatorio Elyakim (Rental) enquanto nem tudo estiver no app.

Esta proposta reaproveita o modulo atual em `/admin/financeiro` e evita refazer regras que ja existem.

## Estado Atual (o que ja existe)
- Tela de previsoes e pagamentos em `/src/app/admin/financeiro/page.tsx`.
- Lancamento manual em `/src/components/financial/new-transaction-dialog.tsx`.
- Ledger de pagamentos em `public.financeiro_transacoes`.
- Regras de comissao em `public.pricing_rules`.

Lacuna principal hoje:
- Nao existe conceito de "fechamento" (um lote consolidado de pagamento com snapshot e historico proprio).
- Nao existe fluxo dedicado para entrada manual estruturada do relatorio Elyakim.

## Proposta de Produto (UX simples e dinamica)

### 1) Aba "Liberado para pagar"
Lista unica com itens elegiveis para pagamento, unindo:
- Rental (regras de liberacao ja existentes no calculo atual).
- Dorata (contrato assinado/liberado).
- Manual Elyakim (linhas liberadas inseridas pelo financeiro).

Colunas sugeridas:
- Marca (Rental/Dorata)
- Beneficiario (vendedor/gestor)
- Cliente
- Tipo (comissao_venda, comissao_dorata, override_gestao, manual_elyakim)
- Valor liberado
- Valor ja pago
- Valor disponivel para fechar
- Origem do dado (sistema/manual)
- Acao (selecionar para fechamento)

### 2) Acao "Fechar pagamento"
Fluxo:
1. Financeiro marca os itens da lista liberada.
2. Sistema mostra resumo antes de confirmar:
   - total geral
   - total Rental
   - total Dorata
   - total por beneficiario
3. Financeiro confirma o fechamento.
4. Sistema gera:
   - registro de fechamento (cabecalho)
   - itens do fechamento (snapshot)
   - transacoes em `financeiro_transacoes` com status `pago`.

### 3) Aba "Historico de fechamentos"
Tabela de lotes ja fechados:
- Codigo do fechamento
- Competencia
- Data/hora
- Usuario que fechou
- Total pago
- Quantidade de itens
- Status

Detalhe do fechamento (drawer/modal):
- Itens pagos no lote
- Totais por marca e beneficiario
- Observacoes e trilha de auditoria

### 4) Entrada manual "Relatorio Elyakim"
Botao: `Adicionar relatorio manual (Elyakim)`.

Formato v1 (simples):
- Cadastro manual por linha (sem importador complexo):
  - competencia
  - beneficiario
  - cliente
  - tipo da comissao
  - valor
  - observacao
  - referencia externa (opcional)

Formato v2 (opcional):
- Colar CSV/texto para importar varias linhas de uma vez.

Regra:
- Itens manuais entram com status `liberado`.
- Assim que forem pagos em um fechamento, ficam vinculados ao fechamento e nao aparecem mais como disponiveis.

## Regras de Elegibilidade (motor de "liberado")

### Dorata
- Elegivel quando contrato estiver assinado/liberado.
- Disponivel = comissao calculada - soma ja paga para a mesma origem/beneficiario.

### Rental
- Reaproveitar regra atual da pagina:
  - gestor com gatilho 30/70 conforme assinatura/fatura paga.
  - demais vendedores conforme regra atual de liberacao.
- Disponivel = valor elegivel - soma ja paga para a mesma origem/beneficiario/tipo.

### Manual Elyakim
- Elegivel quando item manual estiver `liberado`.
- Disponivel = valor manual - soma paga vinculada ao item.

## Modelo de Dados Proposto

### `public.financeiro_fechamentos`
Cabecalho do lote de pagamento.
- `id uuid pk`
- `codigo text unique` (ex: FECH-2026-02-0001)
- `competencia date`
- `status text check ('aberto','fechado','cancelado') default 'aberto'`
- `total_itens int`
- `total_valor numeric(12,2)`
- `fechado_em timestamptz`
- `fechado_por uuid references public.users(id)`
- `observacao text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `public.financeiro_fechamento_itens`
Snapshot dos itens pagos no fechamento.
- `id uuid pk`
- `fechamento_id uuid references public.financeiro_fechamentos(id)`
- `brand text check ('rental','dorata')`
- `beneficiary_user_id uuid references public.users(id)`
- `transaction_type public.transaction_type`
- `source_kind text check ('rental_sistema','dorata_sistema','manual_elyakim')`
- `source_ref_id text` (id da origem no sistema/manual)
- `origin_lead_id uuid null references public.indicacoes(id)`
- `descricao text`
- `valor_liberado numeric(12,2)`
- `valor_pago numeric(12,2)`
- `pagamento_em date`
- `snapshot jsonb default '{}'::jsonb`
- `created_at timestamptz default now()`

### `public.financeiro_relatorios_manuais`
Cabecalho de relatorio manual.
- `id uuid pk`
- `fonte text default 'elyakim'`
- `competencia date`
- `status text check ('rascunho','liberado','fechado','cancelado') default 'liberado'`
- `created_by uuid references public.users(id)`
- `created_at timestamptz default now()`
- `observacao text`

### `public.financeiro_relatorios_manuais_itens`
Linhas do relatorio manual.
- `id uuid pk`
- `report_id uuid references public.financeiro_relatorios_manuais(id)`
- `beneficiary_user_id uuid references public.users(id)`
- `brand text check ('rental','dorata') default 'rental'`
- `transaction_type public.transaction_type default 'comissao_venda'`
- `client_name text`
- `origin_lead_id uuid null references public.indicacoes(id)`
- `valor numeric(12,2)`
- `status text check ('liberado','pago','cancelado') default 'liberado'`
- `external_ref text null`
- `observacao text null`
- `created_at timestamptz default now()`

## Regras de Permissao
- Fechar pagamento: somente `department = 'financeiro'` ou usuarios com full access.
- Inserir/editar relatorio Elyakim: financeiro + full access.
- Visualizar historico: financeiro + full access; vendedor visualiza apenas o proprio pagamento (opcional fase 2).

## Integracao com o que ja existe
- `financeiro_transacoes` continua sendo o ledger final.
- Fechamento vira camada de consolidacao/auditoria acima do ledger.
- A pagina atual de previsoes pode virar aba "Previsoes", sem perda do que ja funciona.

## Plano de Implementacao (fases curtas)
1. Banco e regras:
   - criar 4 tabelas novas
   - criar politicas RLS
   - criar indices para filtro por competencia, status e beneficiario
2. Backend:
   - action para listar itens liberados (Rental + Dorata + manual)
   - action para criar fechamento e registrar transacoes
   - action para cadastrar item manual Elyakim
3. Frontend:
   - reorganizar `/admin/financeiro` em abas:
     - Previsoes
     - Liberado para pagar
     - Historico de fechamentos
   - modal de confirmacao de fechamento
   - formulario de relatorio manual Elyakim
4. Validacao:
   - cenarios de pagamento parcial
   - evitar pagamento duplicado do mesmo item
   - auditoria de quem fechou e quando

## Criterios de Aceite
- Ao clicar em "Fechar pagamento", o financeiro ve claramente todos os itens liberados (Rental + Dorata + manual).
- O fechamento gera historico consultavel por lote.
- Itens pagos deixam de aparecer como disponiveis.
- Relatorio Elyakim pode ser inserido manualmente e entrar no mesmo fluxo de fechamento.
