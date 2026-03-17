BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.whatsapp_accounts TO service_role;
GRANT ALL ON TABLE public.whatsapp_conversations TO service_role;
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT ALL ON TABLE public.whatsapp_conversation_events TO service_role;

COMMIT;
