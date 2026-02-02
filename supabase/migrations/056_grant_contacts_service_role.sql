-- Migration 056: Grant service_role access to contacts
-- Description: Ensures service role can query contacts when using server-side admin client.

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.contacts TO service_role;

COMMIT;
