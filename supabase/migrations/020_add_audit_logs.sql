-- Migration 020: Add Audit Logs (Created By)
-- Description: Adds 'created_by' column to track which user created the record.
-- Supports automatic population via auth.uid() default.

BEGIN;

-- 1. Alocacoes Clientes
ALTER TABLE public.alocacoes_clientes
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) DEFAULT auth.uid();

-- 2. Historico Producao
ALTER TABLE public.historico_producao
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) DEFAULT auth.uid();

-- 3. Faturas Conciliacao
ALTER TABLE public.faturas_conciliacao
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) DEFAULT auth.uid();

-- 4. Usinas (Optional, but good to have)
ALTER TABLE public.usinas
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) DEFAULT auth.uid();

COMMIT;
