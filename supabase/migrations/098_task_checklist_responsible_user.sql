BEGIN;

ALTER TABLE public.task_checklists
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_checklists_responsible_user_id
    ON public.task_checklists (responsible_user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
