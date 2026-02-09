-- Migration 071: Task visibility scope (team vs restricted) + RLS alignment
-- Description: Allows creating restricted tasks visible only to assignee/observers/creator.

BEGIN;

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'TEAM';

ALTER TABLE public.tasks
    DROP CONSTRAINT IF EXISTS tasks_visibility_scope_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_visibility_scope_check
    CHECK (visibility_scope IN ('TEAM', 'RESTRICTED'));

CREATE INDEX IF NOT EXISTS idx_tasks_visibility_scope
ON public.tasks (visibility_scope);

CREATE OR REPLACE FUNCTION public.is_task_observer(
    p_task_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.task_observers o
        WHERE o.task_id = p_task_id
          AND o.user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.is_task_observer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_task_observer(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_task(
    p_task_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = p_task_id
          AND (
              COALESCE(t.visibility_scope, 'TEAM') = 'TEAM'
              OR t.assignee_id = p_user_id
              OR t.creator_id = p_user_id
              OR public.is_task_observer(t.id, p_user_id)
          )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_task(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_task(UUID, UUID) TO authenticated;

-- Tasks policies
DROP POLICY IF EXISTS "Employees View All Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees Create Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees Update Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins Delete Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins Full Access Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users View Own Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users Update Assigned Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users Create Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees View Tasks By Visibility" ON public.tasks;
DROP POLICY IF EXISTS "Employees Update Tasks By Visibility" ON public.tasks;

CREATE POLICY "Employees View Tasks By Visibility"
ON public.tasks
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND (
        COALESCE(visibility_scope, 'TEAM') = 'TEAM'
        OR assignee_id = auth.uid()
        OR creator_id = auth.uid()
        OR public.is_task_observer(id, auth.uid())
    )
);

CREATE POLICY "Employees Create Tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND creator_id = auth.uid()
    AND visibility_scope IN ('TEAM', 'RESTRICTED')
);

CREATE POLICY "Employees Update Tasks By Visibility"
ON public.tasks
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(id, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND public.can_access_task(id, auth.uid())
);

CREATE POLICY "Admins Delete Tasks"
ON public.tasks
FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN ('adm_mestre', 'adm_dorata', 'supervisor')
    )
);

-- Task observers policies
DROP POLICY IF EXISTS "Employees View Task Observers" ON public.task_observers;
DROP POLICY IF EXISTS "Employees Create Task Observers" ON public.task_observers;
DROP POLICY IF EXISTS "Employees Delete Task Observers" ON public.task_observers;
DROP POLICY IF EXISTS "Employees View Task Observers By Visibility" ON public.task_observers;
DROP POLICY IF EXISTS "Employees Create Task Observers By Visibility" ON public.task_observers;
DROP POLICY IF EXISTS "Employees Delete Task Observers By Visibility" ON public.task_observers;

CREATE POLICY "Employees View Task Observers By Visibility"
ON public.task_observers
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Create Task Observers By Visibility"
ON public.task_observers
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Delete Task Observers By Visibility"
ON public.task_observers
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

-- Task checklists policies
DROP POLICY IF EXISTS "Employees View Task Checklists" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Create Task Checklists" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Update Task Checklists" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Delete Task Checklists" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees View Task Checklists By Visibility" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Create Task Checklists By Visibility" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Update Task Checklists By Visibility" ON public.task_checklists;
DROP POLICY IF EXISTS "Employees Delete Task Checklists By Visibility" ON public.task_checklists;

CREATE POLICY "Employees View Task Checklists By Visibility"
ON public.task_checklists
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Create Task Checklists By Visibility"
ON public.task_checklists
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Update Task Checklists By Visibility"
ON public.task_checklists
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Delete Task Checklists By Visibility"
ON public.task_checklists
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

-- Task comments policies
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
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Create Task Comments By Visibility"
ON public.task_comments
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

CREATE POLICY "Employees Delete Task Comments By Visibility"
ON public.task_comments
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

NOTIFY pgrst, 'reload schema';

COMMIT;
