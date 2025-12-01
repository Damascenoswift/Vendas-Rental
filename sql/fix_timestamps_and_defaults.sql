-- ==============================================================================
-- FIX: TIMESTAMPS DEFAULTS
-- Description: 
-- The 'created_at' and 'updated_at' columns likely miss default values.
-- This causes INSERTS to fail if the app doesn't send them.
-- We set them to now() and make them nullable just in case.
-- ==============================================================================

BEGIN;

-- 1. Fix created_at default
ALTER TABLE public.indicacoes 
ALTER COLUMN created_at SET DEFAULT now();

-- 2. Fix updated_at default (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'updated_at') THEN
        ALTER TABLE public.indicacoes ALTER COLUMN updated_at SET DEFAULT now();
        ALTER TABLE public.indicacoes ALTER COLUMN updated_at DROP NOT NULL;
    END IF;
END $$;

-- 3. Ensure created_at is nullable (safety net)
ALTER TABLE public.indicacoes ALTER COLUMN created_at DROP NOT NULL;

-- 4. List all constraints to see if there are any hidden blockers
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.indicacoes'::regclass;

COMMIT;
