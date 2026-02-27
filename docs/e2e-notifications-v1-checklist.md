# E2E Manual - Notificacoes V1

## 1. Preparacao

- [ ] Aplicar a migration `097_notifications_v1_engine.sql` sem erro.
- [ ] Confirmar que existe menu `Notificacoes` para usuario comum e usuario `obras`.
- [ ] Preparar usuarios de teste:
  - [ ] `adm_mestre`
  - [ ] 1 usuario `vendas`
  - [ ] 1 usuario `cadastro`
  - [ ] 1 usuario `energia`
  - [ ] 1 usuario `financeiro`
  - [ ] 1 usuario `obras`
- [ ] Preparar dados base:
  - [ ] 1 tarefa com `assignee`, `creator` e `observer`
  - [ ] 1 indicacao vinculada a vendedor
  - [ ] 1 obra com item de processo e, se possivel, tarefa vinculada
- [ ] Abrir duas sessoes (aba anonima + normal) para validar actor e destinatario em tempo real.

## 2. Smoke da Tela de Notificacoes

- [ ] Acessar `/admin/notificacoes`.
- [ ] Validar abas: `Caixa de entrada` e `Preferencias`.
- [ ] Validar filtros por dominio: `TASK`, `INDICACAO`, `OBRA`, `CHAT`.
- [ ] Validar `Marcar tudo` e leitura individual.

## 3. Cenarios de Tarefas

### 3.1 TASK_STATUS_CHANGED
- [ ] Alterar status de uma tarefa (ex.: TODO -> IN_PROGRESS).
- [ ] Validar recebimento para `assignee`.
- [ ] Clique deve abrir `/admin/tarefas?openTask=<id>`.

### 3.2 TASK_CHECKLIST_UPDATED
- [ ] Marcar/desmarcar item de checklist.
- [ ] Validar notificacao para `observer`.
- [ ] Clique abre a tarefa correta.

### 3.3 TASK_COMMENT_MENTION (sem duplicar)
- [ ] Comentar com `@usuario` que tambem e observer.
- [ ] Validar apenas 1 notificacao final para esse usuario.

### 3.4 TASK_COMMENT_REPLY
- [ ] Responder comentario de outro usuario.
- [ ] Validar notificacao para `reply_target`.

## 4. Cenarios de Indicacoes

### 4.1 INDICATION_CREATED
- [ ] Criar nova indicacao.
- [ ] Validar notificacao para vendedor relacionado (`OWNER`/`CREATOR` conforme contexto).
- [ ] Validar notificacao obrigatoria para `adm_mestre`.

### 4.2 INDICATION_STATUS_CHANGED
- [ ] Alterar status da indicacao em `/admin/indicacoes`.
- [ ] Validar notificacao para vendedor relacionado.
- [ ] Validar notificacao para `adm_mestre`.

### 4.3 INDICATION_DOC_VALIDATION_CHANGED
- [ ] Alterar validacao de documentos.
- [ ] Validar dominio `INDICACAO` e setor `cadastro`.
- [ ] Validar recebimento obrigatorio por `adm_mestre`.

### 4.4 INDICATION_ENERGISA_LOG_ADDED
- [ ] Inserir log Energisa.
- [ ] Validar roteamento para setor `energia`.
- [ ] Validar recebimento por `adm_mestre`.

### 4.5 INDICATION_CONTRACT_MILESTONE
- [ ] Executar marco de contrato/comissao (assinar/desassinar/compensacao/flag).
- [ ] Validar roteamento para setor `financeiro`.
- [ ] Validar recebimento por `adm_mestre`.

## 5. Regra Obrigatoria do adm_mestre

- [ ] Em `adm_mestre`, desativar preferencia de um evento de indicacao.
- [ ] Disparar o evento novamente.
- [ ] Validar que `adm_mestre` recebe mesmo assim (`mandatory`).

## 6. Cenarios de Obras

### 6.1 WORK_COMMENT_CREATED
- [ ] Criar comentario em obra.
- [ ] Validar notificacao para criador, participantes de tarefa vinculada e setor `obras`.
- [ ] Clique abre `/admin/obras?openWork=<id>` com modal/card aberto.

### 6.2 WORK_PROCESS_STATUS_CHANGED
- [ ] Alterar status de item de processo da obra.
- [ ] Validar notificacao para os mesmos grupos acima.

### 6.3 Usuario do departamento obras
- [ ] Login com usuario `obras`.
- [ ] Validar acesso a `/admin/notificacoes` e aba `Preferencias`.

## 7. Preferencias e Overrides

- [ ] Em um usuario comum, desativar um evento especifico em `Preferencias`.
- [ ] Disparar evento.
- [ ] Validar que esse usuario nao recebe.
- [ ] Validar que outro usuario do mesmo setor (sem override) ainda recebe.

## 8. Defaults Globais (adm_mestre)

- [ ] Em `adm_mestre`, alterar padrao global (botao de padrao) para um evento.
- [ ] Testar com usuario sem override.
- [ ] Validar efeito do novo default.

## 9. Inbox, Badge e Realtime

- [ ] Validar badge de notificacoes no sidebar/layout incrementando em tempo real.
- [ ] Validar atualizacao em tempo real da lista sem reload completo.
- [ ] Validar som para eventos `TASK`/`INDICACAO`/`OBRA` e chat.

## 10. Idempotencia (dedupe)

Teste manual sugerido (opcional): replay da mesma requisicao no DevTools.

- [ ] Repetir exatamente a mesma acao/evento com mesmo `dedupe_key`.
- [ ] Validar ausencia de duplicata para o mesmo `recipient_user_id`.

SQL de apoio:

```sql
select recipient_user_id, dedupe_key, count(*)
from public.notifications
where dedupe_key is not null
group by recipient_user_id, dedupe_key
having count(*) > 1;
```

Esperado: `0 rows`.

## 11. Retencao 180 dias

- [ ] Criar/ajustar notificacao antiga (>180 dias) para teste.
- [ ] Executar:

```sql
select public.prune_notifications_older_than(180);
```

- [ ] Validar que antigas foram removidas e nao afeta recentes.
- [ ] (Opcional) Validar job `pg_cron` cadastrado:

```sql
select jobid, jobname, schedule
from cron.job
where jobname = 'prune-notifications-older-than-180d';
```

## 12. Regressao Minima

- [ ] Chat interno continua criando notificacao em inbox.
- [ ] Deep-link de tarefa (`openTask`) continua funcionando.
- [ ] Fluxo de indicacoes e obras sem regressao de permissao.

## Resultado Final

- [ ] Todos os itens criticos aprovados.
- [ ] Bugs encontrados documentados com: passo, usuario, evento, resultado esperado, resultado obtido.
