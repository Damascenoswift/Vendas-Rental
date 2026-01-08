-- Migration 022: Rental Workflow Phase 1
-- Description: Adds interactions table and columns for tracking document validation status.

BEGIN;

-- 1. Add doc_validation_status to indicacoes
ALTER TABLE public.indicacoes
ADD COLUMN IF NOT EXISTS doc_validation_status TEXT DEFAULT 'PENDING' CHECK (doc_validation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'INCOMPLETE'));

-- 2. Create interactions table
CREATE TABLE IF NOT EXISTS public.indicacao_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    indicacao_id UUID NOT NULL REFERENCES public.indicacoes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('COMMENT', 'STATUS_CHANGE', 'DOC_REQUEST', 'DOC_APPROVAL')),
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.indicacao_interactions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Policy: Users see interactions for leads they own
CREATE POLICY "Users view interactions for own leads"
ON public.indicacao_interactions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.indicacoes
        WHERE id = indicacao_interactions.indicacao_id
        AND user_id = auth.uid()
    )
    OR
    (auth.uid() = user_id) -- Or if they wrote the interaction (redundant usually but safe)
);

-- Policy: Admins/Support see all interactions
CREATE POLICY "Admins/Support view all interactions"
ON public.indicacao_interactions
FOR SELECT
USING (
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

-- Policy: Insert
-- Users can insert comments on their leads. Admins/Support on any.
CREATE POLICY "Users insert interactions on own leads"
ON public.indicacao_interactions
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.indicacoes
        WHERE id = indicacao_id
        AND user_id = auth.uid()
    )
    OR
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

-- 5. Grant Permissions
GRANT ALL ON public.indicacao_interactions TO authenticated;

COMMIT;
