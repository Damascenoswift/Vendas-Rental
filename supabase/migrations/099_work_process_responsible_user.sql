BEGIN;

ALTER TABLE public.obra_process_items
    ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obra_process_items_responsible_user_id
    ON public.obra_process_items (responsible_user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
