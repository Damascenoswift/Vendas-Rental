-- Migration: Permissive Insert Policy (TESTING ONLY)
-- Date: 2025-12-05
-- Objective: Rule out path matching issues by allowing any authenticated upload.

DROP POLICY IF EXISTS "Users can manage own indicacoes files" ON storage.objects;

-- TEST POLICY: Allow ANY authenticated user to INSERT into 'indicacoes' bucket
-- ignoring folder structure/name checks.
CREATE POLICY "Users can insert any indicacoes file"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'indicacoes' );

-- Keep SELECT policy (so they can see what they uploaded, if we had a select policy)
-- But for now let's also allow SELECT own files lightly
CREATE POLICY "Users can select own indicacoes files"
ON storage.objects
FOR SELECT
USING ( bucket_id = 'indicacoes' AND auth.uid()::text = (storage.foldername(name))[1] );
