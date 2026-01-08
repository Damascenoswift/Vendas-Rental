-- Migration 024: Create Tasks Table for Kanban Dashboard
-- Description: Adds a centralized tasks table to manage workflow items and ad-hoc todos.

BEGIN;

-- 1. Create Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    due_date TIMESTAMPTZ,
    
    -- Foreign Keys
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    indicacao_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL, -- Optional link to a Lead
    
    -- Metadata
    client_name TEXT, -- Denormalized for quick access or for ad-hoc tasks without lead
    department TEXT CHECK (department IN ('VENDAS', 'CADASTRO', 'ENERGIA', 'JURIDICO', 'FINANCEIRO', 'OUTRO')),
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Admins/Support full access
CREATE POLICY "Admins Full Access Tasks"
ON public.tasks
FOR ALL
USING (
    auth.uid() IN (
        SELECT id FROM public.users 
        WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'supervisor')
    )
);

-- Users can see tasks assigned to them OR created by them
CREATE POLICY "Users View Own Tasks"
ON public.tasks
FOR SELECT
USING (
    assignee_id = auth.uid() OR creator_id = auth.uid()
);

-- Users can update tasks assigned to them (e.g. move status)
CREATE POLICY "Users Update Assigned Tasks"
ON public.tasks
FOR UPDATE
USING (
    assignee_id = auth.uid() OR creator_id = auth.uid()
)
WITH CHECK (
    assignee_id = auth.uid() OR creator_id = auth.uid()
);

-- Users can insert tasks (create)
CREATE POLICY "Users Create Tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
    auth.uid() = creator_id
);

-- 4. Triggers for updated_at
CREATE TRIGGER update_tasks_modtime
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Grant Permissions
GRANT ALL ON public.tasks TO authenticated;

COMMIT;
