-- ============================================
-- DIAGNÓSTICO SIMPLIFICADO (Cole no Supabase SQL Editor)
-- ============================================

-- 1. Verificar se tabelas existem
SELECT 'Tabelas existentes' as check_name, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('indicacoes', 'users');

-- 2. Se indicacoes existir, ver estrutura
SELECT 'Estrutura indicacoes' as check_name, column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'indicacoes' 
ORDER BY ordinal_position;

-- 3. Contagem total
SELECT 'Contagens' as check_name,
  (SELECT COUNT(*) FROM public.indicacoes) as indicacoes_total;

-- 4. Valores de marca (se a coluna existir)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'indicacoes' AND column_name = 'marca'
  ) THEN
    RAISE NOTICE 'Executando query de marca...';
  END IF;
END $$;

SELECT 'Valores marca' as check_name, marca, COUNT(*) as count
FROM public.indicacoes 
GROUP BY marca
ORDER BY count DESC;

-- 5. Valores de status
SELECT 'Valores status' as check_name, status, COUNT(*) as count
FROM public.indicacoes 
GROUP BY status
ORDER BY count DESC;

-- 6. Valores de tipo
SELECT 'Valores tipo' as check_name, tipo, COUNT(*) as count
FROM public.indicacoes 
GROUP BY tipo
ORDER BY count DESC;

-- 7. Amostras recentes
SELECT 'Amostras' as check_name, id, marca, status, tipo, created_at
FROM public.indicacoes 
ORDER BY created_at DESC 
LIMIT 5;

-- 8. Verificar RLS
SELECT 'RLS Status' as check_name, 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'indicacoes';

