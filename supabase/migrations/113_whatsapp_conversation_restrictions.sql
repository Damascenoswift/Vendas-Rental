BEGIN;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_access (
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_conversation_access_user_idx
  ON public.whatsapp_conversation_access (user_id, conversation_id);

ALTER TABLE public.whatsapp_conversation_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_whatsapp_restriction_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('adm_mestre', 'adm_dorata')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_whatsapp_restriction_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_whatsapp_restriction_admin() TO service_role;

CREATE OR REPLACE FUNCTION public.can_view_whatsapp_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = p_conversation_id
      AND (
        COALESCE(c.is_restricted, false) = false
        OR public.is_whatsapp_restriction_admin()
        OR c.assigned_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.whatsapp_conversation_access a
          WHERE a.conversation_id = c.id
            AND a.user_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_whatsapp_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_whatsapp_conversation(uuid) TO service_role;

DROP POLICY IF EXISTS "WhatsApp inbox access conversations" ON public.whatsapp_conversations;
CREATE POLICY "WhatsApp inbox access conversations"
ON public.whatsapp_conversations
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND public.can_view_whatsapp_conversation(id)
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND (
    public.is_whatsapp_restriction_admin()
    OR COALESCE(is_restricted, false) = false
  )
);

DROP POLICY IF EXISTS "WhatsApp inbox access messages" ON public.whatsapp_messages;
CREATE POLICY "WhatsApp inbox access messages"
ON public.whatsapp_messages
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
);

DROP POLICY IF EXISTS "WhatsApp inbox access events" ON public.whatsapp_conversation_events;
CREATE POLICY "WhatsApp inbox access events"
ON public.whatsapp_conversation_events
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_events.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_events.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
);

GRANT ALL ON TABLE public.whatsapp_conversation_access TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversation_access TO service_role;

DROP POLICY IF EXISTS "WhatsApp access list admin full" ON public.whatsapp_conversation_access;
CREATE POLICY "WhatsApp access list admin full"
ON public.whatsapp_conversation_access
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND public.is_whatsapp_restriction_admin()
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND public.is_whatsapp_restriction_admin()
);

DROP POLICY IF EXISTS "WhatsApp access list user read own" ON public.whatsapp_conversation_access;
CREATE POLICY "WhatsApp access list user read own"
ON public.whatsapp_conversation_access
FOR SELECT
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND user_id = auth.uid()
  AND public.can_view_whatsapp_conversation(conversation_id)
);

NOTIFY pgrst, 'reload schema';

COMMIT;
