-- ============================================
-- DIAGNÓSTICO COMPLETO DO BANCO DE DADOS
-- Execute este arquivo após reiniciar o Cursor
-- ============================================

-- 1. Versão do PostgreSQL
SELECT 'Postgres Version' as info, version() as value;

-- 2. Verificar ENUMs existentes
SELECT 
  'Enums Existentes' as info,
  t.typname AS enum_type, 
  e.enumlabel AS enum_value, 
  e.enumsortorder as sort_order
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid 
WHERE t.typname IN ('brand_enum','indicacao_status_enum','user_role_enum')
ORDER BY t.typname, e.enumsortorder;

-- 3. Estrutura da tabela indicacoes
SELECT 
  'Estrutura Indicacoes' as info,
  column_name, 
  data_type, 
  udt_name,
  column_default, 
  is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'indicacoes' 
ORDER BY ordinal_position;

-- 4. Estrutura da tabela users
SELECT 
  'Estrutura Users' as info,
  column_name, 
  data_type, 
  udt_name,
  column_default, 
  is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users' 
ORDER BY ordinal_position;

-- 5. Valores distintos em indicacoes.marca (com contagem)
SELECT 
  'Valores Marca' as info,
  marca, 
  COUNT(*) as count
FROM public.indicacoes 
GROUP BY marca 
ORDER BY count DESC;

-- 6. Valores distintos em indicacoes.status (com contagem)
SELECT 
  'Valores Status' as info,
  status, 
  COUNT(*) as count
FROM public.indicacoes 
GROUP BY status 
ORDER BY count DESC;

-- 7. Valores distintos em users.role (com contagem)
SELECT 
  'Valores User Role' as info,
  role, 
  COUNT(*) as count
FROM public.users 
GROUP BY role 
ORDER BY count DESC;

-- 8. Valores distintos em users.allowed_brands (expandido)
SELECT 
  'Valores Allowed Brands' as info,
  unnest(allowed_brands) as brand, 
  COUNT(*) as count
FROM public.users 
WHERE allowed_brands IS NOT NULL
GROUP BY unnest(allowed_brands) 
ORDER BY count DESC;

-- 9. Constraints da tabela indicacoes
SELECT 
  'Constraints Indicacoes' as info,
  conname as constraint_name, 
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'public.indicacoes'::regclass;

-- 10. Constraints da tabela users
SELECT 
  'Constraints Users' as info,
  conname as constraint_name, 
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'public.users'::regclass;

-- 11. Índices em indicacoes
SELECT 
  'Indices Indicacoes' as info,
  indexname, 
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'indicacoes';

-- 12. Índices em users
SELECT 
  'Indices Users' as info,
  indexname, 
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename = 'users';

-- 13. RLS Status
SELECT 
  'RLS Status' as info,
  schemaname,
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('indicacoes', 'users');

-- 14. Policies em indicacoes
SELECT 
  'Policies Indicacoes' as info,
  policyname, 
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'indicacoes';

-- 15. Policies em users
SELECT 
  'Policies Users' as info,
  policyname, 
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users';

-- 16. Funções que referenciam enums ou colunas críticas
SELECT 
  'Functions' as info,
  n.nspname AS schema, 
  p.proname AS function_name
FROM pg_proc p 
JOIN pg_namespace n ON p.pronamespace = n.oid 
WHERE pg_get_functiondef(p.oid) ILIKE '%brand_enum%' 
   OR pg_get_functiondef(p.oid) ILIKE '%indicacao_status_enum%' 
   OR pg_get_functiondef(p.oid) ILIKE '%marca%' 
   OR pg_get_functiondef(p.oid) ILIKE '%status%'
   OR pg_get_functiondef(p.oid) ILIKE '%allowed_brands%';

-- 17. Triggers
SELECT 
  'Triggers' as info,
  event_object_table as table_name, 
  trigger_name, 
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'public' 
  AND event_object_table IN ('indicacoes', 'users');

-- 18. Contagens totais
SELECT 
  'Contagens' as info,
  (SELECT COUNT(*) FROM public.indicacoes) AS indicacoes_total,
  (SELECT COUNT(*) FROM public.users) AS users_total;

-- 19. Amostras recentes de indicacoes (últimas 10)
SELECT 
  'Amostras Indicacoes' as info,
  id, 
  marca, 
  status, 
  tipo,
  created_at
FROM public.indicacoes 
ORDER BY created_at DESC 
LIMIT 10;

-- 20. Verificar valores INVÁLIDOS que não batem com padrões esperados
-- Status inválidos (deve ser EM_ANALISE, APROVADA, REJEITADA, CONCLUIDA)
SELECT 
  'Status Invalidos' as info,
  DISTINCT status
FROM public.indicacoes 
WHERE status NOT IN ('EM_ANALISE', 'APROVADA', 'REJEITADA', 'CONCLUIDA');

-- Marca inválidas (deve ser rental, dorata)
SELECT 
  'Marcas Invalidas' as info,
  DISTINCT marca
FROM public.indicacoes 
WHERE marca NOT IN ('rental', 'dorata') OR marca IS NULL;

-- Tipos inválidos (deve ser PF, PJ)
SELECT 
  'Tipos Invalidos' as info,
  DISTINCT tipo
FROM public.indicacoes 
WHERE tipo NOT IN ('PF', 'PJ');

-- 21. Verificar dados órfãos (indicacoes sem user_id válido)
SELECT 
  'Orfaos Indicacoes' as info,
  COUNT(*) as count
FROM public.indicacoes i
LEFT JOIN auth.users u ON i.user_id = u.id
WHERE u.id IS NULL;

