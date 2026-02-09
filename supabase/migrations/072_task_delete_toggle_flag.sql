-- Migration 072: Runtime toggle for employee task deletion
-- Description: Adds a global flag to enable/disable delete-any-task for authenticated employees.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_runtime_flags (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_runtime_flags_enabled
ON public.app_runtime_flags (enabled);

DROP TRIGGER IF EXISTS update_app_runtime_flags_modtime ON public.app_runtime_flags;
CREATE TRIGGER update_app_runtime_flags_modtime
    BEFORE UPDATE ON public.app_runtime_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_runtime_flags (key, enabled, description)
VALUES (
    'tasks_employees_can_delete_any',
    true,
    'Quando true, qualquer usuário autenticado pode apagar tarefas criadas por qualquer pessoa.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_runtime_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees Read Runtime Flags" ON public.app_runtime_flags;
CREATE POLICY "Employees Read Runtime Flags"
ON public.app_runtime_flags
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins Manage Runtime Flags" ON public.app_runtime_flags;
CREATE POLICY "Admins Manage Runtime Flags"
ON public.app_runtime_flags
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
    )
);

GRANT ALL ON public.app_runtime_flags TO authenticated;

CREATE OR REPLACE FUNCTION public.is_runtime_flag_enabled(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT enabled
            FROM public.app_runtime_flags rf
            WHERE rf.key = p_key
            LIMIT 1
        ),
        false
    );
$$;

REVOKE ALL ON FUNCTION public.is_runtime_flag_enabled(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_runtime_flag_enabled(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Tasks Delete By Rule" ON public.tasks;
DROP POLICY IF EXISTS "Admins Delete Tasks" ON public.tasks;

CREATE POLICY "Tasks Delete By Rule"
ON public.tasks
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
    )
    OR (
        auth.role() = 'authenticated'
        AND public.is_runtime_flag_enabled('tasks_employees_can_delete_any')
    )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
