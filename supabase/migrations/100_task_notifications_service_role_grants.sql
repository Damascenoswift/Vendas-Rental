BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

-- Required by notification dispatcher when resolving task recipients/events.
GRANT ALL ON TABLE public.tasks TO service_role;
GRANT ALL ON TABLE public.task_observers TO service_role;
GRANT ALL ON TABLE public.task_checklists TO service_role;
GRANT ALL ON TABLE public.task_comments TO service_role;

-- Allow adm_mestre (authenticated + RLS policy) to manage default rules from UI.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_default_rules TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
