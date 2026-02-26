BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'department_enum'
          AND e.enumlabel = 'obras'
    ) THEN
        ALTER TYPE public.department_enum ADD VALUE 'obras';
    END IF;
END
$$;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.is_work_staff(
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
          AND (
            u.role::text IN (
              'adm_mestre',
              'adm_dorata',
              'supervisor',
              'suporte',
              'suporte_tecnico',
              'suporte_limitado',
              'funcionario_n1',
              'funcionario_n2'
            )
            OR u.department = 'obras'::public.department_enum
          )
    );
$$;

REVOKE ALL ON FUNCTION public.is_work_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_work_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_work_staff(UUID) TO service_role;

ALTER TABLE public.tasks
    DROP CONSTRAINT IF EXISTS tasks_department_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_department_check
    CHECK (department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro'));

NOTIFY pgrst, 'reload schema';

COMMIT;
