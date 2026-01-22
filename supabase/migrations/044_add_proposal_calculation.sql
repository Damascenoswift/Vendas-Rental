BEGIN;

ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS calculation jsonb;

COMMIT;
