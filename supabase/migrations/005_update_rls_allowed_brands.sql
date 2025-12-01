-- Migração: Atualizar RLS para usar allowed_brands da tabela public.users
-- Data: 2025-02-xx
-- Objetivo:
-- 1) Usar a tabela public.users como fonte de verdade de allowed_brands
-- 2) Manter fallback para 'rental' caso o usuário não tenha brands definidas

-- Limpar policies anteriores
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;

-- Helper para brands permitidas vindas da tabela users
-- Nota: brand_enum deve existir. Se não existir, ajuste o tipo do array abaixo.

-- SELECT
CREATE POLICY "Indicacoes própria + marca"
  ON public.indicacoes
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND marca = ANY(
      COALESCE(
        (SELECT allowed_brands FROM public.users u WHERE u.id = auth.uid()),
        ARRAY['rental'::public.brand_enum]
      )::text[]
    )
  );

-- INSERT
CREATE POLICY "Inserir indicacao marca permitida"
  ON public.indicacoes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY(
      COALESCE(
        (SELECT allowed_brands FROM public.users u WHERE u.id = auth.uid()),
        ARRAY['rental'::public.brand_enum]
      )::text[]
    )
  );

-- UPDATE
CREATE POLICY "Atualizar indicacao marca permitida"
  ON public.indicacoes
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND marca = ANY(
      COALESCE(
        (SELECT allowed_brands FROM public.users u WHERE u.id = auth.uid()),
        ARRAY['rental'::public.brand_enum]
      )::text[]
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY(
      COALESCE(
        (SELECT allowed_brands FROM public.users u WHERE u.id = auth.uid()),
        ARRAY['rental'::public.brand_enum]
      )::text[]
    )
  );

-- DELETE
CREATE POLICY "Deletar indicacao marca permitida"
  ON public.indicacoes
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND marca = ANY(
      COALESCE(
        (SELECT allowed_brands FROM public.users u WHERE u.id = auth.uid()),
        ARRAY['rental'::public.brand_enum]
      )::text[]
    )
  );

-- Garantir que RLS permanece habilitado
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
