-- ============================================
-- CRIAÇÃO DE USUÁRIO ADMIN VIA SQL
-- ============================================

-- 1. Habilitar extensão para criptografia de senha (se não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Inserir usuário na tabela de autenticação
-- A senha será: admin123
-- O email será: admin@rental.com (Você pode alterar no código abaixo)

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@rental.com', -- <== ALTERE O EMAIL AQUI SE QUISER
  crypt('admin123', gen_salt('bf')), -- <== SENHA: admin123
  now(), -- Confirma o email automaticamente
  '{"provider":"email","providers":["email"]}',
  '{"role": "adm_mestre", "nome": "Admin Sistema"}', -- Define como ADMIN
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- O trigger que criamos vai rodar automaticamente e copiar este usuário para public.users
