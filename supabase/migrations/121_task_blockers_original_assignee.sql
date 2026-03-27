BEGIN;

ALTER TABLE public.task_blockers
    ADD COLUMN IF NOT EXISTS original_assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_blockers_original_assignee_status
    ON public.task_blockers (original_assignee_id, status)
    WHERE original_assignee_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
