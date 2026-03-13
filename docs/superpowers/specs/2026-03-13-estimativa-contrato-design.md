# Estimativa para Contrato Design

## Objetivo

Adicionar ao fluxo de orcamentos um campo manual de texto livre chamado `Estimativa para contrato`, mantendo ao mesmo tempo a geracao estimada calculada ja existente. O valor manual nao entra em nenhuma base de calculo e precisa seguir do orcamento para a geracao de contrato e para o espelho tecnico da obra.

## Escopo

- Adicionar o campo na interface de criacao e edicao de orcamentos simples e completos.
- Persistir o valor manual junto do `calculation` do orcamento, em um bloco separado da base de calculo.
- Expor o valor manual na geracao de contrato como variavel dedicada de template.
- Replicar o valor manual para o `technical_snapshot` da obra, ao lado da producao calculada.

## Fora de escopo

- Criar coluna dedicada em `proposals`.
- Alterar formulas de dimensionamento, financeiro, comissao ou estoque.
- Alterar automaticamente os arquivos `.docx` de template.

## Arquitetura

### Origem do dado

O valor nasce no orcamento e passa a ser a unica origem da `Estimativa para contrato`.

### Persistencia

O dado sera salvo dentro do JSON `calculation`, em um bloco proprio de contrato, por exemplo:

```json
{
  "contract": {
    "manual_production_estimate": "18.500 kWh/mes"
  }
}
```

Esse bloco fica separado de `input`, `output`, `commission` e `bundle`, evitando qualquer interferencia no calculo.

### Contrato entre camadas

- `name`: `estimativa_para_contrato`
- `input`: texto livre digitado pelo usuario no formulario de orcamento
- `output`: string persistida no `calculation.contract.manual_production_estimate`
- `errors`: campo opcional; string vazia deve ser persistida como ausente
- `auth`: mesmas regras atuais de criacao/edicao/geracao de contrato e sincronizacao de obra

## UX

### Orcamento

- O formulario mostrara dois campos lado a lado na area de resultados tecnicos:
  - `Geracao estimada`
  - `Estimativa para contrato`
- `Geracao estimada` continua somente leitura.
- `Estimativa para contrato` sera editavel e preservada ao salvar/editar.

### Obras

- O modal de detalhes da obra continuara exibindo a `Producao estimada` calculada.
- Ao lado dela, sera exibida a `Estimativa para contrato`, lendo do snapshot tecnico.

### Contrato

- A geracao de contrato passara a popular chaves dedicadas para a estimativa manual, sem remover as chaves calculadas existentes.
- Caso o template nao use a nova chave, nao ha regressao; o dado apenas fica disponivel para uso futuro.

## Fluxo de dados

1. Usuario preenche `Estimativa para contrato` no orcamento.
2. UI injeta o valor no bloco `calculation.contract`.
3. `createProposal` e `updateProposal` persistem o JSON sem altera-lo nas formulas.
4. `generateContractFromIndication` le a estimativa manual do orcamento selecionado e inclui a variavel no `templateData`.
5. `upsertWorkCardFromProposal` constroi o `technical_snapshot` com:
   - producao calculada atual
   - estimativa manual para contrato
6. UI de obras exibe os dois valores lado a lado.

## Tratamento de erros

- Valor vazio nao bloqueia o salvamento do orcamento.
- Se o bloco `contract` nao existir em orcamentos antigos, o sistema assume ausencia do valor manual.
- Se a obra ou contrato forem gerados a partir de orcamentos antigos, apenas o valor calculado continua disponivel.

## Testes

- Testar helper de leitura/escrita do bloco `contract` no `calculation`.
- Testar montagem dos dados de contrato com a estimativa manual.
- Testar montagem do snapshot tecnico da obra com a estimativa manual preservada ao lado do valor calculado.

## Riscos

- Templates `.docx` atuais podem ainda nao referenciar a nova variavel manual.
- Oramentos antigos nao terao o novo bloco, exigindo fallback seguro.

## Decisao

Salvar a `Estimativa para contrato` dentro do `calculation` em um bloco separado de contrato e propagar esse valor para contrato e obras sem tocar na base de calculo.
