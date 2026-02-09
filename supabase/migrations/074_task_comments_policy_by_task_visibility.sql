-- Migration 074: Align task_comments RLS with effective task visibility
-- Description: Prevents insert failures when user can view a task but can_access_task() is out of sync.

BEGIN;

GRANT SELECT, INSERT, DELETE ON TABLE public.task_comments TO authenticated;

DROP POLICY IF EXISTS "Employees View Task Comments" ON public.task_comments;
DROP POLICY IF EXISTS "Employees Create Task Comments" ON public.task_comments;
DROP POLICY IF EXISTS "Employees Delete Task Comments" ON public.task_comments;
DROP POLICY IF EXISTS "Employees View Task Comments By Visibility" ON public.task_comments;
DROP POLICY IF EXISTS "Employees Create Task Comments By Visibility" ON public.task_comments;
DROP POLICY IF EXISTS "Employees Delete Task Comments By Visibility" ON public.task_comments;

CREATE POLICY "Employees View Task Comments By Visibility"
ON public.task_comments
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_comments.task_id
    )
);

CREATE POLICY "Employees Create Task Comments By Visibility"
ON public.task_comments
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND user_id = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_comments.task_id
    )
);

CREATE POLICY "Employees Delete Task Comments By Visibility"
ON public.task_comments
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_comments.task_id
    )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
