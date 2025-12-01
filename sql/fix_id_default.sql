-- ==============================================================================
-- FIX: ID DEFAULT VALUE
-- Description: 
-- The 'id' column is missing a default value (it is NULL).
-- This causes INSERTS to fail because the app doesn't send an ID.
-- We set it to gen_random_uuid().
-- ==============================================================================

BEGIN;

-- 1. Ensure pgcrypto extension is available (usually enabled, but good to check)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Set default for 'id' column
ALTER TABLE public.indicacoes 
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Verify
SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' AND column_name = 'id';

COMMIT;
