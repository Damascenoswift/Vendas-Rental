BEGIN;

ALTER TABLE public.obra_comments
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.obra_comments
    DROP CONSTRAINT IF EXISTS obra_comments_attachments_is_array;

ALTER TABLE public.obra_comments
    ADD CONSTRAINT obra_comments_attachments_is_array
    CHECK (jsonb_typeof(attachments) = 'array');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'obra-comment-attachments',
    'obra-comment-attachments',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Obra Comment Attachments Select By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Comment Attachments Insert By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Comment Attachments Update By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Comment Attachments Delete By Card Access" ON storage.objects;

CREATE POLICY "Obra Comment Attachments Select By Card Access"
ON storage.objects
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-comment-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Comment Attachments Insert By Card Access"
ON storage.objects
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-comment-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Comment Attachments Update By Card Access"
ON storage.objects
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-comment-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-comment-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Comment Attachments Delete By Card Access"
ON storage.objects
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-comment-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

NOTIFY pgrst, 'reload schema';

COMMIT;
