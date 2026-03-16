-- Migration 106: Restore creator visibility on restricted tasks
-- Description: Ensures task creator can view/update restricted tasks they created.

BEGIN;

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
              OR t.creator_id = p_user_id
              OR public.is_task_observer(t.id, p_user_id)
          )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_task(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_task(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
