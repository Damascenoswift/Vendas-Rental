-- Migration 048: Relax user foreign keys to allow hard delete (preserve data)

BEGIN;

-- Contracts: keep record, null user reference on delete
ALTER TABLE IF EXISTS public.contracts
  DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
ALTER TABLE IF EXISTS public.contracts
  ADD CONSTRAINT contracts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.contracts
  DROP CONSTRAINT IF EXISTS contracts_approved_by_fkey;
ALTER TABLE IF EXISTS public.contracts
  ADD CONSTRAINT contracts_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Quick leads: keep record, null user reference on delete
ALTER TABLE IF EXISTS public.quick_leads
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.quick_leads
  DROP CONSTRAINT IF EXISTS quick_leads_user_id_fkey;
ALTER TABLE IF EXISTS public.quick_leads
  ADD CONSTRAINT quick_leads_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indicacao interactions: keep record, null user reference on delete
ALTER TABLE IF EXISTS public.indicacao_interactions
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.indicacao_interactions
  DROP CONSTRAINT IF EXISTS indicacao_interactions_user_id_fkey;
ALTER TABLE IF EXISTS public.indicacao_interactions
  ADD CONSTRAINT indicacao_interactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Energisa logs: keep record, null user reference on delete
ALTER TABLE IF EXISTS public.energisa_logs
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.energisa_logs
  DROP CONSTRAINT IF EXISTS energisa_logs_user_id_fkey;
ALTER TABLE IF EXISTS public.energisa_logs
  ADD CONSTRAINT energisa_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indicacoes: keep record, null user reference on delete
ALTER TABLE IF EXISTS public.indicacoes
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.indicacoes
  DROP CONSTRAINT IF EXISTS indicacoes_user_id_fkey;
ALTER TABLE IF EXISTS public.indicacoes
  ADD CONSTRAINT indicacoes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
