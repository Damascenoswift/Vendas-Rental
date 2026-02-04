BEGIN;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
ON public.tasks (assignee_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_completed_at
ON public.tasks (assignee_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status
ON public.tasks (due_date, status);

-- Backfill for historical tasks already marked as done
UPDATE public.tasks
SET
  completed_at = COALESCE(completed_at, updated_at),
  completed_by = COALESCE(completed_by, assignee_id, creator_id)
WHERE status = 'DONE';

NOTIFY pgrst, 'reload schema';

COMMIT;
