-- Migration to create orcamentos table and storage setup
-- UPDATED: Includes safety checks to prevent "already exists" errors.

BEGIN;

-- 1. Create ORCAMENTOS table
CREATE TABLE IF NOT EXISTS public.orcamentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    cliente_nome text NOT NULL,
    cliente_gasto_mensal numeric,
    is_b_optante boolean DEFAULT false,
    conta_energia_url text,
    status text DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'VISUALIZADO', 'RESPONDIDO'))
);

-- 2. Enable RLS (safe to run multiple times)
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- We drop them first to ensure we can recreate them without error.

DROP POLICY IF EXISTS "Users can view own budgets" ON public.orcamentos;
CREATE POLICY "Users can view own budgets"
ON public.orcamentos
FOR SELECT
USING (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can insert own budgets" ON public.orcamentos;
CREATE POLICY "Users can insert own budgets"
ON public.orcamentos
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "Admins can view all budgets" ON public.orcamentos;
CREATE POLICY "Admins can view all budgets"
ON public.orcamentos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'adm_mestre'
  )
);

DROP POLICY IF EXISTS "Admins can update budgets" ON public.orcamentos;
CREATE POLICY "Admins can update budgets"
ON public.orcamentos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'adm_mestre'
  )
);


-- 4. Storage Bucket Setup
-- Safe insertion for bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('orcamentos', 'orcamentos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'orcamentos' bucket
-- Drop existing storage policies to prevent duplicates/errors

DROP POLICY IF EXISTS "Authenticated users can upload orcamentos" ON storage.objects;
CREATE POLICY "Authenticated users can upload orcamentos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'orcamentos' );

DROP POLICY IF EXISTS "Anyone can read orcamentos" ON storage.objects;
CREATE POLICY "Anyone can read orcamentos"
ON storage.objects
FOR SELECT
TO authenticated
USING ( bucket_id = 'orcamentos' );

COMMIT;
