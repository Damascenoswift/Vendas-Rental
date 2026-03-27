BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_chat_message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.internal_chat_messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.internal_chat_conversations(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
    retention_policy TEXT NOT NULL DEFAULT 'manual'
        CHECK (retention_policy IN ('manual', 'download_24h', 'download_30d')),
    first_downloaded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT internal_chat_attachment_original_name_not_blank CHECK (length(btrim(original_name)) > 0),
    CONSTRAINT internal_chat_attachment_storage_path_not_blank CHECK (length(btrim(storage_path)) > 0)
);

CREATE INDEX IF NOT EXISTS internal_chat_message_attachments_message_idx
    ON public.internal_chat_message_attachments (message_id, created_at ASC);

CREATE INDEX IF NOT EXISTS internal_chat_message_attachments_conversation_idx
    ON public.internal_chat_message_attachments (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_chat_message_attachments_expires_idx
    ON public.internal_chat_message_attachments (expires_at)
    WHERE expires_at IS NOT NULL;

ALTER TABLE public.internal_chat_message_attachments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.internal_chat_message_attachments TO authenticated;
GRANT ALL ON TABLE public.internal_chat_message_attachments TO service_role;

DROP POLICY IF EXISTS "Internal chat participants view attachments" ON public.internal_chat_message_attachments;
CREATE POLICY "Internal chat participants view attachments"
ON public.internal_chat_message_attachments
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat participants insert attachments" ON public.internal_chat_message_attachments;
CREATE POLICY "Internal chat participants insert attachments"
ON public.internal_chat_message_attachments
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND uploaded_by_user_id = auth.uid()
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat participants update attachments" ON public.internal_chat_message_attachments;
CREATE POLICY "Internal chat participants update attachments"
ON public.internal_chat_message_attachments
FOR UPDATE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
)
WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Internal chat participants delete attachments" ON public.internal_chat_message_attachments;
CREATE POLICY "Internal chat participants delete attachments"
ON public.internal_chat_message_attachments
FOR DELETE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND public.is_internal_chat_participant(conversation_id, auth.uid())
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'internal-chat-attachments',
    'internal-chat-attachments',
    false,
    104857600,
    NULL
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Internal Chat Attachments Select" ON storage.objects;
DROP POLICY IF EXISTS "Internal Chat Attachments Insert" ON storage.objects;
DROP POLICY IF EXISTS "Internal Chat Attachments Update" ON storage.objects;
DROP POLICY IF EXISTS "Internal Chat Attachments Delete" ON storage.objects;

CREATE POLICY "Internal Chat Attachments Select"
ON storage.objects
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'internal-chat-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_internal_chat_participant(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Internal Chat Attachments Insert"
ON storage.objects
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'internal-chat-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_internal_chat_participant(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Internal Chat Attachments Update"
ON storage.objects
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'internal-chat-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_internal_chat_participant(split_part(name, '/', 1)::uuid, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'internal-chat-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_internal_chat_participant(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Internal Chat Attachments Delete"
ON storage.objects
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'internal-chat-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_internal_chat_participant(split_part(name, '/', 1)::uuid, auth.uid())
);

NOTIFY pgrst, 'reload schema';

COMMIT;
