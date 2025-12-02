-- Migração: Garantir permissões na tabela users
-- Data: 2025-02-xx
-- Objetivo: Resolver erro "permission denied for table users"

-- 1. Garantir que service_role e postgres tenham acesso total
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.users TO postgres;

-- 2. Garantir que roles de API tenham acesso de leitura (sujeito a RLS)
GRANT SELECT ON TABLE public.users TO anon;
GRANT SELECT ON TABLE public.users TO authenticated;
-- Nota: Insert/Update na users geralmente é feito via triggers ou funções específicas, 
-- mas se precisar editar perfil via API, pode adicionar UPDATE aqui.
-- Por segurança, vamos dar SELECT apenas inicialmente.

-- 3. Garantir permissões na sequence (se houver)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
