-- Migration 058: Add task checklists and observers
-- Description: Adds checklist items and observer relationships for tasks.

BEGIN;

-- 1) Task checklists
CREATE TABLE IF NOT EXISTS public.task_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_checklists_task_id ON public.task_checklists(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklists_task_done ON public.task_checklists(task_id, is_done);

DROP TRIGGER IF EXISTS update_task_checklists_modtime ON public.task_checklists;
CREATE TRIGGER update_task_checklists_modtime
    BEFORE UPDATE ON public.task_checklists
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees View Task Checklists" ON public.task_checklists;
CREATE POLICY "Employees View Task Checklists"
ON public.task_checklists
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Create Task Checklists" ON public.task_checklists;
CREATE POLICY "Employees Create Task Checklists"
ON public.task_checklists
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Update Task Checklists" ON public.task_checklists;
CREATE POLICY "Employees Update Task Checklists"
ON public.task_checklists
FOR UPDATE
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Delete Task Checklists" ON public.task_checklists;
CREATE POLICY "Employees Delete Task Checklists"
ON public.task_checklists
FOR DELETE
USING (auth.role() = 'authenticated');

GRANT ALL ON public.task_checklists TO authenticated;

-- 2) Task observers
CREATE TABLE IF NOT EXISTS public.task_observers (
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_observers_task_id ON public.task_observers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_observers_user_id ON public.task_observers(user_id);

ALTER TABLE public.task_observers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees View Task Observers" ON public.task_observers;
CREATE POLICY "Employees View Task Observers"
ON public.task_observers
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Create Task Observers" ON public.task_observers;
CREATE POLICY "Employees Create Task Observers"
ON public.task_observers
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Delete Task Observers" ON public.task_observers;
CREATE POLICY "Employees Delete Task Observers"
ON public.task_observers
FOR DELETE
USING (auth.role() = 'authenticated');

GRANT ALL ON public.task_observers TO authenticated;

COMMIT;
