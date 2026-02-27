BEGIN;

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS domain TEXT,
    ADD COLUMN IF NOT EXISTS event_key TEXT,
    ADD COLUMN IF NOT EXISTS sector TEXT,
    ADD COLUMN IF NOT EXISTS responsibility_kind TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
    ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT false;

UPDATE public.notifications
SET domain = CASE
    WHEN type = 'INTERNAL_CHAT_MESSAGE' THEN 'CHAT'
    ELSE 'TASK'
END
WHERE domain IS NULL;

UPDATE public.notifications
SET event_key = CASE
    WHEN type = 'TASK_COMMENT' THEN 'TASK_COMMENT_CREATED'
    WHEN type = 'TASK_MENTION' THEN 'TASK_COMMENT_MENTION'
    WHEN type = 'TASK_REPLY' THEN 'TASK_COMMENT_REPLY'
    WHEN type = 'TASK_SYSTEM' THEN 'TASK_CHECKLIST_UPDATED'
    WHEN type = 'INTERNAL_CHAT_MESSAGE' THEN 'INTERNAL_CHAT_MESSAGE'
    ELSE 'SYSTEM_GENERIC'
END
WHERE event_key IS NULL;

UPDATE public.notifications n
SET sector = lower(t.department)
FROM public.tasks t
WHERE n.task_id = t.id
  AND n.sector IS NULL
  AND t.department IS NOT NULL;

UPDATE public.notifications
SET responsibility_kind = CASE
    WHEN type = 'TASK_MENTION' THEN 'MENTION'
    WHEN type = 'TASK_REPLY' THEN 'REPLY_TARGET'
    WHEN type = 'TASK_COMMENT' THEN 'OBSERVER'
    WHEN type = 'INTERNAL_CHAT_MESSAGE' THEN 'DIRECT'
    ELSE 'SYSTEM'
END
WHERE responsibility_kind IS NULL;

UPDATE public.notifications
SET entity_type = CASE
    WHEN task_comment_id IS NOT NULL THEN 'TASK_COMMENT'
    WHEN task_id IS NOT NULL THEN 'TASK'
    WHEN type = 'INTERNAL_CHAT_MESSAGE' THEN 'CHAT_CONVERSATION'
    ELSE 'SYSTEM'
END
WHERE entity_type IS NULL;

UPDATE public.notifications
SET entity_id = CASE
    WHEN task_comment_id IS NOT NULL THEN task_comment_id::text
    WHEN task_id IS NOT NULL THEN task_id::text
    WHEN type = 'INTERNAL_CHAT_MESSAGE' THEN metadata->>'conversation_id'
    ELSE id::text
END
WHERE entity_id IS NULL;

UPDATE public.notifications
SET responsibility_kind = 'SYSTEM'
WHERE responsibility_kind IS NULL;

UPDATE public.notifications
SET entity_type = 'SYSTEM'
WHERE entity_type IS NULL;

UPDATE public.notifications
SET entity_id = id::text
WHERE entity_id IS NULL OR btrim(entity_id) = '';

ALTER TABLE public.notifications
    ALTER COLUMN domain SET DEFAULT 'TASK';

