BEGIN;

ALTER TABLE public.whatsapp_accounts
  DROP CONSTRAINT IF EXISTS whatsapp_accounts_provider_check;

ALTER TABLE public.whatsapp_accounts
  ADD CONSTRAINT whatsapp_accounts_provider_check
  CHECK (provider IN ('meta_cloud_api', 'z_api'));

COMMIT;
