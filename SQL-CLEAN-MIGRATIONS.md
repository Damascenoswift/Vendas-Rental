# SQL Migrations - Formato Limpo

Execute no SQL Editor do Supabase, uma query por vez:

## Migration 1: Adicionar coluna marca

```sql
ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS marca text
    CHECK (marca IN ('rental', 'dorata'))
    DEFAULT 'rental';

COMMENT ON COLUMN public.indicacoes.marca IS 'Marca da indicacao: rental ou dorata';

CREATE INDEX IF NOT EXISTS idx_indicacoes_marca ON public.indicacoes(marca);

CREATE INDEX IF NOT EXISTS idx_indicacoes_user_marca ON public.indicacoes(user_id, marca);
```

## Migration 2: Atualizar registros existentes

```sql
UPDATE public.indicacoes
SET marca = 'rental'
WHERE marca IS NULL;
```

## Migration 3: Configurar policies RLS

```sql
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
```

## Verificação

```sql
SELECT column_name, data_type, column_default, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'indicacoes' 
ORDER BY ordinal_position;
```
