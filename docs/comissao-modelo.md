# Modelo de Gestao de Comissao (Dorata + Rental)

## Objetivo
Definir a estrutura funcional e de negocio para gestao de comissoes dentro do aplicativo, cobrindo:
- Vendas Dorata com entradas de 30% e projecao de 70%.
- Indicacoes Rental com previsao de recebimento.
- Regra especial do Gestor Comercial (Guilherme) com override sobre vendas iniciais e vendas novas via funcionarios.
- Visao simplificada para Financeiro (sem detalhamento 30/70).

Nao teremos sistema de importacao, pois todo o processo acontece dentro do aplicativo.

## Escopo
Inclui: definicoes, regras, entidades, dashboards, fluxo de status, historico e permissoes.
Nao inclui: implementacao, layout final, integracoes externas.

## Perfis e Permissoes
- Gestor Comercial (Guilherme): acesso total, visao consolidada, override.
- Vendedores: acesso apenas as proprias comissoes e vendas.
- Financeiro: acesso a pagamentos e pendencias, sem detalhes de 30%/70%.

## Definicoes Essenciais
- Venda inicial: primeira venda do cliente (definir criterio exato).
- Venda nova: venda gerada por funcionario (definir criterio exato).
- Entrada 30%: parte recebida na assinatura (Dorata).
- Projecao 70%: parte futura a receber (Dorata).
- Indicacao em andamento: oportunidade ativa (Rental).
- Valor liquido: base de comissao apos descontos/ajustes (definir quais).
- Override: comissao do gestor sobre vendas de terceiros.

## Estrutura de Informacoes (alto nivel)
- Cliente: id, nome, origem, status.
- Venda: origem (Dorata/Rental), tipo (inicial/nova), valor, vendedor, data, status.
- Parcela/Etapa: 30% ou 70%, data prevista/real, valor.
- Comissao: beneficiario, regra aplicada, valor, status.
- Pagamento: valor, data, status, historico.
- Historico/Auditoria: alteracoes, aprovacoes, ajustes.

## Regras de Comissao (base)
- Vendedor recebe comissao direta nas vendas proprias.
- Gestor recebe override:
  - Todas as vendas iniciais (Dorata e Rental).
  - Todas as vendas novas geradas por funcionarios.
- Uma venda pode gerar mais de uma comissao (vendedor + gestor), desde que regras sejam explicitas.
- Estorno gera ajuste negativo na comissao vinculada.

## Dashboard (Visao Gestor)
### Dorata
- Vendas total: soma por periodo.
- Entradas 30% (lista):
  - cliente
  - valor comissao (com desconto)
  - data assinatura
  - previsao recebimento 70%
- Projecao 70% (lista):
  - cliente
  - valor final ajustado
  - data prevista

### Rental
- Indicacoes em andamento: numero de indicacoes ativas.
- Previsao recebimento: soma projetada com base nas indicacoes.

### Filtros sugeridos
- Periodo, vendedor, origem, status.

## Financeiro (Visao Simplificada)
Apenas financeiro e gestor acessam. Sem detalhar 30%/70%.

### Comissionamento
- Gestor (Guilherme):
  - itens a receber: origem, valor, status, historico.
- Vendedores:
  - lista por vendedor com itens a receber e historico.

### Acoes
- Marcar como pago.
- Registrar pagamento parcial.
- Ajustar/estornar com motivo.

## Fluxo de Status (sugestao)
- Venda: criada -> assinada -> 30% recebido -> 70% projetado -> 70% recebido.
- Comissao: calculada -> aprovada -> em aberto -> paga -> (estornada).
- Indicacao (Rental): em andamento -> elegivel -> comissionada -> paga.

## Historico e Auditoria
Registrar:
- Quem alterou, quando, e motivo.
- Mudancas de status de comissao e pagamento.
- Ajustes/estornos.

## Regras Pendentes para Definir
- Criterio exato de "venda inicial" e "venda nova".
- Percentuais por origem/tipo e para o gestor.
- Valor base (bruto vs liquido) e quais descontos entram.
- Janela de estorno e regras de reversao.
- Comissao recorrente ou apenas entrada.

## Proximos Passos (sem codigo)
1. Confirmar definicoes pendentes.
2. Fixar percentuais e vigencias.
3. Validar fluxos com exemplos reais.
4. Aprovar estrutura antes de implementacao.
