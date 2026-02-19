BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct')),
    direct_user_a_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    direct_user_b_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT internal_chat_conversations_distinct_users
        CHECK (direct_user_a_id <> direct_user_b_id),
    CONSTRAINT internal_chat_conversations_direct_pair_order
        CHECK (direct_user_a_id < direct_user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS internal_chat_conversations_direct_pair_unique_idx
    ON public.internal_chat_conversations (direct_user_a_id, direct_user_b_id);

CREATE INDEX IF NOT EXISTS internal_chat_conversations_last_message_idx
    ON public.internal_chat_conversations (last_message_at DESC);

DROP TRIGGER IF EXISTS update_internal_chat_conversations_modtime ON public.internal_chat_conversations;
CREATE TRIGGER update_internal_chat_conversations_modtime
    BEFORE UPDATE ON public.internal_chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.internal_chat_participants (
    conversation_id UUID NOT NULL REFERENCES public.internal_chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
    last_read_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS internal_chat_participants_user_idx
    ON public.internal_chat_participants (user_id);

CREATE INDEX IF NOT EXISTS internal_chat_participants_user_unread_idx
    ON public.internal_chat_participants (user_id, unread_count DESC);

CREATE TABLE IF NOT EXISTS public.internal_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.internal_chat_conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT internal_chat_messages_body_not_empty CHECK (length(btrim(body)) > 0),
    CONSTRAINT internal_chat_messages_body_max_len CHECK (char_length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS internal_chat_messages_conversation_created_desc_idx
    ON public.internal_chat_messages (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.internal_chat_normalize_direct_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    swap_user_id UUID;
BEGIN
    NEW.kind := 'direct';

    IF NEW.direct_user_a_id IS NULL OR NEW.direct_user_b_id IS NULL THEN
        RAISE EXCEPTION 'Conversa direta exige dois usuarios validos';
    END IF;

    IF NEW.direct_user_a_id = NEW.direct_user_b_id THEN
        RAISE EXCEPTION 'Conversa direta exige usuarios distintos';
    END IF;

    IF NEW.direct_user_a_id > NEW.direct_user_b_id THEN
        swap_user_id := NEW.direct_user_a_id;
        NEW.direct_user_a_id := NEW.direct_user_b_id;
        NEW.direct_user_b_id := swap_user_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_chat_normalize_direct_pair_trigger ON public.internal_chat_conversations;
CREATE TRIGGER internal_chat_normalize_direct_pair_trigger
    BEFORE INSERT OR UPDATE OF kind, direct_user_a_id, direct_user_b_id
    ON public.internal_chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.internal_chat_normalize_direct_pair();

CREATE OR REPLACE FUNCTION public.internal_chat_seed_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.internal_chat_participants (conversation_id, user_id, unread_count, last_read_at, joined_at)
    VALUES
        (NEW.id, NEW.direct_user_a_id, 0, now(), now()),
        (NEW.id, NEW.direct_user_b_id, 0, now(), now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_chat_seed_participants_trigger ON public.internal_chat_conversations;
CREATE TRIGGER internal_chat_seed_participants_trigger
    AFTER INSERT ON public.internal_chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.internal_chat_seed_participants();

CREATE OR REPLACE FUNCTION public.internal_chat_after_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.internal_chat_conversations
    SET
        last_message_at = NEW.created_at,
        updated_at = now()
    WHERE id = NEW.conversation_id;

    UPDATE public.internal_chat_participants
    SET
        unread_count = CASE
            WHEN user_id = NEW.sender_user_id THEN 0
            ELSE unread_count + 1
        END,
        last_read_at = CASE
            WHEN user_id = NEW.sender_user_id THEN NEW.created_at
            ELSE last_read_at
        END
    WHERE conversation_id = NEW.conversation_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_chat_after_message_insert_trigger ON public.internal_chat_messages;
CREATE TRIGGER internal_chat_after_message_insert_trigger
    AFTER INSERT ON public.internal_chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.internal_chat_after_message_insert();

CREATE OR REPLACE FUNCTION public.is_internal_chat_participant(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.internal_chat_participants p
        WHERE p.conversation_id = p_conversation_id
          AND p.user_id = p_user_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_internal_chat_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_chat_participant(UUID, UUID) TO service_role;

ALTER TABLE public.internal_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.internal_chat_conversations TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.internal_chat_participants TO authenticated;
GRANT SELECT, INSERT ON TABLE public.internal_chat_messages TO authenticated;

GRANT ALL ON TABLE public.internal_chat_conversations TO service_role;
GRANT ALL ON TABLE public.internal_chat_participants TO service_role;
GRANT ALL ON TABLE public.internal_chat_messages TO service_role;

DROP POLICY IF EXISTS "Internal chat participants view conversations" ON public.internal_chat_conversations;
CREATE POLICY "Internal chat participants view conversations"
ON public.internal_chat_conversations
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat create direct conversations" ON public.internal_chat_conversations;
CREATE POLICY "Internal chat create direct conversations"
ON public.internal_chat_conversations
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND kind = 'direct'
    AND auth.uid() IN (direct_user_a_id, direct_user_b_id)
    AND direct_user_a_id <> direct_user_b_id
    AND direct_user_a_id < direct_user_b_id
);

DROP POLICY IF EXISTS "Internal chat participants view participant rows" ON public.internal_chat_participants;
CREATE POLICY "Internal chat participants view participant rows"
ON public.internal_chat_participants
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat user updates own participant row" ON public.internal_chat_participants;
CREATE POLICY "Internal chat user updates own participant row"
ON public.internal_chat_participants
FOR UPDATE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
)
WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Internal chat participants view messages" ON public.internal_chat_messages;
CREATE POLICY "Internal chat participants view messages"
ON public.internal_chat_messages
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat participants insert own messages" ON public.internal_chat_messages;
CREATE POLICY "Internal chat participants insert own messages"
ON public.internal_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_user_id = auth.uid()
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'internal_chat_conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_chat_conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'internal_chat_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_chat_participants;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'internal_chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_chat_messages;
    END IF;
END;
$$;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check CHECK (
        type IN (
            'TASK_COMMENT',
            'TASK_MENTION',
            'TASK_REPLY',
            'TASK_SYSTEM',
            'INTERNAL_CHAT_MESSAGE'
        )
    );

CREATE INDEX IF NOT EXISTS idx_notifications_chat_conversation
    ON public.notifications ((metadata->>'conversation_id'))
    WHERE type = 'INTERNAL_CHAT_MESSAGE';

NOTIFY pgrst, 'reload schema';

COMMIT;
