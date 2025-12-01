-- ==============================================================================
-- FIX: FORCE CONVERT ENUMS (DROP POLICIES FIRST)
-- Description: 
-- 1. Drops ALL known policies on 'indicacoes' to free up the 'marca' column.
-- 2. Converts 'marca' and 'status' to TEXT.
-- 3. Re-applies the simplified RLS policies.
-- ==============================================================================

-- 1. DROP ALL POLICIES (To avoid "cannot alter column used in policy" error)
DROP POLICY IF EXISTS "user_own_indicacoes_read" ON public.indicacoes;
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Select Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Insert Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Update Own" ON public.indicacoes;
DROP POLICY IF EXISTS "Debug: Delete Own" ON public.indicacoes;

-- 2. CONVERT COLUMNS TO TEXT
ALTER TABLE public.indicacoes ALTER COLUMN marca DROP DEFAULT;
ALTER TABLE public.indicacoes ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.indicacoes 
  ALTER COLUMN marca TYPE TEXT USING marca::text;

ALTER TABLE public.indicacoes 
  ALTER COLUMN status TYPE TEXT USING status::text;

ALTER TABLE public.indicacoes ALTER COLUMN marca SET DEFAULT 'rental';
ALTER TABLE public.indicacoes ALTER COLUMN status SET DEFAULT 'EM_ANALISE';

-- 3. RE-APPLY SIMPLIFIED RLS (So the app still works securely)
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Select Own"
ON public.indicacoes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Allow Insert Own"
ON public.indicacoes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow Update Own"
ON public.indicacoes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Allow Delete Own"
ON public.indicacoes FOR DELETE
USING (auth.uid() = user_id);
