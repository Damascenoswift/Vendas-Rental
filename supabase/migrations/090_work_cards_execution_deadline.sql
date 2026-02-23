-- Adds execution deadline fields for work cards in business days.
ALTER TABLE public.obra_cards
    ADD COLUMN IF NOT EXISTS execution_deadline_business_days INTEGER,
    ADD COLUMN IF NOT EXISTS execution_deadline_at TIMESTAMPTZ;

ALTER TABLE public.obra_cards
    DROP CONSTRAINT IF EXISTS obra_cards_execution_deadline_business_days_check;

ALTER TABLE public.obra_cards
    ADD CONSTRAINT obra_cards_execution_deadline_business_days_check
        CHECK (
            execution_deadline_business_days IS NULL
            OR execution_deadline_business_days > 0
        );

CREATE INDEX IF NOT EXISTS idx_obra_cards_execution_deadline_at
    ON public.obra_cards (execution_deadline_at);
