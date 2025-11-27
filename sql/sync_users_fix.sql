-- ==============================================================================
-- FIX: SYNC USERS
-- Description: 
-- Ensures all users from auth.users exist in public.users.
-- This is required because the new RLS policies depend on public.users.
-- ==============================================================================

INSERT INTO public.users (id, email, role, allowed_brands, name, status)
SELECT 
  id, 
  email, 
  -- Default role if missing
  COALESCE(
    (raw_user_meta_data->>'role')::public.user_role_enum, 
    'vendedor_externo'::public.user_role_enum
  ),
  -- Default allowed_brands if missing
  COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(raw_user_meta_data->'allowed_brands'))::public.brand_enum[],
    ARRAY['rental']::public.brand_enum[]
  ),
  -- Default name
  COALESCE(raw_user_meta_data->>'nome', raw_user_meta_data->>'name', 'Usuário'),
  'ATIVO'
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET
  -- Ensure allowed_brands is not empty/null
  allowed_brands = COALESCE(public.users.allowed_brands, EXCLUDED.allowed_brands),
  email = EXCLUDED.email;

-- Verify if the current user exists (just for confirmation in output)
SELECT count(*) as total_users_synced FROM public.users;
