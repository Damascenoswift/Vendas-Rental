BEGIN;

INSERT INTO public.task_observers (task_id, user_id)
SELECT DISTINCT tc.task_id, tc.responsible_user_id
FROM public.task_checklists tc
WHERE tc.responsible_user_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
