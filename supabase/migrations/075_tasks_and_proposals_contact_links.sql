-- Migration 075: Link tasks/proposals to contacts and proposals
-- Description: Adds explicit relational links to support 360 client view (contacts, tasks, CRM, budgets).

BEGIN;

ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_contact_id
ON public.proposals (contact_id);

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_contact_id
ON public.tasks (contact_id);

CREATE INDEX IF NOT EXISTS idx_tasks_proposal_id
ON public.tasks (proposal_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
