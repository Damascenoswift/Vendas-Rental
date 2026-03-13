BEGIN;

ALTER TABLE public.usinas
    ADD COLUMN IF NOT EXISTS cogni_company_id TEXT,
    ADD COLUMN IF NOT EXISTS cogni_company_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usinas_cogni_company_id_unique
    ON public.usinas (cogni_company_id)
    WHERE cogni_company_id IS NOT NULL;

ALTER TABLE public.faturas_conciliacao
    ADD COLUMN IF NOT EXISTS origem_integracao TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS cogni_invoice_id TEXT,
    ADD COLUMN IF NOT EXISTS boleto_url TEXT,
    ADD COLUMN IF NOT EXISTS boleto_linha_digitavel TEXT,
    ADD COLUMN IF NOT EXISTS boleto_vencimento DATE,
    ADD COLUMN IF NOT EXISTS cogni_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'faturas_conciliacao_origem_integracao_check'
          AND conrelid = 'public.faturas_conciliacao'::regclass
    ) THEN
        ALTER TABLE public.faturas_conciliacao
            ADD CONSTRAINT faturas_conciliacao_origem_integracao_check
            CHECK (origem_integracao IN ('MANUAL', 'COGNI'));
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_conciliacao_cogni_invoice_id_unique
    ON public.faturas_conciliacao (cogni_invoice_id);

CREATE INDEX IF NOT EXISTS idx_faturas_conciliacao_origem_mes_ano
    ON public.faturas_conciliacao (origem_integracao, mes_ano DESC);

DROP TRIGGER IF EXISTS update_faturas_conciliacao_modtime ON public.faturas_conciliacao;
CREATE TRIGGER update_faturas_conciliacao_modtime
    BEFORE UPDATE ON public.faturas_conciliacao
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cogni_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
    months_back INTEGER NOT NULL DEFAULT 12 CHECK (months_back BETWEEN 1 AND 60),
    dry_run BOOLEAN NOT NULL DEFAULT false,
    requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    fetched_count INTEGER NOT NULL DEFAULT 0,
    mapped_count INTEGER NOT NULL DEFAULT 0,
    upserted_count INTEGER NOT NULL DEFAULT 0,
    unresolved_count INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cogni_sync_runs_created_at
    ON public.cogni_sync_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cogni_sync_runs_status
    ON public.cogni_sync_runs (status, created_at DESC);

