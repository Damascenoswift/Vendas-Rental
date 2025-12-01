-- Relax constraints for Dorata submission
-- We make documento, email, and company_id nullable because:
-- 1. Dorata form does not collect email or document (CPF/CNPJ).
-- 2. company_id appears to be a foreign key that we are not currently sending from the frontend.

BEGIN;

-- Make documento nullable
ALTER TABLE public.indicacoes ALTER COLUMN documento DROP NOT NULL;

-- Make email nullable
ALTER TABLE public.indicacoes ALTER COLUMN email DROP NOT NULL;

-- Make company_id nullable (if it exists and is not already nullable)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'indicacoes' AND column_name = 'company_id') THEN
        ALTER TABLE public.indicacoes ALTER COLUMN company_id DROP NOT NULL;
    END IF;
END $$;

COMMIT;
