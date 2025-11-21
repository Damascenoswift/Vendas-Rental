ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS marca text
    CHECK (marca IN ('rental', 'dorata'))
    DEFAULT 'rental';

COMMENT ON COLUMN public.indicacoes.marca IS 'Marca da indicacao: rental ou dorata';

CREATE INDEX IF NOT EXISTS idx_indicacoes_marca ON public.indicacoes(marca);

CREATE INDEX IF NOT EXISTS idx_indicacoes_user_marca ON public.indicacoes(user_id, marca);