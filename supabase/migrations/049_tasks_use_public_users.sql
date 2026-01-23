-- Migration 049: Point tasks user FKs to public.users (allow SQL-only users + proper joins)

BEGIN;

ALTER TABLE IF EXISTS public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE IF EXISTS public.tasks
  ADD CONSTRAINT tasks_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.tasks
  DROP CONSTRAINT IF EXISTS tasks_creator_id_fkey;
ALTER TABLE IF EXISTS public.tasks
  ADD CONSTRAINT tasks_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
