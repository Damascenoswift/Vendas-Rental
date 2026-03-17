BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-outbound-media',
  'whatsapp-outbound-media',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "WhatsApp Outbound Media Select" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp Outbound Media Insert" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp Outbound Media Update" ON storage.objects;
DROP POLICY IF EXISTS "WhatsApp Outbound Media Delete" ON storage.objects;

CREATE POLICY "WhatsApp Outbound Media Select"
ON storage.objects
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND bucket_id = 'whatsapp-outbound-media'
  AND public.has_whatsapp_inbox_access()
);

CREATE POLICY "WhatsApp Outbound Media Insert"
ON storage.objects
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND bucket_id = 'whatsapp-outbound-media'
  AND public.has_whatsapp_inbox_access()
);

CREATE POLICY "WhatsApp Outbound Media Update"
ON storage.objects
FOR UPDATE
USING (
  auth.role() = 'authenticated'
  AND bucket_id = 'whatsapp-outbound-media'
  AND public.has_whatsapp_inbox_access()
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND bucket_id = 'whatsapp-outbound-media'
  AND public.has_whatsapp_inbox_access()
);

CREATE POLICY "WhatsApp Outbound Media Delete"
ON storage.objects
FOR DELETE
USING (
  auth.role() = 'authenticated'
  AND bucket_id = 'whatsapp-outbound-media'
  AND public.has_whatsapp_inbox_access()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
