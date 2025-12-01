-- ==============================================================================
-- FIX: MIGRATE AND DROP SALESPERSON_ID
-- Description: 
-- The 'salesperson_id' column is NOT NULL and is blocking inserts because the app
-- writes to 'user_id'. This script migrates data and removes the old column.
-- ==============================================================================

BEGIN;

-- 1. Migrate data from salesperson_id to user_id (if user_id is empty)
UPDATE public.indicacoes
SET user_id = salesperson_id
WHERE user_id IS NULL AND salesperson_id IS NOT NULL;

-- 2. Drop the conflicting 'salesperson_id' column
-- We use CASCADE to remove any constraints/indexes dependent on it
ALTER TABLE public.indicacoes DROP COLUMN IF EXISTS salesperson_id CASCADE;

-- 3. Ensure 'user_id' is NOT NULL (now that it has data)
ALTER TABLE public.indicacoes ALTER COLUMN user_id SET NOT NULL;

-- 4. Verify columns
SELECT column_name, is_nullable
FROM information_schema.columns 
WHERE table_name = 'indicacoes' 
AND column_name IN ('user_id', 'salesperson_id');

COMMIT;
