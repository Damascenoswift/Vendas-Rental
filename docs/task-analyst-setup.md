# Task Analyst Setup (MVP)

## 1) Variáveis de ambiente
Defina no ambiente do app (server):

- `TASK_ANALYST_CRON_TOKEN`: token interno usado no header `x-task-analyst-cron-token`.
- `OPENAI_API_KEY` (opcional): habilita sumarização IA no digest gerencial.
- `OPENAI_MODEL` (opcional): default atual `gpt-4o-mini`.

## 2) Aplicar migrations
A migration `119_task_analyst_core.sql` cria:

- tabelas de configuração, eventos, logs e auditoria;
- função `public.trigger_task_analyst_job()`;
- job `pg_cron` horário (`task-analyst-hourly-trigger`).

A mesma migration também garante um usuário de sistema padrão:

- email: `analista.ia@internal.local`
- nome: `Analista IA`

## 3) Configurar scheduler no banco
Atualize a config para apontar para o endpoint interno do seu app:

```sql
UPDATE public.task_analyst_scheduler_config
SET
  enabled = true,
  target_url = 'https://SEU_DOMINIO/api/internal/task-analyst/run',
  cron_token = 'MESMO_VALOR_DE_TASK_ANALYST_CRON_TOKEN',
  timezone = 'America/Cuiaba',
  timeout_ms = 30000,
  updated_at = now()
WHERE id = 1;
```

## 4) Habilitar o analista
```sql
UPDATE public.task_analyst_config
SET
  enabled = true,
  updated_at = now()
WHERE id = 1;
```

## 5) Execução manual (somente `adm_mestre`)
`POST /api/internal/task-analyst/run`

Body:

```json
{
  "trigger": "manual",
  "dryRun": false
}
```

## 6) Janela de execução automática
O cron dispara de hora em hora, mas o pipeline roda apenas em:

- `08:00`
- `14:00`

Timezone: `America/Cuiaba`.

## 7) Aprendizado semanal
A recalibração por setor roda no ciclo de segunda-feira às `08:00` (`trigger=scheduled`) com janela histórica padrão de 90 dias.
