-- Fix RLS Policies for Admins
-- Allows adm_mestre and adm_dorata to view ALL indications and users

-- 1. Update 'indicacoes' policies
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Admin vê tudo" ON public.indicacoes;

CREATE POLICY "Admin vê tudo"
ON public.indicacoes
FOR ALL
USING (
  (auth.jwt()->'user_metadata'->>'role') IN ('adm_mestre', 'adm_dorata')
);

CREATE POLICY "Indicacoes própria + marca"
ON public.indicacoes
FOR ALL
USING (
  (auth.jwt()->'user_metadata'->>'role') NOT IN ('adm_mestre', 'adm_dorata')
  AND auth.uid() = user_id
  AND marca::text = ANY (COALESCE((auth.jwt()->'user_metadata'->>'allowed_brands')::text[], ARRAY['rental']::text[]))
);

-- 2. Update 'users' policies (just in case)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin vê todos usuarios" ON public.users;
DROP POLICY IF EXISTS "Usuario vê proprio perfil" ON public.users;

CREATE POLICY "Admin vê todos usuarios"
ON public.users
FOR SELECT
USING (
  (auth.jwt()->'user_metadata'->>'role') IN ('adm_mestre', 'adm_dorata')
);

CREATE POLICY "Usuario vê proprio perfil"
ON public.users
FOR SELECT
USING (
  auth.uid() = id
);
