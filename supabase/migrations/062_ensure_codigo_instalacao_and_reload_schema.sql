BEGIN;

ALTER TABLE public.indicacoes
ADD COLUMN IF NOT EXISTS codigo_instalacao TEXT;

ALTER TABLE public.energia_ucs
ADD COLUMN IF NOT EXISTS codigo_instalacao TEXT;

CREATE INDEX IF NOT EXISTS idx_indicacoes_codigo_instalacao
ON public.indicacoes (codigo_instalacao);

CREATE INDEX IF NOT EXISTS idx_energia_ucs_codigo_instalacao
ON public.energia_ucs (codigo_instalacao);

NOTIFY pgrst, 'reload schema';

COMMIT;
