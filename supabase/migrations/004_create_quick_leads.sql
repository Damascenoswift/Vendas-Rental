-- Migration: Create quick_leads table
-- Description: Stores simplified leads (Name, WhatsApp, Observation) for quick indication flow.

CREATE TABLE IF NOT EXISTS public.quick_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  observacao TEXT,
  marca TEXT NOT NULL CHECK (marca IN ('rental', 'dorata')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.quick_leads ENABLE ROW LEVEL SECURITY;

-- Policies

-- 1. Insert: Authenticated users can insert their own leads
CREATE POLICY "Users can insert own quick leads"
ON public.quick_leads
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
);

-- 2. Select: Users can see their own leads
CREATE POLICY "Users can view own quick leads"
ON public.quick_leads
FOR SELECT
USING (
  auth.uid() = user_id
);

-- 3. Select (Admin): Master Admin can see ALL leads
CREATE POLICY "Master Admin can view all quick leads"
ON public.quick_leads
FOR SELECT
USING (
  (auth.jwt()->'user_metadata'->>'role') = 'adm_mestre'
);

-- Grant permissions
GRANT ALL ON public.quick_leads TO authenticated;
GRANT ALL ON public.quick_leads TO service_role;
