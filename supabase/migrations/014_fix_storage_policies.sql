-- Migration: Fix Storage RLS Policies for Indicacoes
-- Date: 2025-12-05
-- Objective: Allow users to manage their files and Admins (adm_mestre) to view all files.

-- NOTE: Removed ALTER TABLE ENABLE RLS as it requires ownership. 
-- storage.objects usually has RLS enabled by default.

DROP POLICY IF EXISTS "Users can manage own indicacoes files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all indicacoes files" ON storage.objects;

CREATE POLICY "Users can manage own indicacoes files"
ON storage.objects
FOR ALL
USING (
    bucket_id = 'indicacoes'
    AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
    bucket_id = 'indicacoes'
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Helper function to check admin status safely (bypassing RLS on public.users)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'adm_mestre'
  );
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO service_role;

-- Policy 2: Admins (adm_mestre) can view all files in indicacoes bucket
CREATE POLICY "Admins can view all indicacoes files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'indicacoes'
    AND public.is_admin()
);
