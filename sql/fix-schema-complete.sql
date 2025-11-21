-- ============================================
-- CORREÇÃO COMPLETA DO SCHEMA DO BANCO
-- Execute SOMENTE após análise do diagnostic-complete.sql
-- ============================================

-- BACKUP RECOMENDADO: Faça backup antes de executar
-- pg_dump -U postgres -d sua_base > backup_antes_correcao.sql

BEGIN;

-- =============================================
-- PARTE 1: GARANTIR TIPOS BÁSICOS (TEXT com CONSTRAINTS)
-- =============================================

-- 1.1 Garantir que indicacoes.marca existe e tem constraint
DO $$ 
BEGIN
  -- Adicionar coluna se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'indicacoes' 
      AND column_name = 'marca'
  ) THEN
    ALTER TABLE public.indicacoes 
      ADD COLUMN marca text DEFAULT 'rental';
    
    RAISE NOTICE 'Coluna marca adicionada';
  END IF;

  -- Remover constraint antiga se existir
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'indicacoes_marca_check' 
      AND conrelid = 'public.indicacoes'::regclass
  ) THEN
    ALTER TABLE public.indicacoes 
      DROP CONSTRAINT indicacoes_marca_check;
    
    RAISE NOTICE 'Constraint antiga de marca removida';
  END IF;
END $$;

-- 1.2 Normalizar valores existentes ANTES de aplicar constraint
UPDATE public.indicacoes 
SET marca = LOWER(TRIM(marca))
WHERE marca IS NOT NULL;

-- Corrigir valores inválidos para 'rental' (default)
UPDATE public.indicacoes 
SET marca = 'rental'
WHERE marca NOT IN ('rental', 'dorata') OR marca IS NULL;

-- 1.3 Aplicar constraint correta
ALTER TABLE public.indicacoes 
  ADD CONSTRAINT indicacoes_marca_check 
  CHECK (marca IN ('rental', 'dorata'));

-- 1.4 Garantir NOT NULL
ALTER TABLE public.indicacoes 
  ALTER COLUMN marca SET NOT NULL;

-- 1.5 Garantir default
ALTER TABLE public.indicacoes 
  ALTER COLUMN marca SET DEFAULT 'rental';

-- =============================================
-- PARTE 2: NORMALIZAR STATUS
-- =============================================

-- 2.1 Verificar e normalizar status (MAIÚSCULAS)
UPDATE public.indicacoes 
SET status = UPPER(TRIM(status))
WHERE status IS NOT NULL;

-- 2.2 Mapear variações para valores corretos
UPDATE public.indicacoes 
SET status = CASE 
  WHEN UPPER(status) LIKE '%ANALISE%' OR UPPER(status) = 'PENDENTE' THEN 'EM_ANALISE'
  WHEN UPPER(status) LIKE '%APROVAD%' THEN 'APROVADA'
  WHEN UPPER(status) LIKE '%REJEITAD%' OR UPPER(status) = 'RECUSADA' THEN 'REJEITADA'
  WHEN UPPER(status) LIKE '%CONCLUI%' OR UPPER(status) = 'FINALIZADA' THEN 'CONCLUIDA'
  ELSE 'EM_ANALISE'
END
WHERE status NOT IN ('EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA');

-- 2.3 Remover constraint antiga de status se existir
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'indicacoes_status_check' 
      AND conrelid = 'public.indicacoes'::regclass
  ) THEN
    ALTER TABLE public.indicacoes 
      DROP CONSTRAINT indicacoes_status_check;
  END IF;
END $$;

-- 2.4 Aplicar constraint correta
ALTER TABLE public.indicacoes 
  ADD CONSTRAINT indicacoes_status_check 
  CHECK (status IN ('EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA'));

-- 2.5 Garantir NOT NULL e DEFAULT
ALTER TABLE public.indicacoes 
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.indicacoes 
  ALTER COLUMN status SET DEFAULT 'EM_ANALISE';

-- =============================================
-- PARTE 3: NORMALIZAR TIPO
-- =============================================

-- 3.1 Normalizar tipo (MAIÚSCULAS)
UPDATE public.indicacoes 
SET tipo = UPPER(TRIM(tipo))
WHERE tipo IS NOT NULL;

