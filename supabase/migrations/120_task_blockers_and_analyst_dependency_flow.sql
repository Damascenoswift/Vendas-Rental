BEGIN;

CREATE TABLE IF NOT EXISTS public.task_blockers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'CANCELED')),
    owner_type TEXT NOT NULL CHECK (owner_type IN ('USER', 'DEPARTMENT')),
    owner_user_id UUID REFERENCES public.users(id),
    owner_department TEXT CHECK (owner_department IN ('vendas', 'cadastro', 'energia', 'juridico', 'financeiro', 'ti', 'diretoria', 'obras', 'outro')),
    reason TEXT NOT NULL,
    expected_unblock_at TIMESTAMPTZ NOT NULL,
    opened_by_user_id UUID NOT NULL REFERENCES public.users(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT task_blockers_owner_target_xor CHECK (
        (
            owner_type = 'USER'
            AND owner_user_id IS NOT NULL
            AND owner_department IS NULL
        )
        OR (
            owner_type = 'DEPARTMENT'
            AND owner_user_id IS NULL
            AND owner_department IS NOT NULL
        )
    ),
    CONSTRAINT task_blockers_reason_not_blank CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_task_blockers_task_status
    ON public.task_blockers (task_id, status);

CREATE INDEX IF NOT EXISTS idx_task_blockers_owner_user_status
    ON public.task_blockers (owner_user_id, status)
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_blockers_owner_department_status
    ON public.task_blockers (owner_department, status)
    WHERE owner_department IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_blockers_opened_at
    ON public.task_blockers (opened_at DESC);

DROP TRIGGER IF EXISTS update_task_blockers_modtime ON public.task_blockers;
CREATE TRIGGER update_task_blockers_modtime
    BEFORE UPDATE ON public.task_blockers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.task_blockers TO authenticated;
GRANT ALL ON TABLE public.task_blockers TO service_role;

DROP POLICY IF EXISTS "Task blockers select by task visibility" ON public.task_blockers;
CREATE POLICY "Task blockers select by task visibility"
ON public.task_blockers
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.can_access_task(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Task blockers insert by task visibility" ON public.task_blockers;
CREATE POLICY "Task blockers insert by task visibility"
ON public.task_blockers
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND opened_by_user_id = auth.uid()
    AND public.can_access_task(task_id, auth.uid())
);

DROP POLICY IF EXISTS "Task blockers update by ownership" ON public.task_blockers;
CREATE POLICY "Task blockers update by ownership"
ON public.task_blockers
FOR UPDATE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.can_access_task(task_id, auth.uid())
    AND (
        public.is_task_master(auth.uid())
        OR (owner_type = 'USER' AND owner_user_id = auth.uid())
        OR (
            owner_type = 'DEPARTMENT'
            AND EXISTS (
                SELECT 1
                FROM public.users u
                WHERE u.id = auth.uid()
                  AND (
                      u.role = 'adm_mestre'
                      OR (
                          u.role = 'supervisor'
                          AND lower(COALESCE(u.department::text, '')) = owner_department
                      )
                  )
            )
        )
    )
)
WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_access_task(task_id, auth.uid())
    AND (
        public.is_task_master(auth.uid())
        OR (owner_type = 'USER' AND owner_user_id = auth.uid())
        OR (
            owner_type = 'DEPARTMENT'
            AND EXISTS (
                SELECT 1
                FROM public.users u
                WHERE u.id = auth.uid()
                  AND (
                      u.role = 'adm_mestre'
                      OR (
                          u.role = 'supervisor'
                          AND lower(COALESCE(u.department::text, '')) = owner_department
                      )
                  )
            )
        )
    )
);

DO $$
BEGIN
    IF to_regclass('public.task_activity_events') IS NOT NULL THEN
        ALTER TABLE public.task_activity_events
            DROP CONSTRAINT IF EXISTS task_activity_events_event_type_check;

        ALTER TABLE public.task_activity_events
            ADD CONSTRAINT task_activity_events_event_type_check
            CHECK (
                event_type IN (
                    'TASK_CREATED',
                    'TASK_STATUS_CHANGED',
                    'TASK_ASSIGNEE_CHANGED',
                    'TASK_ASSIGNEE_TRANSFERRED',
                    'TASK_CHECKLIST_CREATED',
                    'TASK_CHECKLIST_DECISION_CHANGED',
                    'TASK_COMMENT_CREATED',
                    'TASK_BLOCKER_OPENED',
                    'TASK_BLOCKER_RESOLVED'
                )
            );
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.task_analyst_message_log') IS NOT NULL THEN
        ALTER TABLE public.task_analyst_message_log
            DROP CONSTRAINT IF EXISTS task_analyst_message_log_kind_check;

        ALTER TABLE public.task_analyst_message_log
            ADD CONSTRAINT task_analyst_message_log_kind_check
            CHECK (kind IN ('REMINDER', 'ESCALATION', 'MANAGER_DIGEST', 'UNASSIGNED_ALERT', 'BLOCKER_REMINDER'));
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
