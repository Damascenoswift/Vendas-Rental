-- ==============================================================================
-- FINAL FIX: DROP POLICIES, CONVERT COLUMNS, RESTORE RLS
-- Description: 
-- This script performs all necessary steps in the correct order to fix the 400/403 errors.
-- 1. Drops ALL policies (including the one causing the error).
-- 2. Converts columns to TEXT (fixing the 400 Bad Request).
-- 3. Re-enables security with simplified rules.
-- ==============================================================================

BEGIN;

-- 1. DROP ALL EXISTING POLICIES (Fixes "cannot alter column" error)
DROP POLICY IF EXISTS "user_own_indicacoes_read" ON public.indicacoes;
DROP POLICY IF EXISTS "user_own_indicacoes_insert" ON public.indicacoes;
DROP POLICY IF EXISTS "user_own_indicacoes_update" ON public.indicacoes;
DROP POLICY IF EXISTS "user_own_indicacoes_delete" ON public.indicacoes;
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Select Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Insert Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Update Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Delete Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Allow Select Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Allow Insert Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Allow Update Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Allow Delete Own" ON public.indicacoes;

-- 2. CONVERT COLUMNS TO TEXT (Fixes "400 Bad Request" error)
-- We remove defaults first to avoid casting issues
ALTER TABLE public.indicacoes ALTER COLUMN marca DROP DEFAULT;
ALTER TABLE public.indicacoes ALTER COLUMN status DROP DEFAULT;

-- Convert to TEXT
ALTER TABLE public.indicacoes ALTER COLUMN marca TYPE TEXT USING marca::text;
ALTER TABLE public.indicacoes ALTER COLUMN status TYPE TEXT USING status::text;

-- Restore defaults
ALTER TABLE public.indicacoes ALTER COLUMN marca SET DEFAULT 'rental';
ALTER TABLE public.indicacoes ALTER COLUMN status SET DEFAULT 'EM_ANALISE';

-- 3. RESTORE RLS (Fixes "403 Forbidden" error)
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

-- Simple policy: Users can do anything with their own rows
CREATE POLICY "Final: Access Own Data"
ON public.indicacoes
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT ALL ON TABLE public.indicacoes TO authenticated;
GRANT ALL ON TABLE public.users TO authenticated;

COMMIT;
