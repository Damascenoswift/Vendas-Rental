BEGIN;

ALTER TABLE public.proposal_negotiations
    ADD COLUMN IF NOT EXISTS followup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS followup_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auto_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS auto_reminder_interval_days INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS last_auto_reminder_at TIMESTAMPTZ;

ALTER TABLE public.proposal_negotiations
    DROP CONSTRAINT IF EXISTS proposal_negotiations_auto_reminder_interval_days_check;

ALTER TABLE public.proposal_negotiations
    ADD CONSTRAINT proposal_negotiations_auto_reminder_interval_days_check
    CHECK (auto_reminder_interval_days >= 1);

UPDATE public.proposal_negotiations
SET followup_at = (followup_date::timestamp AT TIME ZONE 'America/Cuiaba')
WHERE followup_date IS NOT NULL
  AND followup_at IS NULL;

INSERT INTO public.notification_event_catalog (
    event_key,
    domain,
    label,
    sector,
    default_enabled,
    allow_user_disable,
    is_mandatory
)
VALUES (
    'PROPOSAL_REMINDER',
    'SYSTEM',
    'Lembrete de orçamento',
    'vendas',
    true,
    true,
    false
)
ON CONFLICT (event_key) DO UPDATE
SET
    domain = EXCLUDED.domain,
    label = EXCLUDED.label,
    sector = EXCLUDED.sector,
    default_enabled = EXCLUDED.default_enabled,
    allow_user_disable = EXCLUDED.allow_user_disable,
    is_mandatory = EXCLUDED.is_mandatory,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.run_due_proposal_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_sent INTEGER := 0;
    v_inserted_rows INTEGER := 0;
    v_target_path TEXT;
    v_client_name TEXT;
    v_dedupe_key TEXT;
    rec RECORD;
BEGIN
    FOR rec IN
        WITH eligible AS (
            SELECT
                p.id AS proposal_id,
                p.created_at AS proposal_created_at,
                p.seller_id,
                COALESCE(n.negotiation_status, 'sem_contato'::public.negotiation_status_enum) AS negotiation_status,
                n.followup_at,
                n.followup_notified_at,
                COALESCE(n.auto_reminder_enabled, true) AS auto_reminder_enabled,
                GREATEST(COALESCE(n.auto_reminder_interval_days, 2), 1) AS auto_reminder_interval_days,
                n.last_auto_reminder_at,
                COALESCE(c.full_name, i.nome, 'Cliente') AS client_name,
                COALESCE(n.last_auto_reminder_at, p.created_at)
                    + make_interval(days => GREATEST(COALESCE(n.auto_reminder_interval_days, 2), 1)) AS next_auto_due_at
            FROM public.proposals p
            LEFT JOIN public.proposal_negotiations n ON n.proposal_id = p.id
            LEFT JOIN public.contacts c ON c.id = p.contact_id
            LEFT JOIN public.indicacoes i ON i.id = p.client_id
            WHERE p.seller_id IS NOT NULL
              AND COALESCE(n.negotiation_status, 'sem_contato'::public.negotiation_status_enum)
                    NOT IN ('convertido'::public.negotiation_status_enum, 'perdido'::public.negotiation_status_enum)
        )
        SELECT
            proposal_id,
            seller_id,
            client_name,
            auto_reminder_interval_days,
            followup_at,
            next_auto_due_at,
            CASE
                WHEN followup_at IS NOT NULL
                    AND followup_at <= v_now
                    AND (followup_notified_at IS NULL OR followup_notified_at < followup_at)
                    THEN 'MANUAL'
                WHEN auto_reminder_enabled
                    AND next_auto_due_at <= v_now
                    THEN 'AUTO'
                ELSE NULL
            END AS reminder_kind
        FROM eligible
    LOOP
        IF rec.reminder_kind IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.proposal_negotiations (proposal_id)
        VALUES (rec.proposal_id)
        ON CONFLICT (proposal_id) DO NOTHING;

        v_target_path := format('/admin/orcamentos?proposalId=%s', rec.proposal_id);
        v_client_name := COALESCE(NULLIF(btrim(rec.client_name), ''), 'Cliente');

        IF rec.reminder_kind = 'MANUAL' THEN
            v_dedupe_key := format(
                'proposal-reminder:manual:%s:%s',
                rec.proposal_id,
                to_char(rec.followup_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
            );

            INSERT INTO public.notifications (
                recipient_user_id,
                actor_user_id,
                task_id,
                task_comment_id,
                type,
                title,
                message,
                metadata,
                domain,
                event_key,
                sector,
                responsibility_kind,
                entity_type,
                entity_id,
                dedupe_key,
                is_mandatory
            )
            VALUES (
                rec.seller_id,
                NULL,
                NULL,
                NULL,
                'TASK_SYSTEM',
                'Lembrete de orçamento',
                format('Follow-up agendado para entrar em contato com %s.', v_client_name),
                jsonb_build_object(
                    'proposal_id', rec.proposal_id,
                    'reminder_kind', 'MANUAL',
                    'followup_at', rec.followup_at,
                    'target_path', v_target_path
                ),
                'SYSTEM',
                'PROPOSAL_REMINDER',
                'vendas',
                'DIRECT',
                'SYSTEM',
                rec.proposal_id::text,
                v_dedupe_key,
                false
            )
            ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

            GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

            IF v_inserted_rows > 0 THEN
                UPDATE public.proposal_negotiations
                SET
                    followup_notified_at = v_now,
                    updated_at = v_now
                WHERE proposal_id = rec.proposal_id;

                v_sent := v_sent + 1;
            END IF;
        ELSE
            v_dedupe_key := format(
                'proposal-reminder:auto:%s:%s',
                rec.proposal_id,
                to_char(rec.next_auto_due_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
            );

            INSERT INTO public.notifications (
                recipient_user_id,
                actor_user_id,
                task_id,
                task_comment_id,
                type,
                title,
                message,
                metadata,
                domain,
                event_key,
                sector,
                responsibility_kind,
                entity_type,
                entity_id,
                dedupe_key,
                is_mandatory
            )
            VALUES (
                rec.seller_id,
                NULL,
                NULL,
                NULL,
                'TASK_SYSTEM',
                'Lembrete de orçamento',
                format('Lembrete automático para acompanhar o orçamento de %s.', v_client_name),
                jsonb_build_object(
                    'proposal_id', rec.proposal_id,
                    'reminder_kind', 'AUTO',
                    'auto_interval_days', rec.auto_reminder_interval_days,
                    'auto_due_at', rec.next_auto_due_at,
                    'target_path', v_target_path
                ),
                'SYSTEM',
                'PROPOSAL_REMINDER',
                'vendas',
                'DIRECT',
                'SYSTEM',
                rec.proposal_id::text,
                v_dedupe_key,
                false
            )
            ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

            GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

            IF v_inserted_rows > 0 THEN
                UPDATE public.proposal_negotiations
                SET
                    last_auto_reminder_at = v_now,
                    updated_at = v_now
                WHERE proposal_id = rec.proposal_id;

                v_sent := v_sent + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.run_due_proposal_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_due_proposal_reminders() TO service_role;

DO $$
DECLARE
    v_job_id BIGINT;
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
        WHERE jobname = 'proposal-reminders-hourly'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'proposal-reminders-hourly',
            '0 * * * *',
            'SELECT public.run_due_proposal_reminders();'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping proposal reminders pg_cron scheduling: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