-- 3.2 Corrigir valores inválidos
UPDATE public.indicacoes 
SET tipo = CASE 
  WHEN tipo LIKE '%FISICA%' OR tipo = 'F' THEN 'PF'
  WHEN tipo LIKE '%JURIDICA%' OR tipo = 'J' THEN 'PJ'
  ELSE 'PF'
END
WHERE tipo NOT IN ('PF', 'PJ');

-- 3.3 Remover constraint antiga de tipo se existir
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'indicacoes_tipo_check' 
      AND conrelid = 'public.indicacoes'::regclass
  ) THEN
    ALTER TABLE public.indicacoes 
      DROP CONSTRAINT indicacoes_tipo_check;
  END IF;
END $$;

-- 3.4 Aplicar constraint correta
ALTER TABLE public.indicacoes 
  ADD CONSTRAINT indicacoes_tipo_check 
  CHECK (tipo IN ('PF', 'PJ'));

-- 3.5 Garantir NOT NULL
ALTER TABLE public.indicacoes 
  ALTER COLUMN tipo SET NOT NULL;

-- =============================================
-- PARTE 4: NORMALIZAR USERS.ROLE
-- =============================================

-- 4.1 Normalizar role (minúsculas com underscore)
UPDATE public.users 
SET role = LOWER(TRIM(role))
WHERE role IS NOT NULL;

-- 4.2 Mapear variações
UPDATE public.users 
SET role = CASE 
  WHEN role LIKE '%externo%' THEN 'vendedor_externo'
  WHEN role LIKE '%interno%' THEN 'vendedor_interno'
  WHEN role LIKE '%supervisor%' THEN 'supervisor'
  WHEN role LIKE '%dorata%' THEN 'adm_dorata'
  WHEN role LIKE '%mestre%' OR role = 'admin' THEN 'adm_mestre'
  ELSE 'vendedor_externo'
END
WHERE role NOT IN ('vendedor_externo', 'vendedor_interno', 'supervisor', 'adm_mestre', 'adm_dorata');

-- 4.3 Remover constraint antiga de role se existir
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_role_check' 
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users 
      DROP CONSTRAINT users_role_check;
  END IF;
END $$;

-- 4.4 Aplicar constraint correta
ALTER TABLE public.users 
  ADD CONSTRAINT users_role_check 
  CHECK (role IN ('vendedor_externo', 'vendedor_interno', 'supervisor', 'adm_mestre', 'adm_dorata'));

-- 4.5 Garantir NOT NULL e DEFAULT
ALTER TABLE public.users 
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.users 
  ALTER COLUMN role SET DEFAULT 'vendedor_externo';

-- =============================================
-- PARTE 5: GARANTIR COLUNA allowed_brands EM USERS
-- =============================================

DO $$ 
BEGIN
  -- Adicionar coluna se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'allowed_brands'
  ) THEN
    ALTER TABLE public.users 
      ADD COLUMN allowed_brands text[] DEFAULT ARRAY['rental']::text[];
    
    RAISE NOTICE 'Coluna allowed_brands adicionada';
  END IF;
END $$;

-- Normalizar valores existentes
UPDATE public.users 
SET allowed_brands = ARRAY['rental']::text[]
WHERE allowed_brands IS NULL OR allowed_brands = '{}';

-- Garantir que todos os elementos são minúsculos
UPDATE public.users 
SET allowed_brands = (
  SELECT ARRAY_AGG(LOWER(brand))
  FROM UNNEST(allowed_brands) AS brand
)
WHERE allowed_brands IS NOT NULL;

-- Remover valores inválidos do array
UPDATE public.users 
SET allowed_brands = (
  SELECT ARRAY_AGG(brand)
  FROM UNNEST(allowed_brands) AS brand
  WHERE brand IN ('rental', 'dorata')
)
WHERE allowed_brands IS NOT NULL;

-- Se ficou vazio, colocar rental como default
UPDATE public.users 
SET allowed_brands = ARRAY['rental']::text[]
WHERE allowed_brands IS NULL OR allowed_brands = '{}';

-- =============================================
-- PARTE 6: CRIAR/ATUALIZAR ÍNDICES
-- =============================================

-- 6.1 Índice em indicacoes.marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_marca 
  ON public.indicacoes(marca);

-- 6.2 Índice composto user_id + marca
CREATE INDEX IF NOT EXISTS idx_indicacoes_user_marca 
  ON public.indicacoes(user_id, marca);

