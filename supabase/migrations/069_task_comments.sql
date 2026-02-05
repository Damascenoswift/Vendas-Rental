-- Migration 069: Task comments
-- Description: Adds comment history for tasks with reply support.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES public.task_comments(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
ON public.task_comments (task_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_created_at
ON public.task_comments (task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_comments_parent_id
ON public.task_comments (parent_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees View Task Comments" ON public.task_comments;
CREATE POLICY "Employees View Task Comments"
ON public.task_comments
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Create Task Comments" ON public.task_comments;
CREATE POLICY "Employees Create Task Comments"
ON public.task_comments
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Employees Delete Task Comments" ON public.task_comments;
CREATE POLICY "Employees Delete Task Comments"
ON public.task_comments
FOR DELETE
USING (auth.role() = 'authenticated');

GRANT ALL ON public.task_comments TO authenticated;

-- Backfill: move existing task descriptions into comments
INSERT INTO public.task_comments (task_id, user_id, content, created_at)
SELECT t.id, t.creator_id, t.description, t.created_at
FROM public.tasks t
WHERE t.description IS NOT NULL
  AND length(trim(t.description)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_comments tc
    WHERE tc.task_id = t.id
      AND tc.content = t.description
      AND tc.created_at = t.created_at
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
