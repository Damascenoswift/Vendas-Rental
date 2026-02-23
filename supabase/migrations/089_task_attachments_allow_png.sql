-- Migration 089: Allow PNG task attachments
-- Description: Expands task-attachments bucket to accept PDF and PNG files.

BEGIN;

UPDATE storage.buckets
SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/png']
WHERE id = 'task-attachments';

COMMIT;
