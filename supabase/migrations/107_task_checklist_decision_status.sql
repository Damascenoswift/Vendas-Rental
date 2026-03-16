BEGIN;

ALTER TABLE public.task_checklists
    ADD COLUMN IF NOT EXISTS decision_status TEXT;

ALTER TABLE public.task_checklists
    DROP CONSTRAINT IF EXISTS task_checklists_decision_status_check;

ALTER TABLE public.task_checklists
    ADD CONSTRAINT task_checklists_decision_status_check
    CHECK (
        decision_status IS NULL
        OR decision_status IN ('IN_REVIEW', 'APPROVED', 'REJECTED')
    );

UPDATE public.task_checklists
SET decision_status = CASE
    WHEN is_done THEN 'APPROVED'
    ELSE 'IN_REVIEW'
END
WHERE decision_status IS NULL;

ALTER TABLE public.task_checklists
    ALTER COLUMN decision_status SET DEFAULT 'IN_REVIEW';

CREATE INDEX IF NOT EXISTS idx_task_checklists_decision_status
    ON public.task_checklists (task_id, decision_status);

NOTIFY pgrst, 'reload schema';

COMMIT;
