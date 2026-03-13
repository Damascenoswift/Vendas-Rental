# COGNI Sync Setup

## 1) Variáveis de ambiente (server only)

Configure no ambiente de execução backend:

- `COGNI_API_URL`
- `COGNI_API_KEY`
- `COGNI_API_SECRET`
- `COGNI_CRON_TOKEN`

## 2) Ativar agendamento automático (pg_cron)

A migration cria o job de 6h, mas o disparo fica desativado até preencher `public.cogni_scheduler_config`.

Use SQL no Supabase após deploy:

```sql
update public.cogni_scheduler_config
set
  enabled = true,
  target_url = 'https://SEU_DOMINIO/api/internal/cogni/sync',
  cron_token = 'MESMO_VALOR_DE_COGNI_CRON_TOKEN',
  timeout_ms = 30000
where id = 1;
```

## 3) Teste manual

No admin de energia (`/admin/energia/faturas`), clique em **Sincronizar COGNI**.

## 4) Desativar temporariamente

```sql
update public.cogni_scheduler_config
set enabled = false
where id = 1;
```
