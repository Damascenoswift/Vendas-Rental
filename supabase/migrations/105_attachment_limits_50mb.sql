BEGIN;

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id IN ('task-attachments', 'obra-comment-attachments');

COMMIT;
