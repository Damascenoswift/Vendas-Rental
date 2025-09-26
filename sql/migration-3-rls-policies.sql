DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;

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

ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
