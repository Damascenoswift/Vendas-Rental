-- ============================================
-- MIGRATION: Sincronização Automática de Usuários (CORRIGIDO v5)
-- ============================================

-- 1. Função para lidar com novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role, allowed_brands, name, status)
  VALUES (
    new.id,
    new.email,
    -- Cast explícito para o tipo ENUM de role
    COALESCE(new.raw_user_meta_data->>'role', 'vendedor_externo')::public.user_role_enum,
    -- Cast explícito para o tipo ARRAY de ENUM de brand
    ARRAY['rental']::public.brand_enum[],
    -- Extrair nome ou usar default
    COALESCE(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', 'Novo Usuário'),
    -- Status padrão (obrigatório)
    'ATIVO'
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.users.name),
    status = COALESCE(public.users.status, 'ATIVO'), -- Mantém status existente ou define ATIVO
    updated_at = now();
    
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para executar a função
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Sincronizar usuários existentes
INSERT INTO public.users (id, email, role, allowed_brands, name, status)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'role', 'vendedor_externo')::public.user_role_enum,
  ARRAY['rental']::public.brand_enum[],
  COALESCE(raw_user_meta_data->>'nome', raw_user_meta_data->>'name', 'Usuário Existente'),
  'ATIVO'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
