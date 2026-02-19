BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL,
    actor_user_id UUID,
    task_id UUID,
    task_comment_id UUID,
    type TEXT NOT NULL CHECK (type IN ('TASK_COMMENT', 'TASK_MENTION', 'TASK_REPLY', 'TASK_SYSTEM')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_recipient_user_id_fkey
        FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT notifications_actor_user_id_fkey
        FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT notifications_task_id_fkey
        FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL,
    CONSTRAINT notifications_task_comment_id_fkey
        FOREIGN KEY (task_comment_id) REFERENCES public.task_comments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON public.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON public.notifications (recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_task_id
    ON public.notifications (task_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_unique_recipient_comment_idx
    ON public.notifications (recipient_user_id, task_comment_id)
    WHERE task_comment_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_notifications_modtime ON public.notifications;
CREATE TRIGGER update_notifications_modtime
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO service_role;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
ON public.notifications
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND recipient_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
ON public.notifications
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND recipient_user_id = auth.uid()
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND recipient_user_id = auth.uid()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
