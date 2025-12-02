-- Migração: Corrigir relacionamento entre indicacoes e users
-- Data: 2025-02-xx
-- Objetivo: Permitir join entre indicacoes e public.users no PostgREST

-- 1. Tentar remover a constraint antiga (se existir e apontar para auth.users ou estiver errada)
-- O nome padrão costuma ser indicacoes_user_id_fkey
ALTER TABLE public.indicacoes
  DROP CONSTRAINT IF EXISTS indicacoes_user_id_fkey;

-- 2. Adicionar a constraint correta apontando para public.users
ALTER TABLE public.indicacoes
  ADD CONSTRAINT indicacoes_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE;

-- 3. Comentário para documentação
COMMENT ON CONSTRAINT indicacoes_user_id_fkey ON public.indicacoes IS 'Relacionamento com public.users para permitir joins na API';
