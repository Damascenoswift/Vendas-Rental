-- Migração: Adicionar coluna marca à tabela indicacoes
-- Data: 2025-01-23
-- Descrição: Implementa sistema de marcas (rental/dorata) para indicações

-- 1. Adicionar coluna marca com constraint e valor padrão
ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS marca text
    CHECK (marca IN ('rental', 'dorata'))
    DEFAULT 'rental';

-- 2. Comentário para documentação
COMMENT ON COLUMN public.indicacoes.marca IS 'Marca da indicação: rental ou dorata';

-- 3. Criar índice para melhor performance nas consultas por marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_marca ON public.indicacoes(marca);

-- 4. Criar índice composto para consultas por usuário e marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_user_marca ON public.indicacoes(user_id, marca);
