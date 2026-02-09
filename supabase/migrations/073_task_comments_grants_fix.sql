-- Migration 073: Ensure task_comments grants for authenticated users
-- Description: Fixes "permission denied for table task_comments" while preserving visibility RLS.

BEGIN;

GRANT SELECT, INSERT, DELETE ON TABLE public.task_comments TO authenticated;

-- Keep explicit policies aligned with task visibility helper.
DROP POLICY IF EXISTS "Employees View Task Comments By Visibility" ON public.task_comments;
CREATE POLICY "Employees View Task Comments By Visibility"
ON public.task_comments
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Employees Create Task Comments By Visibility" ON public.task_comments;
CREATE POLICY "Employees Create Task Comments By Visibility"
ON public.task_comments
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND user_id = auth.uid()
    AND public.can_access_task(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Employees Delete Task Comments By Visibility" ON public.task_comments;
CREATE POLICY "Employees Delete Task Comments By Visibility"
ON public.task_comments
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

NOTIFY pgrst, 'reload schema';

COMMIT;