-- 6.3 Índice em indicacoes.status
CREATE INDEX IF NOT EXISTS idx_indicacoes_status 
  ON public.indicacoes(status);

-- 6.4 Índice composto status + created_at
CREATE INDEX IF NOT EXISTS idx_indicacoes_status_created 
  ON public.indicacoes(status, created_at DESC);

-- 6.5 Índice GIN em users.allowed_brands (para queries com ANY/overlap)
CREATE INDEX IF NOT EXISTS idx_users_allowed_brands 
  ON public.users USING GIN(allowed_brands);

-- =============================================
-- PARTE 7: HABILITAR RLS E CRIAR POLICIES
-- =============================================

-- 7.1 Habilitar RLS em indicacoes
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

-- 7.2 Remover policies antigas
DROP POLICY IF EXISTS "Indicacoes própria + marca" ON public.indicacoes;
DROP POLICY IF EXISTS "Inserir indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Atualizar indicacao marca permitida" ON public.indicacoes;
DROP POLICY IF EXISTS "Deletar indicacao marca permitida" ON public.indicacoes;

-- 7.3 Policy para SELECT (leitura)
CREATE POLICY "Indicacoes própria + marca"
  ON public.indicacoes
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND marca = ANY (
      SELECT COALESCE(allowed_brands, ARRAY['rental']::text[])
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- 7.4 Policy para INSERT
CREATE POLICY "Inserir indicacao marca permitida"
  ON public.indicacoes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (
      SELECT COALESCE(allowed_brands, ARRAY['rental']::text[])
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- 7.5 Policy para UPDATE
CREATE POLICY "Atualizar indicacao marca permitida"
  ON public.indicacoes
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND marca = ANY (
      SELECT COALESCE(allowed_brands, ARRAY['rental']::text[])
      FROM public.users 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND marca = ANY (
      SELECT COALESCE(allowed_brands, ARRAY['rental']::text[])
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- 7.6 Policy para DELETE
CREATE POLICY "Deletar indicacao marca permitida"
  ON public.indicacoes
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND marca = ANY (
      SELECT COALESCE(allowed_brands, ARRAY['rental']::text[])
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- =============================================
-- PARTE 8: COMENTÁRIOS E DOCUMENTAÇÃO
-- =============================================

COMMENT ON COLUMN public.indicacoes.marca IS 'Marca da indicação: rental ou dorata (minúsculas)';
COMMENT ON COLUMN public.indicacoes.status IS 'Status: EM_ANALISE, APROVADA, REJEITADA, CONCLUIDA (MAIÚSCULAS)';
COMMENT ON COLUMN public.indicacoes.tipo IS 'Tipo: PF (Pessoa Física) ou PJ (Pessoa Jurídica) (MAIÚSCULAS)';
COMMENT ON COLUMN public.users.allowed_brands IS 'Array de marcas autorizadas: [rental, dorata] (minúsculas)';
COMMENT ON COLUMN public.users.role IS 'Role: vendedor_externo, vendedor_interno, supervisor, adm_mestre, adm_dorata (minúsculas)';

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================

-- Verificar se há valores inválidos restantes
DO $$ 
DECLARE
  invalid_count integer;
BEGIN
  -- Marcas inválidas
  SELECT COUNT(*) INTO invalid_count
  FROM public.indicacoes 
  WHERE marca NOT IN ('rental', 'dorata') OR marca IS NULL;
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Ainda existem % marcas inválidas em indicacoes', invalid_count;
  END IF;
  
  -- Status inválidos
  SELECT COUNT(*) INTO invalid_count
  FROM public.indicacoes 
  WHERE status NOT IN ('EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA');
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Ainda existem % status inválidos em indicacoes', invalid_count;
  END IF;
  
  -- Tipos inválidos
  SELECT COUNT(*) INTO invalid_count
  FROM public.indicacoes 
  WHERE tipo NOT IN ('PF', 'PJ');
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Ainda existem % tipos inválidos em indicacoes', invalid_count;
  END IF;
  
  RAISE NOTICE 'Verificação completa: todos os valores estão corretos!';
END $$;

COMMIT;

-- =============================================
-- MENSAGEM FINAL
-- =============================================

SELECT 
  '✅ Schema corrigido com sucesso!' as status,
  (SELECT COUNT(*) FROM public.indicacoes) as total_indicacoes,
  (SELECT COUNT(*) FROM public.users) as total_users;

