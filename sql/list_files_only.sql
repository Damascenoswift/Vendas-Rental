-- LIST ALL FILES IN INDICACOES BUCKET
-- Run this to verify the exact folder structure

SELECT 
    name, 
    id, 
    metadata, 
    created_at 
FROM storage.objects 
WHERE bucket_id = 'indicacoes' 
ORDER BY created_at DESC 
LIMIT 20;
