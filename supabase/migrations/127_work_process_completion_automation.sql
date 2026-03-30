BEGIN;

CREATE TABLE IF NOT EXISTS public.work_process_completion_automation_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    channel_internal_enabled BOOLEAN NOT NULL DEFAULT true,
    channel_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    allowed_brands public.brand_enum[] NOT NULL DEFAULT ARRAY['dorata', 'rental']::public.brand_enum[],
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.work_process_completion_automation_settings (
    id,
    channel_internal_enabled,
    channel_whatsapp_enabled,
    allowed_brands
)
VALUES (
    1,
    true,
    false,
    ARRAY['dorata', 'rental']::public.brand_enum[]
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.work_process_completion_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    process_item_id UUID NOT NULL REFERENCES public.obra_process_items(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('INTERNAL', 'WHATSAPP')),
    status TEXT NOT NULL CHECK (status IN ('SENT', 'SKIPPED', 'FAILED')),
    target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    recipient_phone TEXT,
    reason_code TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_process_completion_automation_logs_channel_dedupe
    ON public.work_process_completion_automation_logs (channel, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_work_process_completion_automation_logs_created_at_desc
    ON public.work_process_completion_automation_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_process_completion_automation_logs_status_created_at
    ON public.work_process_completion_automation_logs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_work_process_completion_automation_manager(
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
          AND u.role IN ('adm_mestre', 'adm_dorata')
    );
$$;

REVOKE ALL ON FUNCTION public.is_work_process_completion_automation_manager(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_work_process_completion_automation_manager(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_work_process_completion_automation_manager(UUID) TO service_role;

DROP TRIGGER IF EXISTS update_work_process_completion_automation_settings_modtime ON public.work_process_completion_automation_settings;
CREATE TRIGGER update_work_process_completion_automation_settings_modtime
    BEFORE UPDATE ON public.work_process_completion_automation_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.work_process_completion_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_process_completion_automation_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON TABLE public.work_process_completion_automation_settings TO authenticated;
GRANT SELECT ON TABLE public.work_process_completion_automation_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_process_completion_automation_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_process_completion_automation_logs TO service_role;

DROP POLICY IF EXISTS "Work process completion automation settings read" ON public.work_process_completion_automation_settings;
CREATE POLICY "Work process completion automation settings read"
ON public.work_process_completion_automation_settings
FOR SELECT
USING (public.is_work_process_completion_automation_manager());

DROP POLICY IF EXISTS "Work process completion automation settings update" ON public.work_process_completion_automation_settings;
CREATE POLICY "Work process completion automation settings update"
ON public.work_process_completion_automation_settings
FOR UPDATE
USING (public.is_work_process_completion_automation_manager())
WITH CHECK (public.is_work_process_completion_automation_manager());

DROP POLICY IF EXISTS "Work process completion automation logs read" ON public.work_process_completion_automation_logs;
CREATE POLICY "Work process completion automation logs read"
ON public.work_process_completion_automation_logs
FOR SELECT
USING (public.is_work_process_completion_automation_manager());

NOTIFY pgrst, 'reload schema';

COMMIT;
