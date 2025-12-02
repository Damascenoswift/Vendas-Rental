-- Migração: Garantir permissões na tabela indicacoes
-- Data: 2025-02-xx
-- Objetivo: Resolver erro "permission denied for table indicacoes"

-- 1. Garantir que service_role e postgres tenham acesso total
GRANT ALL ON TABLE public.indicacoes TO service_role;
GRANT ALL ON TABLE public.indicacoes TO postgres;

-- 2. Garantir que roles de API tenham acesso básico (sujeito a RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.indicacoes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.indicacoes TO authenticated;

-- 3. Garantir permissões na sequence (se houver, embora id seja uuid ou text)
-- Apenas por precaução se houver serial
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
