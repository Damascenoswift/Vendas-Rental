-- Migration 059: Allow funcionario_n2 to read indicacoes storage
-- Description: Enables funcionario_n2 to list/download files in 'indicacoes' bucket.

BEGIN;

DROP POLICY IF EXISTS "Funcionario N2 Select Storage" ON storage.objects;

CREATE POLICY "Funcionario N2 Select Storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'indicacoes' AND
  (auth.role() = 'authenticated') AND
  ( EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'funcionario_n2'
    )
  )
);

COMMIT;