DROP TRIGGER IF EXISTS update_cogni_sync_runs_modtime ON public.cogni_sync_runs;
CREATE TRIGGER update_cogni_sync_runs_modtime
    BEFORE UPDATE ON public.cogni_sync_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cogni_invoice_payloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.cogni_sync_runs(id) ON DELETE SET NULL,
    endpoint TEXT NOT NULL,
    cogni_company_id TEXT,
    cogni_invoice_id TEXT,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_payloads_expires_at
    ON public.cogni_invoice_payloads (expires_at);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_payloads_run_id
    ON public.cogni_invoice_payloads (run_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_payloads_invoice
    ON public.cogni_invoice_payloads (cogni_invoice_id)
    WHERE cogni_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cogni_invoice_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.cogni_sync_runs(id) ON DELETE SET NULL,
    cogni_company_id TEXT NOT NULL,
    cogni_invoice_id TEXT NOT NULL,
    mes_ano DATE NOT NULL,
    codigo_instalacao TEXT,
    codigo_cliente TEXT,
    cliente_nome TEXT,
    usina_id UUID REFERENCES public.usinas(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL,
    valor_fatura NUMERIC,
    kwh_compensado NUMERIC,
    status_pagamento TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status_pagamento IN ('ABERTO', 'PAGO', 'ATRASADO', 'CANCELADO')),
    boleto_url TEXT,
    boleto_linha_digitavel TEXT,
    boleto_vencimento DATE,
    mapping_status TEXT NOT NULL DEFAULT 'UNMAPPED' CHECK (mapping_status IN ('MAPPED', 'UNMAPPED')),
    cogni_updated_at TIMESTAMPTZ,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cogni_invoice_cache_unique UNIQUE (cogni_company_id, cogni_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_cache_mapping
    ON public.cogni_invoice_cache (mapping_status, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_cache_usina_mes
    ON public.cogni_invoice_cache (usina_id, mes_ano DESC);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_cache_cliente_mes
    ON public.cogni_invoice_cache (cliente_id, mes_ano DESC);

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_cache_instalacao
    ON public.cogni_invoice_cache (codigo_instalacao)
    WHERE codigo_instalacao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cogni_invoice_cache_codigo_cliente
    ON public.cogni_invoice_cache (codigo_cliente)
    WHERE codigo_cliente IS NOT NULL;

DROP TRIGGER IF EXISTS update_cogni_invoice_cache_modtime ON public.cogni_invoice_cache;
CREATE TRIGGER update_cogni_invoice_cache_modtime
    BEFORE UPDATE ON public.cogni_invoice_cache
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cogni_scheduler_config (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    target_url TEXT,
    cron_token TEXT,
    timeout_ms INTEGER NOT NULL DEFAULT 30000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.cogni_scheduler_config (id, enabled, target_url, cron_token, timeout_ms)
VALUES (1, false, NULL, NULL, 30000)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_cogni_scheduler_config_modtime ON public.cogni_scheduler_config;
CREATE TRIGGER update_cogni_scheduler_config_modtime
    BEFORE UPDATE ON public.cogni_scheduler_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cogni_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogni_invoice_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogni_invoice_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogni_scheduler_config ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.cogni_sync_runs TO service_role;
GRANT ALL ON TABLE public.cogni_invoice_payloads TO service_role;
GRANT ALL ON TABLE public.cogni_invoice_cache TO service_role;
GRANT ALL ON TABLE public.cogni_scheduler_config TO service_role;

CREATE OR REPLACE FUNCTION public.prune_cogni_payloads_older_than(p_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER := COALESCE(p_days, 90);
    v_deleted INTEGER := 0;
BEGIN
    IF v_days < 1 THEN
        v_days := 90;
    END IF;

    DELETE FROM public.cogni_invoice_payloads
    WHERE received_at < now() - make_interval(days => v_days);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_cogni_payloads_older_than(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_cogni_payloads_older_than(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_cogni_sync_job()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enabled BOOLEAN;
    v_target_url TEXT;
    v_cron_token TEXT;
    v_timeout_ms INTEGER;
    v_headers JSONB;
    v_body JSONB;
BEGIN
    SELECT enabled, target_url, cron_token, timeout_ms
    INTO v_enabled, v_target_url, v_cron_token, v_timeout_ms
    FROM public.cogni_scheduler_config
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
        'x-cogni-cron-token', v_cron_token
    );

    v_body := jsonb_build_object(
        'trigger', 'scheduled',
        'monthsBack', 12,
        'dryRun', false
    );

    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4);'
    USING v_target_url, v_body, v_headers, v_timeout_ms;
EXCEPTION
    WHEN OTHERS THEN
        INSERT INTO public.cogni_sync_runs (
            trigger,
            status,
            months_back,
            dry_run,
            message,
            error_details,
            finished_at
        )
        VALUES (
            'scheduled',
            'failed',
            12,
            false,
            'Falha ao disparar sync automático via pg_cron/pg_net.',
            jsonb_build_object('error', SQLERRM),
            now()
        );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_cogni_sync_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_cogni_sync_job() TO service_role;

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
        WHERE jobname = 'cogni-sync-every-6h'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'cogni-sync-every-6h',
            '0 */6 * * *',
            'SELECT public.trigger_cogni_sync_job();'
        );

        SELECT jobid
        INTO v_job_id
        FROM cron.job
        WHERE jobname = 'prune-cogni-payloads-90d'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            PERFORM cron.unschedule(v_job_id);
        END IF;

        PERFORM cron.schedule(
            'prune-cogni-payloads-90d',
            '35 3 * * *',
            'SELECT public.prune_cogni_payloads_older_than(90);'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping COGNI pg_cron scheduling: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
