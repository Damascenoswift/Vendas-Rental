-- Migration 054: Add codigo_instalacao to indicacoes and energia_ucs
-- Description: Stores the stable installation code from the energy bill.

BEGIN;

ALTER TABLE public.indicacoes
ADD COLUMN IF NOT EXISTS codigo_instalacao TEXT;

ALTER TABLE public.energia_ucs
ADD COLUMN IF NOT EXISTS codigo_instalacao TEXT;

CREATE INDEX IF NOT EXISTS idx_indicacoes_codigo_instalacao
ON public.indicacoes (codigo_instalacao);

CREATE INDEX IF NOT EXISTS idx_energia_ucs_codigo_instalacao
ON public.energia_ucs (codigo_instalacao);

-- Backfill UC installation code when possible
UPDATE public.energia_ucs u
SET codigo_instalacao = i.codigo_instalacao
FROM public.indicacoes i
WHERE u.cliente_id = i.id
  AND u.codigo_instalacao IS NULL
  AND i.codigo_instalacao IS NOT NULL;

COMMIT;
