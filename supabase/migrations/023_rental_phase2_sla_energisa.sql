-- Migration 023: Rental Workflow Phase 2 - SLA & Energisa
-- Description: Adds SLA tracking columns and a dedicated table for Energisa process logs.

BEGIN;

-- 1. Add SLA columns to indicacoes
ALTER TABLE public.indicacoes
ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_status TEXT CHECK (sla_status IN ('ON_TIME', 'WARNING', 'OVERDUE'));

-- 2. Create Energisa Logs table
CREATE TABLE IF NOT EXISTS public.energisa_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    indicacao_id UUID NOT NULL REFERENCES public.indicacoes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- e.g., 'DOC_SUBMITTED', 'REJECTION', 'TRANSFER_SUCCESS'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Enable RLS
ALTER TABLE public.energisa_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Admins/Support full access
CREATE POLICY "Admins/Support Full Access Energisa"
ON public.energisa_logs
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
)
WITH CHECK (
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
    )
);

-- Users (Sales) Read-Only access (Transparency)
CREATE POLICY "Users Read Own Energisa Logs"
ON public.energisa_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.indicacoes
        WHERE id = energisa_logs.indicacao_id
        AND user_id = auth.uid()
    )
);

-- 5. Grant Permissions
GRANT ALL ON public.energisa_logs TO authenticated;

COMMIT;
