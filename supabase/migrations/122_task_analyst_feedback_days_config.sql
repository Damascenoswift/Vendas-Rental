BEGIN;

ALTER TABLE public.task_analyst_config
    ADD COLUMN IF NOT EXISTS feedback_required_days INTEGER NOT NULL DEFAULT 5 CHECK (feedback_required_days BETWEEN 1 AND 30),
    ADD COLUMN IF NOT EXISTS feedback_escalation_days INTEGER NOT NULL DEFAULT 1 CHECK (feedback_escalation_days BETWEEN 1 AND 14);

UPDATE public.task_analyst_config
SET
    feedback_required_days = COALESCE(feedback_required_days, 5),
    feedback_escalation_days = COALESCE(feedback_escalation_days, 1),
    updated_at = now()
WHERE id = 1;

NOTIFY pgrst, 'reload schema';

COMMIT;
