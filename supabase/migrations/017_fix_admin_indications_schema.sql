-- Migration to fix Admin Indications schema and policies
-- Generated from rename_salesperson_to_userid.sql and FINAL_FIX_ALL.sql

-- PART 1: Rename salesperson_id to user_id if needed
DO $$
BEGIN
    -- Check if 'salesperson_id' exists and 'user_id' does NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'salesperson_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        
        ALTER TABLE public.indicacoes RENAME COLUMN salesperson_id TO user_id;
        
    -- If 'user_id' doesn't exist and 'salesperson_id' also doesn't exist, create 'user_id'
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        
        ALTER TABLE public.indicacoes ADD COLUMN user_id UUID REFERENCES auth.users(id);
        
    END IF;
END $$;

-- Verify the column exists (optional check, but good for logging)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name IN ('user_id', 'salesperson_id');


-- PART 2: FINAL FIX: DROP POLICIES, CONVERT COLUMNS, RESTORE RLS

BEGIN;

-- 1. DROP ALL EXISTING POLICIES (Fixes "cannot alter column" error and cleans up)
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
DROP POLICY IF EXISTS "Final: Access Own Data" ON public.indicacoes; -- Drop if exists to recreate

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
