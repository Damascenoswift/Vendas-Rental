BEGIN;

ALTER TABLE public.obra_comments
    ADD COLUMN IF NOT EXISTS parent_comment_id UUID
    REFERENCES public.obra_comments(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obra_comments_parent_comment_id
ON public.obra_comments (parent_comment_id);

COMMIT;
