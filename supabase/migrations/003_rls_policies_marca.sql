-- Migração: Policies RLS para sistema de marcas
-- Data: 2025-01-23
-- Descrição: Implementa Row Level Security baseado em usuário e marca autorizada

-- Remover policies existentes se houver conflito
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;

-- Policy para leitura: usuário vê apenas as próprias indicações nas marcas autorizadas
CREATE POLICY "Indicacoes própria + marca"
  ON public.indicacoes
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para inserção: usuário só cadastra indicações nas marcas autorizadas
CREATE POLICY "Inserir indicacao marca permitida"
  ON public.indicacoes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para atualização: usuário só atualiza próprias indicações nas marcas autorizadas
CREATE POLICY "Atualizar indicacao marca permitida"
  ON public.indicacoes
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  )
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Policy para deleção: usuário só deleta próprias indicações nas marcas autorizadas
CREATE POLICY "Deletar indicacao marca permitida"
  ON public.indicacoes
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND marca = ANY (COALESCE(
      (auth.jwt()->'user_metadata'->>'allowed_brands')::text[],
      ARRAY['rental']::text[]
    ))
  );

-- Garantir que RLS está habilitado
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
