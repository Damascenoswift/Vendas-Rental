-- Add 'valor' column to 'indicacoes' table
ALTER TABLE public.indicacoes
ADD COLUMN valor numeric(10, 2);

-- Comment on column
COMMENT ON COLUMN public.indicacoes.valor IS 'Valor compensado da indicação em Reais (R$)';
