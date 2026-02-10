-- Migration 076: Strict task visibility and master-only unrestricted access
-- Description: Restricts task visibility to assignee/observers for RESTRICTED tasks and removes legacy bypass policies.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_task_master(
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
        FROM public.users u
        WHERE u.id = p_user_id
          AND u.role = 'adm_mestre'
    );
$$;

REVOKE ALL ON FUNCTION public.is_task_master(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_task_master(UUID) TO authenticated;

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
              public.is_task_master(p_user_id)
              OR COALESCE(t.visibility_scope, 'TEAM') = 'TEAM'
              OR t.assignee_id = p_user_id
              OR public.is_task_observer(t.id, p_user_id)
          )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_task(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_task(UUID, UUID) TO authenticated;

-- Remove legacy full-access bypass for the task module.
DROP POLICY IF EXISTS "Full access for adm_dorata or diretoria" ON public.tasks;
DROP POLICY IF EXISTS "Full access for adm_dorata or diretoria" ON public.task_observers;
DROP POLICY IF EXISTS "Full access for adm_dorata or diretoria" ON public.task_checklists;
DROP POLICY IF EXISTS "Full access for adm_dorata or diretoria" ON public.task_comments;

DROP POLICY IF EXISTS "Funcionario N1 full access" ON public.tasks;
DROP POLICY IF EXISTS "Funcionario N1 full access" ON public.task_observers;
DROP POLICY IF EXISTS "Funcionario N1 full access" ON public.task_checklists;
DROP POLICY IF EXISTS "Funcionario N1 full access" ON public.task_comments;

-- Tasks policies
DROP POLICY IF EXISTS "Master Full Access Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees View Tasks By Visibility" ON public.tasks;
DROP POLICY IF EXISTS "Employees Create Tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees Update Tasks By Visibility" ON public.tasks;

CREATE POLICY "Master Full Access Tasks"
ON public.tasks
FOR ALL
USING (public.is_task_master(auth.uid()))
WITH CHECK (public.is_task_master(auth.uid()));

CREATE POLICY "Employees View Tasks By Visibility"
ON public.tasks
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(id, auth.uid())
);

CREATE POLICY "Employees Create Tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND creator_id = auth.uid()
    AND COALESCE(visibility_scope, 'TEAM') IN ('TEAM', 'RESTRICTED')
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

-- Task observers policies
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
    AND (
        public.can_access_task(task_id, auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = task_observers.task_id
              AND t.creator_id = auth.uid()
        )
    )
);

CREATE POLICY "Employees Delete Task Observers By Visibility"
ON public.task_observers
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND public.can_access_task(task_id, auth.uid())
);

-- Task checklist policies
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
    AND user_id = auth.uid()
    AND (
        public.can_access_task(task_id, auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = task_comments.task_id
              AND t.creator_id = auth.uid()
        )
    )
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
