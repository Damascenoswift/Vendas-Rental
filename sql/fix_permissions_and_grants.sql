-- ==============================================================================
-- FIX: PERMISSIONS AND GRANTS
-- Description: 
-- 1. Grants explicit permissions to the 'authenticated' role for the tables.
-- 2. Updates all users to have access to BOTH 'rental' and 'dorata' brands 
--    (to rule out permission issues).
-- ==============================================================================

-- 1. GRANT TABLE PERMISSIONS
-- Ensure authenticated users can actually access the tables
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON TABLE public.indicacoes TO authenticated;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.quick_leads TO authenticated;

-- 2. UPDATE USER PERMISSIONS
-- Force update all users to have both brands. 
-- This ensures the RLS policy (which checks this column) will pass.
UPDATE public.users
SET allowed_brands = ARRAY['rental', 'dorata']::public.brand_enum[];

-- 3. VERIFY
-- Check if the update worked
SELECT id, email, allowed_brands FROM public.users LIMIT 5;
