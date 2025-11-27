-- ==============================================================================
-- FIX RLS POLICIES
-- Description: 
-- 1. Enables RLS on public.users and allows users to read their own profile.
-- 2. Updates public.indicacoes policies to use public.users for permission checks
--    instead of relying on JWT metadata (which can be out of sync).
-- ==============================================================================

-- 1. FIX PUBLIC.USERS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
USING (
  auth.uid() = id
);

-- Grant permissions to authenticated users
GRANT SELECT ON public.users TO authenticated;


-- 2. FIX PUBLIC.INDICACOES
-- We drop the old policies that relied on JWT metadata
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;

-- Re-create policies using public.users as the source of truth for 'allowed_brands'

-- SELECT
CREATE POLICY "Indicacoes própria + marca"
ON public.indicacoes
FOR SELECT
USING (
  auth.uid() = user_id
  AND marca::text = ANY (
    SELECT unnest(allowed_brands)::text
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- INSERT
CREATE POLICY "Inserir indicacao marca permitida"
ON public.indicacoes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND marca::text = ANY (
    SELECT unnest(allowed_brands)::text
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- UPDATE
CREATE POLICY "Atualizar indicacao marca permitida"
ON public.indicacoes
FOR UPDATE
USING (
  auth.uid() = user_id
  AND marca::text = ANY (
    SELECT unnest(allowed_brands)::text
    FROM public.users
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND marca::text = ANY (
    SELECT unnest(allowed_brands)::text
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- DELETE
CREATE POLICY "Deletar indicacao marca permitida"
ON public.indicacoes
FOR DELETE
USING (
  auth.uid() = user_id
  AND marca::text = ANY (
    SELECT unnest(allowed_brands)::text
    FROM public.users
    WHERE id = auth.uid()
  )
);
