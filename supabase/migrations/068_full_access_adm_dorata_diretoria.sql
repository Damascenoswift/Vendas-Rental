-- Migration 068: Full access for adm_dorata and diretoria
-- Description: Grants full RLS access for users with role adm_dorata or department diretoria.

BEGIN;

-- Helper: full access check (adm_mestre, adm_dorata, or department diretoria)
CREATE OR REPLACE FUNCTION public.has_full_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND (
        role IN ('adm_mestre', 'adm_dorata')
        OR department = 'diretoria'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_full_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_full_access TO service_role;

-- Keep compatibility with existing policies that call is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_full_access();
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO service_role;

-- Apply full access policy to all RLS-enabled tables in public schema
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Full access for adm_dorata or diretoria" ON %I.%I', r.schema_name, r.table_name);
    EXECUTE format(
      'CREATE POLICY "Full access for adm_dorata or diretoria" ON %I.%I FOR ALL USING (public.has_full_access()) WITH CHECK (public.has_full_access())',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END $$;

COMMIT;
