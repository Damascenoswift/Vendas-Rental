BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS whatsapp_inbox_access boolean;

UPDATE public.users
SET whatsapp_inbox_access = true
WHERE whatsapp_inbox_access IS NULL
  AND role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado');

UPDATE public.users
SET whatsapp_inbox_access = false
WHERE whatsapp_inbox_access IS NULL;

ALTER TABLE public.users
    ALTER COLUMN whatsapp_inbox_access SET DEFAULT false;

ALTER TABLE public.users
    ALTER COLUMN whatsapp_inbox_access SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_whatsapp_inbox_access_true
    ON public.users (whatsapp_inbox_access)
    WHERE whatsapp_inbox_access = true;

COMMENT ON COLUMN public.users.whatsapp_inbox_access
    IS 'Define se o usuario pode acessar a inbox WhatsApp.';

CREATE OR REPLACE FUNCTION public.has_whatsapp_inbox_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.whatsapp_inbox_access = true
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_role public.user_role_enum;
    sales_enabled boolean;
    chat_enabled boolean;
    whatsapp_enabled boolean;
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

    INSERT INTO public.users (
        id,
        email,
        role,
        allowed_brands,
        name,
        status,
        sales_access,
        internal_chat_access,
        whatsapp_inbox_access
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
        whatsapp_enabled
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
        updated_at = now();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

COMMIT;
