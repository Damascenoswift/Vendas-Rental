BEGIN;

CREATE TABLE IF NOT EXISTS public.task_analyst_config (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    bot_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    history_window_days INTEGER NOT NULL DEFAULT 90 CHECK (history_window_days BETWEEN 30 AND 365),
    base_reminder_hours INTEGER NOT NULL DEFAULT 24 CHECK (base_reminder_hours BETWEEN 1 AND 168),
    base_escalation_hours INTEGER NOT NULL DEFAULT 72 CHECK (base_escalation_hours BETWEEN 1 AND 240),
    slow_sector_hours INTEGER NOT NULL DEFAULT 48 CHECK (slow_sector_hours BETWEEN 1 AND 240),
    learning_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.task_analyst_config (
    id,
    enabled,
    bot_user_id,
    history_window_days,
    base_reminder_hours,
    base_escalation_hours,
    slow_sector_hours,
    learning_enabled
)
VALUES (1, false, NULL, 90, 24, 72, 48, true)
ON CONFLICT (id) DO UPDATE
SET
    history_window_days = EXCLUDED.history_window_days,
    base_reminder_hours = EXCLUDED.base_reminder_hours,
    base_escalation_hours = EXCLUDED.base_escalation_hours,
    slow_sector_hours = EXCLUDED.slow_sector_hours,
    learning_enabled = EXCLUDED.learning_enabled,
    updated_at = now();

DO $$
DECLARE
    v_default_bot_id UUID := '9f4e1f59-0afd-4e8f-aea1-fcd930af0e0c';
    v_existing_bot_id UUID;
BEGIN
    SELECT id
    INTO v_existing_bot_id
    FROM public.users
    WHERE lower(email) = 'analista.ia@internal.local'
    ORDER BY id ASC
    LIMIT 1;

    IF v_existing_bot_id IS NULL THEN
        INSERT INTO public.users (
            id,
            email,
            role,
            allowed_brands,
            name,
            status,
            sales_access,
            internal_chat_access
        )
        VALUES (
            v_default_bot_id,
            'analista.ia@internal.local',
            'funcionario_n1',
            ARRAY['rental', 'dorata']::public.brand_enum[],
            'Analista IA',
            'ATIVO',
            false,
            true
        )
        ON CONFLICT (id) DO UPDATE
        SET
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            name = EXCLUDED.name,
            status = COALESCE(public.users.status, EXCLUDED.status),
            sales_access = COALESCE(public.users.sales_access, EXCLUDED.sales_access),
            internal_chat_access = COALESCE(public.users.internal_chat_access, EXCLUDED.internal_chat_access),
            allowed_brands = COALESCE(public.users.allowed_brands, EXCLUDED.allowed_brands),
            updated_at = now();

        v_existing_bot_id := v_default_bot_id;
    END IF;

    UPDATE public.task_analyst_config
    SET
        bot_user_id = COALESCE(bot_user_id, v_existing_bot_id),
        updated_at = now()
    WHERE id = 1;
END;
$$;

CREATE TABLE IF NOT EXISTS public.task_analyst_department_thresholds (
    department TEXT PRIMARY KEY
        CHECK (department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro')),
    reminder_hours INTEGER NOT NULL CHECK (reminder_hours BETWEEN 1 AND 240),
    escalation_hours INTEGER NOT NULL CHECK (escalation_hours BETWEEN 1 AND 240),
    slow_hours INTEGER NOT NULL CHECK (slow_hours BETWEEN 1 AND 240),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'learned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.task_analyst_department_thresholds (
    department,
    reminder_hours,
    escalation_hours,
    slow_hours,
    source
)
SELECT
    dept,
    24,
    72,
    48,
    'manual'
FROM unnest(ARRAY['vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro']) AS dept
ON CONFLICT (department) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.task_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'TASK_CREATED',
            'TASK_STATUS_CHANGED',
            'TASK_ASSIGNEE_CHANGED',
            'TASK_CHECKLIST_CREATED',
            'TASK_CHECKLIST_DECISION_CHANGED',
            'TASK_COMMENT_CREATED'
        )
    ),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    checklist_item_id UUID REFERENCES public.task_checklists(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_events_task_event_at
    ON public.task_activity_events (task_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_activity_events_event_type_event_at
    ON public.task_activity_events (event_type, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_activity_events_checklist_item
    ON public.task_activity_events (checklist_item_id, event_at DESC)
    WHERE checklist_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.task_analyst_message_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('REMINDER', 'ESCALATION', 'MANAGER_DIGEST', 'UNASSIGNED_ALERT')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    conversation_id UUID REFERENCES public.internal_chat_conversations(id) ON DELETE SET NULL,
    hash_key TEXT NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_analyst_message_log_recipient_kind_sent
    ON public.task_analyst_message_log (recipient_user_id, kind, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_analyst_message_log_task_kind_sent
    ON public.task_analyst_message_log (task_id, kind, sent_at DESC)
    WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.task_analyst_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
    dry_run BOOLEAN NOT NULL DEFAULT false,
    tasks_scanned INTEGER NOT NULL DEFAULT 0,
    reminders_sent INTEGER NOT NULL DEFAULT 0,
    escalations_sent INTEGER NOT NULL DEFAULT 0,
    digests_sent INTEGER NOT NULL DEFAULT 0,
    unassigned_alerts_sent INTEGER NOT NULL DEFAULT 0,
    learned_thresholds_updated INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    error_details JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_analyst_runs_created_at
    ON public.task_analyst_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_analyst_runs_status_created
    ON public.task_analyst_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.task_analyst_learning_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department TEXT NOT NULL
        CHECK (department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro')),
    sample_size INTEGER NOT NULL CHECK (sample_size > 0),
    p75_first_progress_hours INTEGER NOT NULL CHECK (p75_first_progress_hours >= 0),
    previous_reminder_hours INTEGER NOT NULL CHECK (previous_reminder_hours >= 0),
    new_reminder_hours INTEGER NOT NULL CHECK (new_reminder_hours >= 0),
    previous_escalation_hours INTEGER NOT NULL CHECK (previous_escalation_hours >= 0),
    new_escalation_hours INTEGER NOT NULL CHECK (new_escalation_hours >= 0),
    learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_analyst_learning_audits_department_learned
    ON public.task_analyst_learning_audits (department, learned_at DESC);

CREATE TABLE IF NOT EXISTS public.task_analyst_scheduler_config (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    target_url TEXT,
    cron_token TEXT,
    timezone TEXT NOT NULL DEFAULT 'America/Cuiaba',
    timeout_ms INTEGER NOT NULL DEFAULT 30000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.task_analyst_scheduler_config (
    id,
    enabled,
    target_url,
    cron_token,
    timezone,
    timeout_ms
)
VALUES (1, false, NULL, NULL, 'America/Cuiaba', 30000)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_task_analyst_config_modtime ON public.task_analyst_config;
CREATE TRIGGER update_task_analyst_config_modtime
    BEFORE UPDATE ON public.task_analyst_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_analyst_department_thresholds_modtime ON public.task_analyst_department_thresholds;
CREATE TRIGGER update_task_analyst_department_thresholds_modtime
    BEFORE UPDATE ON public.task_analyst_department_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_analyst_runs_modtime ON public.task_analyst_runs;
CREATE TRIGGER update_task_analyst_runs_modtime
    BEFORE UPDATE ON public.task_analyst_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_task_analyst_scheduler_config_modtime ON public.task_analyst_scheduler_config;
CREATE TRIGGER update_task_analyst_scheduler_config_modtime
    BEFORE UPDATE ON public.task_analyst_scheduler_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.task_analyst_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_analyst_department_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_analyst_message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_analyst_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_analyst_learning_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_analyst_scheduler_config ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.task_analyst_config TO service_role;
GRANT ALL ON TABLE public.task_analyst_department_thresholds TO service_role;
GRANT ALL ON TABLE public.task_activity_events TO service_role;
GRANT ALL ON TABLE public.task_analyst_message_log TO service_role;
GRANT ALL ON TABLE public.task_analyst_runs TO service_role;
GRANT ALL ON TABLE public.task_analyst_learning_audits TO service_role;
GRANT ALL ON TABLE public.task_analyst_scheduler_config TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_task_analyst_job()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enabled BOOLEAN;
    v_target_url TEXT;
    v_cron_token TEXT;
    v_timezone TEXT;
    v_timeout_ms INTEGER;
    v_analyst_enabled BOOLEAN;
    v_now_local TIMESTAMP;
    v_hour INTEGER;
    v_headers JSONB;
    v_body JSONB;
BEGIN
    SELECT enabled
    INTO v_analyst_enabled
    FROM public.task_analyst_config
    WHERE id = 1;

    IF COALESCE(v_analyst_enabled, false) IS DISTINCT FROM true THEN
        RETURN;
    END IF;

    SELECT enabled, target_url, cron_token, timezone, timeout_ms
    INTO v_enabled, v_target_url, v_cron_token, v_timezone, v_timeout_ms
    FROM public.task_analyst_scheduler_config
    WHERE id = 1;

    IF COALESCE(v_enabled, false) IS DISTINCT FROM true THEN
        RETURN;
    END IF;

    IF v_target_url IS NULL OR btrim(v_target_url) = '' THEN
        RETURN;
    END IF;

    IF v_cron_token IS NULL OR btrim(v_cron_token) = '' THEN
        RETURN;
    END IF;

    v_timezone := COALESCE(NULLIF(v_timezone, ''), 'America/Cuiaba');
    v_now_local := now() AT TIME ZONE v_timezone;
    v_hour := EXTRACT(HOUR FROM v_now_local)::INTEGER;

    IF v_hour NOT IN (8, 14) THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_net'
    ) THEN
        RETURN;
    END IF;

    v_timeout_ms := GREATEST(1000, LEAST(COALESCE(v_timeout_ms, 30000), 120000));
    v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-task-analyst-cron-token', v_cron_token
    );
    v_body := jsonb_build_object(
        'trigger', 'scheduled',
        'dryRun', false
    );

    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4);'
    USING v_target_url, v_body, v_headers, v_timeout_ms;
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.task_analyst_runs (
            trigger,
            status,
            message,
            error_details,
            finished_at
        )
        VALUES (
            'scheduled',
            'failed',
            'Falha ao disparar task analyst automático via pg_cron/pg_net.',
            jsonb_build_object('error', SQLERRM),
            now()
        );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_task_analyst_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_task_analyst_job() TO service_role;

DO $$
DECLARE
    v_job_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_available_extensions
        WHERE name = 'pg_net'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_available_extensions
        WHERE name = 'pg_cron'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

        SELECT jobid
        INTO v_job_id
        FROM cron.job
        WHERE jobname = 'task-analyst-hourly-trigger'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'task-analyst-hourly-trigger',
            '0 * * * *',
            'SELECT public.trigger_task_analyst_job();'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping task analyst pg_cron scheduling: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
