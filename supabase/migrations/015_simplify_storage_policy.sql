-- Migration: Simplify Storage RLS Policies
-- Date: 2025-12-05
-- Objective: Fix INSERT permission issues by using simple string matching logic.

-- 1. Drop previous policies to avoid conflicts
DROP POLICY IF EXISTS "Users can manage own indicacoes files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all indicacoes files" ON storage.objects;

-- 2. Create SIMPLIFIED policy for Users (Own Files)
-- Using LIKE matching is often more robust than storage.foldername for INSERTS
CREATE POLICY "Users can manage own indicacoes files"
ON storage.objects
FOR ALL
USING (
    bucket_id = 'indicacoes'
    AND name LIKE auth.uid() || '/%'
)
WITH CHECK (
    bucket_id = 'indicacoes'
    AND name LIKE auth.uid() || '/%'
);

-- 3. Re-create Admin View Policy (this one was working, but good to ensure it persists)
CREATE POLICY "Admins can view all indicacoes files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'indicacoes'
    AND public.is_admin()
);
