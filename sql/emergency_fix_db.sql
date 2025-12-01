-- ==============================================================================
-- EMERGENCY FIX: DB SCHEMA
-- Description: 
-- 1. Resolves 'salesperson_id' vs 'user_id' conflict.
-- 2. Ensures all columns exist (tipo, nome, email, telefone, etc.).
-- 3. Relaxes constraints (makes columns nullable) to prevent 400 errors.
-- ==============================================================================

BEGIN;

-- 1. Fix 'user_id' column
DO $$
BEGIN
    -- Rename salesperson_id if it exists and user_id doesn't
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'salesperson_id') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        ALTER TABLE public.indicacoes RENAME COLUMN salesperson_id TO user_id;
    END IF;

    -- Drop salesperson_id if both exist (keep user_id)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'salesperson_id') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        ALTER TABLE public.indicacoes DROP COLUMN salesperson_id;
    END IF;

    -- Create user_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'user_id') THEN
        ALTER TABLE public.indicacoes ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Ensure all columns exist and are TEXT (permissive)
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS tipo TEXT;
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'EM_ANALISE';
ALTER TABLE public.indicacoes ADD COLUMN IF NOT EXISTS marca TEXT DEFAULT 'rental';

-- 3. Relax constraints (DROP NOT NULL) to avoid 400 errors on missing fields
ALTER TABLE public.indicacoes ALTER COLUMN tipo DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN telefone DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN marca DROP NOT NULL;
ALTER TABLE public.indicacoes ALTER COLUMN user_id DROP NOT NULL;

-- 4. Ensure types are TEXT
ALTER TABLE public.indicacoes ALTER COLUMN tipo TYPE TEXT;
ALTER TABLE public.indicacoes ALTER COLUMN nome TYPE TEXT;
ALTER TABLE public.indicacoes ALTER COLUMN email TYPE TEXT;
ALTER TABLE public.indicacoes ALTER COLUMN telefone TYPE TEXT;
ALTER TABLE public.indicacoes ALTER COLUMN status TYPE TEXT;
ALTER TABLE public.indicacoes ALTER COLUMN marca TYPE TEXT;

COMMIT;
