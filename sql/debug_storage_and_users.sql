-- DIAGNOSTIC QUERY
-- Run this in Supabase SQL Editor to verify data

-- 1. Check if ANY files exist in the 'indicacoes' bucket
SELECT 'Files in Storage' as check_type, count(*) as count, max(created_at) as last_created
FROM storage.objects 
WHERE bucket_id = 'indicacoes';

-- 2. List the last 5 files (to verify names/paths)
SELECT name, owner, created_at, metadata 
FROM storage.objects 
WHERE bucket_id = 'indicacoes' 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Check your user (replace email with your email if needed, or check distinct roles)
SELECT id, email, role, allowed_brands 
FROM public.users 
LIMIT 5;

-- 4. Verify Policy definitions
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies 
WHERE tablename = 'objects';
