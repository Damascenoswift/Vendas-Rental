BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS sales_access boolean;

UPDATE public.users
SET sales_access = true
WHERE sales_access IS NULL
  AND role IN ('vendedor_externo', 'vendedor_interno', 'supervisor');

UPDATE public.users
SET sales_access = false
WHERE sales_access IS NULL;

ALTER TABLE public.users
    ALTER COLUMN sales_access SET DEFAULT false;

ALTER TABLE public.users
    ALTER COLUMN sales_access SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_sales_access_true
    ON public.users (sales_access)
    WHERE sales_access = true;

COMMENT ON COLUMN public.users.sales_access
    IS 'Define se o usuario participa de vendas (indicacoes/comissao) no financeiro.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_role public.user_role_enum;
    sales_enabled boolean;
BEGIN
    new_role := COALESCE(new.raw_user_meta_data->>'role', 'vendedor_externo')::public.user_role_enum;

    sales_enabled := CASE
        WHEN lower(coalesce(new.raw_user_meta_data->>'sales_access', '')) IN ('true', '1', 'on', 'yes') THEN true
        WHEN lower(coalesce(new.raw_user_meta_data->>'sales_access', '')) IN ('false', '0', 'off', 'no') THEN false
        ELSE new_role::text IN ('vendedor_externo', 'vendedor_interno', 'supervisor')
    END;

    INSERT INTO public.users (id, email, role, allowed_brands, name, status, sales_access)
    VALUES (
        new.id,
        new.email,
        new_role,
        ARRAY['rental']::public.brand_enum[],
        COALESCE(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', 'Novo Usuário'),
        'ATIVO',
        sales_enabled
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        name = COALESCE(EXCLUDED.name, public.users.name),
        status = COALESCE(public.users.status, 'ATIVO'),
        sales_access = COALESCE(public.users.sales_access, EXCLUDED.sales_access, false),
        updated_at = now();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

COMMIT;
