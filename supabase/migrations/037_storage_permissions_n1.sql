-- Unlock Storage Access for funcionario_n1
-- Bucket: 'indicacoes'

-- Allow Select (Download) for all files in 'indicacoes' bucket
CREATE POLICY "Funcionario N1 Select Storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'indicacoes' AND
  (auth.role() = 'authenticated') AND
  ( EXISTS ( SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1' ) )
);

-- Allow Insert (Upload)
CREATE POLICY "Funcionario N1 Insert Storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'indicacoes' AND
  (auth.role() = 'authenticated') AND
  ( EXISTS ( SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1' ) )
);

-- Allow Update
CREATE POLICY "Funcionario N1 Update Storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'indicacoes' AND
  (auth.role() = 'authenticated') AND
  ( EXISTS ( SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1' ) )
);

-- Allow Delete
CREATE POLICY "Funcionario N1 Delete Storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'indicacoes' AND
  (auth.role() = 'authenticated') AND
  ( EXISTS ( SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'funcionario_n1' ) )
);
