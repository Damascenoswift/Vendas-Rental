-- ==============================================================================
-- FIX: CONVERT ENUMS TO TEXT
-- Description: 
-- Converts 'marca' and 'status' columns from strict ENUM types to TEXT.
-- This resolves "400 Bad Request" errors caused by type mismatches or 
-- missing ENUM values (e.g. 'Dorata' vs 'dorata').
-- ==============================================================================

-- 1. Drop default values (to avoid casting errors during conversion)
ALTER TABLE public.indicacoes ALTER COLUMN marca DROP DEFAULT;
ALTER TABLE public.indicacoes ALTER COLUMN status DROP DEFAULT;

-- 2. Convert 'marca' to TEXT
ALTER TABLE public.indicacoes 
  ALTER COLUMN marca TYPE TEXT USING marca::text;

-- 3. Convert 'status' to TEXT
ALTER TABLE public.indicacoes 
  ALTER COLUMN status TYPE TEXT USING status::text;

-- 4. Re-add default values (as text)
ALTER TABLE public.indicacoes ALTER COLUMN marca SET DEFAULT 'rental';
ALTER TABLE public.indicacoes ALTER COLUMN status SET DEFAULT 'EM_ANALISE';

-- 5. Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' 
  AND column_name IN ('marca', 'status');