ALTER TABLE public.notifications
    ALTER COLUMN domain SET NOT NULL;

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_domain_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_domain_check
    CHECK (domain IN ('TASK', 'INDICACAO', 'OBRA', 'CHAT', 'SYSTEM'));

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_responsibility_kind_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_responsibility_kind_check
    CHECK (
        responsibility_kind IN (
            'ASSIGNEE',
            'OBSERVER',
            'CREATOR',
            'MENTION',
            'REPLY_TARGET',
            'OWNER',
            'SECTOR_MEMBER',
            'LINKED_TASK_PARTICIPANT',
            'DIRECT',
            'SYSTEM'
        )
    );

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_entity_type_check
    CHECK (
        entity_type IN (
            'TASK',
            'TASK_COMMENT',
            'INDICACAO',
            'INDICACAO_INTERACTION',
            'ENERGISA_LOG',
            'OBRA',
            'OBRA_PROCESS_ITEM',
            'OBRA_COMMENT',
            'CHAT_CONVERSATION',
            'SYSTEM'
        )
    );

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_domain_created
    ON public.notifications (recipient_user_id, domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_event_key
    ON public.notifications (event_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON public.notifications (entity_type, entity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_recipient_dedupe
    ON public.notifications (recipient_user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_event_catalog (
    event_key TEXT PRIMARY KEY,
    domain TEXT NOT NULL CHECK (domain IN ('TASK', 'INDICACAO', 'OBRA', 'CHAT', 'SYSTEM')),
    label TEXT NOT NULL,
    sector TEXT,
    default_enabled BOOLEAN NOT NULL DEFAULT true,
    allow_user_disable BOOLEAN NOT NULL DEFAULT true,
    is_mandatory BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_default_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector TEXT NOT NULL,
    event_key TEXT NOT NULL REFERENCES public.notification_event_catalog(event_key) ON DELETE CASCADE,
    responsibility_kind TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_default_rules_responsibility_kind_check
        CHECK (
            responsibility_kind IN (
                'ASSIGNEE',
                'OBSERVER',
                'CREATOR',
                'MENTION',
                'REPLY_TARGET',
                'OWNER',
                'SECTOR_MEMBER',
                'LINKED_TASK_PARTICIPANT',
                'DIRECT',
                'SYSTEM'
            )
        )
);

CREATE TABLE IF NOT EXISTS public.notification_user_rule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL REFERENCES public.notification_event_catalog(event_key) ON DELETE CASCADE,
    responsibility_kind TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_user_rule_overrides_responsibility_kind_check
        CHECK (
            responsibility_kind IN (
                'ASSIGNEE',
                'OBSERVER',
                'CREATOR',
                'MENTION',
                'REPLY_TARGET',
                'OWNER',
                'SECTOR_MEMBER',
                'LINKED_TASK_PARTICIPANT',
                'DIRECT',
                'SYSTEM'
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_default_rules_unique
    ON public.notification_default_rules (sector, event_key, responsibility_kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_user_rule_overrides_unique
    ON public.notification_user_rule_overrides (user_id, event_key, responsibility_kind);

CREATE INDEX IF NOT EXISTS idx_notification_user_rule_overrides_user
    ON public.notification_user_rule_overrides (user_id);

CREATE INDEX IF NOT EXISTS idx_notification_default_rules_sector
    ON public.notification_default_rules (sector);

DROP TRIGGER IF EXISTS update_notification_event_catalog_modtime ON public.notification_event_catalog;
CREATE TRIGGER update_notification_event_catalog_modtime
    BEFORE UPDATE ON public.notification_event_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_default_rules_modtime ON public.notification_default_rules;
CREATE TRIGGER update_notification_default_rules_modtime
    BEFORE UPDATE ON public.notification_default_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_user_rule_overrides_modtime ON public.notification_user_rule_overrides;
CREATE TRIGGER update_notification_user_rule_overrides_modtime
    BEFORE UPDATE ON public.notification_user_rule_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_notification_admin(
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = p_user_id
          AND u.role = 'adm_mestre'
    );
$$;

REVOKE ALL ON FUNCTION public.is_notification_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_notification_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_notification_admin(UUID) TO service_role;

ALTER TABLE public.notification_event_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_default_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_user_rule_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.notification_event_catalog TO authenticated;
GRANT SELECT ON public.notification_default_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_user_rule_overrides TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_event_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_default_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_user_rule_overrides TO service_role;

DROP POLICY IF EXISTS "Notification event catalog read" ON public.notification_event_catalog;
CREATE POLICY "Notification event catalog read"
ON public.notification_event_catalog
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Notification default rules read" ON public.notification_default_rules;
CREATE POLICY "Notification default rules read"
ON public.notification_default_rules
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Notification default rules admin insert" ON public.notification_default_rules;
CREATE POLICY "Notification default rules admin insert"
ON public.notification_default_rules
FOR INSERT
WITH CHECK (public.is_notification_admin(auth.uid()));

DROP POLICY IF EXISTS "Notification default rules admin update" ON public.notification_default_rules;
CREATE POLICY "Notification default rules admin update"
ON public.notification_default_rules
FOR UPDATE
USING (public.is_notification_admin(auth.uid()))
WITH CHECK (public.is_notification_admin(auth.uid()));

DROP POLICY IF EXISTS "Notification default rules admin delete" ON public.notification_default_rules;
CREATE POLICY "Notification default rules admin delete"
ON public.notification_default_rules
FOR DELETE
USING (public.is_notification_admin(auth.uid()));

DROP POLICY IF EXISTS "Notification overrides own read" ON public.notification_user_rule_overrides;
CREATE POLICY "Notification overrides own read"
ON public.notification_user_rule_overrides
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Notification overrides own insert" ON public.notification_user_rule_overrides;
CREATE POLICY "Notification overrides own insert"
ON public.notification_user_rule_overrides
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Notification overrides own update" ON public.notification_user_rule_overrides;
CREATE POLICY "Notification overrides own update"
ON public.notification_user_rule_overrides
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Notification overrides own delete" ON public.notification_user_rule_overrides;
CREATE POLICY "Notification overrides own delete"
ON public.notification_user_rule_overrides
FOR DELETE
USING (auth.uid() = user_id);

INSERT INTO public.notification_event_catalog (
    event_key,
    domain,
    label,
    sector,
    default_enabled,
    allow_user_disable,
    is_mandatory
)
VALUES
    ('TASK_COMMENT_CREATED', 'TASK', 'Comentário em tarefa', 'tasks.department', true, true, false),
    ('TASK_COMMENT_MENTION', 'TASK', 'Menção em comentário de tarefa', 'tasks.department', true, true, false),
    ('TASK_COMMENT_REPLY', 'TASK', 'Resposta em comentário de tarefa', 'tasks.department', true, true, false),
    ('TASK_CHECKLIST_UPDATED', 'TASK', 'Checklist de tarefa atualizado', 'tasks.department', true, true, false),
    ('TASK_STATUS_CHANGED', 'TASK', 'Status de tarefa alterado', 'tasks.department', true, true, false),
    ('INDICATION_CREATED', 'INDICACAO', 'Indicação criada', 'vendas', true, true, false),
    ('INDICATION_STATUS_CHANGED', 'INDICACAO', 'Status da indicação alterado', 'vendas', true, true, false),
    ('INDICATION_DOC_VALIDATION_CHANGED', 'INDICACAO', 'Validação de documentos alterada', 'cadastro', true, true, false),
    ('INDICATION_INTERACTION_COMMENT', 'INDICACAO', 'Comentário em movimentação de indicação', 'vendas', true, true, false),
    ('INDICATION_ENERGISA_LOG_ADDED', 'INDICACAO', 'Log Energisa adicionado', 'energia', true, true, false),
    ('INDICATION_CONTRACT_MILESTONE', 'INDICACAO', 'Marco de contrato/comissão da indicação', 'financeiro', true, true, false),
    ('WORK_COMMENT_CREATED', 'OBRA', 'Comentário em obra', 'obras', true, true, false),
    ('WORK_PROCESS_STATUS_CHANGED', 'OBRA', 'Status de etapa da obra alterado', 'obras', true, true, false),
    ('INTERNAL_CHAT_MESSAGE', 'CHAT', 'Mensagem interna', 'legacy', true, true, false)
ON CONFLICT (event_key) DO UPDATE
SET
    domain = EXCLUDED.domain,
    label = EXCLUDED.label,
    sector = EXCLUDED.sector,
    default_enabled = EXCLUDED.default_enabled,
    allow_user_disable = EXCLUDED.allow_user_disable,
    is_mandatory = EXCLUDED.is_mandatory,
    updated_at = now();

INSERT INTO public.notification_default_rules (sector, event_key, responsibility_kind, enabled)
SELECT seeded_rules.sector, seeded_rules.event_key, seeded_rules.responsibility_kind, true
FROM (
    SELECT task_sector::text AS sector, 'TASK_COMMENT_CREATED'::text AS event_key, 'ASSIGNEE'::text AS responsibility_kind
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_COMMENT_CREATED', 'OBSERVER'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_COMMENT_CREATED', 'CREATOR'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_COMMENT_MENTION', 'MENTION'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_COMMENT_REPLY', 'REPLY_TARGET'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_CHECKLIST_UPDATED', 'ASSIGNEE'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_CHECKLIST_UPDATED', 'OBSERVER'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_CHECKLIST_UPDATED', 'CREATOR'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_CHECKLIST_UPDATED', 'SECTOR_MEMBER'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_STATUS_CHANGED', 'ASSIGNEE'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_STATUS_CHANGED', 'OBSERVER'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_STATUS_CHANGED', 'CREATOR'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT task_sector::text, 'TASK_STATUS_CHANGED', 'SECTOR_MEMBER'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
    UNION ALL
    SELECT 'vendas', 'INDICATION_CREATED', 'OWNER'
    UNION ALL
    SELECT 'vendas', 'INDICATION_CREATED', 'CREATOR'
    UNION ALL
    SELECT 'vendas', 'INDICATION_CREATED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'vendas', 'INDICATION_STATUS_CHANGED', 'OWNER'
    UNION ALL
    SELECT 'vendas', 'INDICATION_STATUS_CHANGED', 'CREATOR'
    UNION ALL
    SELECT 'vendas', 'INDICATION_STATUS_CHANGED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'vendas', 'INDICATION_INTERACTION_COMMENT', 'OWNER'
    UNION ALL
    SELECT 'vendas', 'INDICATION_INTERACTION_COMMENT', 'CREATOR'
    UNION ALL
    SELECT 'vendas', 'INDICATION_INTERACTION_COMMENT', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'cadastro', 'INDICATION_DOC_VALIDATION_CHANGED', 'OWNER'
    UNION ALL
    SELECT 'cadastro', 'INDICATION_DOC_VALIDATION_CHANGED', 'CREATOR'
    UNION ALL
    SELECT 'cadastro', 'INDICATION_DOC_VALIDATION_CHANGED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'energia', 'INDICATION_ENERGISA_LOG_ADDED', 'OWNER'
    UNION ALL
    SELECT 'energia', 'INDICATION_ENERGISA_LOG_ADDED', 'CREATOR'
    UNION ALL
    SELECT 'energia', 'INDICATION_ENERGISA_LOG_ADDED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'financeiro', 'INDICATION_CONTRACT_MILESTONE', 'OWNER'
    UNION ALL
    SELECT 'financeiro', 'INDICATION_CONTRACT_MILESTONE', 'CREATOR'
    UNION ALL
    SELECT 'financeiro', 'INDICATION_CONTRACT_MILESTONE', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'obras', 'WORK_COMMENT_CREATED', 'CREATOR'
    UNION ALL
    SELECT 'obras', 'WORK_COMMENT_CREATED', 'LINKED_TASK_PARTICIPANT'
    UNION ALL
    SELECT 'obras', 'WORK_COMMENT_CREATED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT 'obras', 'WORK_PROCESS_STATUS_CHANGED', 'CREATOR'
    UNION ALL
    SELECT 'obras', 'WORK_PROCESS_STATUS_CHANGED', 'LINKED_TASK_PARTICIPANT'
    UNION ALL
    SELECT 'obras', 'WORK_PROCESS_STATUS_CHANGED', 'SECTOR_MEMBER'
    UNION ALL
    SELECT task_sector::text, 'INTERNAL_CHAT_MESSAGE', 'DIRECT'
    FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS task_sector
) AS seeded_rules
ON CONFLICT (sector, event_key, responsibility_kind) DO UPDATE
SET
    enabled = EXCLUDED.enabled,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.prune_notifications_older_than(p_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days integer := COALESCE(p_days, 180);
    v_deleted integer := 0;
BEGIN
    IF v_days < 1 THEN
        v_days := 180;
    END IF;

    DELETE FROM public.notifications
    WHERE created_at < now() - make_interval(days => v_days);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_notifications_older_than(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_notifications_older_than(integer) TO service_role;

DO $$
DECLARE
    v_job_id bigint;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_available_extensions
        WHERE name = 'pg_cron'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

        SELECT jobid
        INTO v_job_id
        FROM cron.job
        WHERE jobname = 'prune-notifications-older-than-180d'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'prune-notifications-older-than-180d',
            '15 3 * * *',
            'SELECT public.prune_notifications_older_than(180);'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping pg_cron scheduling for notifications retention: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
