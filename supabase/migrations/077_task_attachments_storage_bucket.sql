-- Migration 077: Task PDF attachments storage bucket and policies
-- Description: Adds private task attachments bucket and grants access by task visibility.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'task-attachments',
    'task-attachments',
    false,
    10485760,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Task Attachments Select By Task Access" ON storage.objects;
DROP POLICY IF EXISTS "Task Attachments Insert By Task Access" ON storage.objects;
DROP POLICY IF EXISTS "Task Attachments Update By Task Access" ON storage.objects;
DROP POLICY IF EXISTS "Task Attachments Delete By Task Access" ON storage.objects;

CREATE POLICY "Task Attachments Select By Task Access"
ON storage.objects
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'task-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_task(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Task Attachments Insert By Task Access"
ON storage.objects
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'task-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
        public.can_access_task(split_part(name, '/', 1)::uuid, auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = split_part(name, '/', 1)::uuid
              AND t.creator_id = auth.uid()
        )
    )
);

CREATE POLICY "Task Attachments Update By Task Access"
ON storage.objects
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'task-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
        public.can_access_task(split_part(name, '/', 1)::uuid, auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = split_part(name, '/', 1)::uuid
              AND t.creator_id = auth.uid()
        )
    )
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'task-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
        public.can_access_task(split_part(name, '/', 1)::uuid, auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.tasks t
            WHERE t.id = split_part(name, '/', 1)::uuid
              AND t.creator_id = auth.uid()
        )
    )
);

CREATE POLICY "Task Attachments Delete By Task Access"
ON storage.objects
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'task-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_task(split_part(name, '/', 1)::uuid, auth.uid())
);

COMMIT;
