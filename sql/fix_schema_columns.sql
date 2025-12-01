-- ==============================================================================
-- FIX: SCHEMA COLUMNS
-- Description: 
-- Ensures that the 'indicacoes' table has all the columns expected by the frontend.
-- This fixes the 400 Bad Request error caused by missing columns.
-- ==============================================================================

-- 1. Ensure 'marca' column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'marca') THEN
        ALTER TABLE public.indicacoes ADD COLUMN marca TEXT DEFAULT 'rental';
    END IF;
END $$;

-- 2. Ensure 'tipo' column exists (PF/PJ)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'tipo') THEN
        ALTER TABLE public.indicacoes ADD COLUMN tipo TEXT DEFAULT 'PF';
    END IF;
END $$;

-- 3. Ensure 'status' column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'status') THEN
        ALTER TABLE public.indicacoes ADD COLUMN status TEXT DEFAULT 'EM_ANALISE';
    END IF;
END $$;

-- 4. Ensure 'user_id' column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        ALTER TABLE public.indicacoes ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 5. Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'indicacoes';
