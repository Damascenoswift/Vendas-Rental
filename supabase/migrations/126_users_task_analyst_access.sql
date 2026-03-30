BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS task_analyst_access boolean;

UPDATE public.users
SET task_analyst_access = true
WHERE task_analyst_access IS NULL
  AND role IN ('adm_mestre', 'adm_dorata');

UPDATE public.users
SET task_analyst_access = false
WHERE task_analyst_access IS NULL;

ALTER TABLE public.users
    ALTER COLUMN task_analyst_access SET DEFAULT false;

ALTER TABLE public.users
    ALTER COLUMN task_analyst_access SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_task_analyst_access_true
    ON public.users (task_analyst_access)
    WHERE task_analyst_access = true;

COMMENT ON COLUMN public.users.task_analyst_access
    IS 'Define se o usuario pode acessar o modulo Analista IA de tarefas.';

CREATE OR REPLACE FUNCTION public.has_task_analyst_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.task_analyst_access = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_task_analyst_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_task_analyst_access() TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_role public.user_role_enum;
    sales_enabled boolean;
    chat_enabled boolean;
    whatsapp_enabled boolean;
    task_analyst_enabled boolean;
BEGIN
    new_role := COALESCE(new.raw_user_meta_data->>'role', 'vendedor_externo')::public.user_role_enum;

    sales_enabled := CASE
        WHEN lower(coalesce(new.raw_user_meta_data->>'sales_access', '')) IN ('true', '1', 'on', 'yes') THEN true
        WHEN lower(coalesce(new.raw_user_meta_data->>'sales_access', '')) IN ('false', '0', 'off', 'no') THEN false
        ELSE new_role::text IN ('vendedor_externo', 'vendedor_interno', 'supervisor')
    END;

    chat_enabled := CASE
        WHEN lower(coalesce(new.raw_user_meta_data->>'internal_chat_access', '')) IN ('true', '1', 'on', 'yes') THEN true
        WHEN lower(coalesce(new.raw_user_meta_data->>'internal_chat_access', '')) IN ('false', '0', 'off', 'no') THEN false
        ELSE new_role::text IN ('funcionario_n1', 'funcionario_n2', 'supervisor')
    END;

    whatsapp_enabled := CASE
        WHEN lower(coalesce(new.raw_user_meta_data->>'whatsapp_inbox_access', '')) IN ('true', '1', 'on', 'yes') THEN true
        WHEN lower(coalesce(new.raw_user_meta_data->>'whatsapp_inbox_access', '')) IN ('false', '0', 'off', 'no') THEN false
        ELSE new_role::text IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado')
    END;

    task_analyst_enabled := CASE
        WHEN lower(coalesce(new.raw_user_meta_data->>'task_analyst_access', '')) IN ('true', '1', 'on', 'yes') THEN true
        WHEN lower(coalesce(new.raw_user_meta_data->>'task_analyst_access', '')) IN ('false', '0', 'off', 'no') THEN false
        ELSE new_role::text IN ('adm_mestre', 'adm_dorata')
    END;

    INSERT INTO public.users (
        id,
        email,
        role,
        allowed_brands,
        name,
        status,
        sales_access,
        internal_chat_access,
        whatsapp_inbox_access,
        task_analyst_access
    )
    VALUES (
        new.id,
        new.email,
        new_role,
        ARRAY['rental']::public.brand_enum[],
        COALESCE(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', 'Novo Usuário'),
        'ATIVO',
        sales_enabled,
        chat_enabled,
        whatsapp_enabled,
        task_analyst_enabled
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        name = COALESCE(EXCLUDED.name, public.users.name),
        status = COALESCE(public.users.status, 'ATIVO'),
        sales_access = COALESCE(public.users.sales_access, EXCLUDED.sales_access, false),
        internal_chat_access = COALESCE(public.users.internal_chat_access, EXCLUDED.internal_chat_access, false),
        whatsapp_inbox_access = COALESCE(public.users.whatsapp_inbox_access, EXCLUDED.whatsapp_inbox_access, false),
        task_analyst_access = COALESCE(public.users.task_analyst_access, EXCLUDED.task_analyst_access, false),
        updated_at = now();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

COMMIT;
