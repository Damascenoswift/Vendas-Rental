-- ==============================================================================
-- REPAIR DATABASE STRUCTURE (ALL-IN-ONE FIX)
-- Description: 
-- 1. Ensures all required columns exist.
-- 2. Converts columns to TEXT to avoid type errors.
-- 3. Resets security policies to a clean state.
-- 4. Grants necessary permissions.
-- ==============================================================================

BEGIN;

-- 1. ENSURE COLUMNS EXIST
-- We use a DO block to check and add columns if they are missing
DO $$
BEGIN
    -- 'marca'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'marca') THEN
        ALTER TABLE public.indicacoes ADD COLUMN marca TEXT DEFAULT 'rental';
    END IF;

    -- 'status'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'status') THEN
        ALTER TABLE public.indicacoes ADD COLUMN status TEXT DEFAULT 'EM_ANALISE';
    END IF;

    -- 'tipo' (PF/PJ)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'tipo') THEN
        ALTER TABLE public.indicacoes ADD COLUMN tipo TEXT DEFAULT 'PF';
    END IF;

    -- 'user_id'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        ALTER TABLE public.indicacoes ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;

    -- 'nome'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'nome') THEN
        ALTER TABLE public.indicacoes ADD COLUMN nome TEXT;
    END IF;

    -- 'email'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'email') THEN
        ALTER TABLE public.indicacoes ADD COLUMN email TEXT;
    END IF;

    -- 'telefone'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'telefone') THEN
        ALTER TABLE public.indicacoes ADD COLUMN telefone TEXT;
    END IF;
END $$;

-- 2. DROP ALL POLICIES (Clean slate)
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
DROP POLICY IF EXISTS "Final: Access Own Data" ON public.indicacoes;

-- 3. CONVERT COLUMNS TO TEXT (Ensure types are correct)
ALTER TABLE public.indicacoes ALTER COLUMN marca DROP DEFAULT;
ALTER TABLE public.indicacoes ALTER COLUMN status DROP DEFAULT;
-- Handle 'tipo' if it was an enum
ALTER TABLE public.indicacoes ALTER COLUMN tipo DROP DEFAULT;

ALTER TABLE public.indicacoes ALTER COLUMN marca TYPE TEXT USING marca::text;
ALTER TABLE public.indicacoes ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE public.indicacoes ALTER COLUMN tipo TYPE TEXT USING tipo::text;

ALTER TABLE public.indicacoes ALTER COLUMN marca SET DEFAULT 'rental';
ALTER TABLE public.indicacoes ALTER COLUMN status SET DEFAULT 'EM_ANALISE';
ALTER TABLE public.indicacoes ALTER COLUMN tipo SET DEFAULT 'PF';

-- 4. RESTORE RLS
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Repair: Access Own Data"
ON public.indicacoes
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. GRANT PERMISSIONS
GRANT ALL ON TABLE public.indicacoes TO authenticated;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMIT;
