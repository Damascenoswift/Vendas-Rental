BEGIN;

UPDATE public.task_analyst_config
SET
    history_window_days = 90,
    base_reminder_hours = 24,
    base_escalation_hours = 72,
    slow_sector_hours = 48,
    feedback_required_days = 5,
    feedback_escalation_days = 1,
    updated_at = now()
WHERE id = 1;

UPDATE public.task_analyst_department_thresholds
SET
    reminder_hours = 24,
    escalation_hours = 72,
    slow_hours = 48,
    source = 'manual',
    updated_at = now()
WHERE department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro');

NOTIFY pgrst, 'reload schema';

COMMIT;
