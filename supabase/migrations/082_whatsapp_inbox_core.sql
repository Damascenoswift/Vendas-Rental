BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_whatsapp_phone(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(raw_value, ''), '\\D', '', 'g'), '');
$$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_normalized text;

UPDATE public.contacts
SET whatsapp_normalized = public.normalize_whatsapp_phone(COALESCE(whatsapp, phone, mobile))
WHERE whatsapp_normalized IS NULL;

CREATE INDEX IF NOT EXISTS contacts_whatsapp_normalized_idx
  ON public.contacts (whatsapp_normalized);

CREATE OR REPLACE FUNCTION public.contacts_set_whatsapp_normalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.whatsapp_normalized := public.normalize_whatsapp_phone(COALESCE(NEW.whatsapp, NEW.phone, NEW.mobile));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_set_whatsapp_normalized_trigger ON public.contacts;
CREATE TRIGGER contacts_set_whatsapp_normalized_trigger
BEFORE INSERT OR UPDATE OF whatsapp, phone, mobile
ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.contacts_set_whatsapp_normalized();

CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta_cloud_api' CHECK (provider IN ('meta_cloud_api')),
  waba_id text NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  display_phone_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_status_idx
  ON public.whatsapp_accounts (status);

DROP TRIGGER IF EXISTS update_whatsapp_accounts_modtime ON public.whatsapp_accounts;
CREATE TRIGGER update_whatsapp_accounts_modtime
BEFORE UPDATE ON public.whatsapp_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_wa_id text NOT NULL,
  customer_name text,
  brand public.brand_enum,
  assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING_BRAND' CHECK (status IN ('PENDING_BRAND', 'OPEN', 'CLOSED')),
  window_expires_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_open_unique_idx
  ON public.whatsapp_conversations (account_id, customer_wa_id)
  WHERE status <> 'CLOSED';

CREATE INDEX IF NOT EXISTS whatsapp_conversations_contact_idx
  ON public.whatsapp_conversations (contact_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_assignee_idx
  ON public.whatsapp_conversations (assigned_user_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_last_message_idx
  ON public.whatsapp_conversations (last_message_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_conversations_modtime ON public.whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_modtime
BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  wa_message_id text,
  dedupe_hash text,
  message_type text NOT NULL DEFAULT 'text' CHECK (
    message_type IN (
      'text',
      'unsupported',
      'image',
      'document',
      'audio',
      'video',
      'sticker',
      'location',
      'contacts',
      'unknown'
    )
  ),
  body_text text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  sender_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  error_message text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_unique_idx
  ON public.whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_inbound_dedupe_unique_idx
  ON public.whatsapp_messages (dedupe_hash)
  WHERE dedupe_hash IS NOT NULL AND direction = 'INBOUND';

CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_created_idx
  ON public.whatsapp_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS whatsapp_messages_sender_idx
  ON public.whatsapp_messages (sender_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('BRAND_SET', 'ASSIGNED', 'UNASSIGNED', 'CLOSED', 'REOPENED')),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversation_events_conversation_idx
  ON public.whatsapp_conversation_events (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_whatsapp_inbox_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_whatsapp_inbox_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_whatsapp_inbox_access() TO service_role;

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversation_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.whatsapp_accounts TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversations TO authenticated;
GRANT ALL ON TABLE public.whatsapp_messages TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversation_events TO authenticated;

DROP POLICY IF EXISTS "WhatsApp inbox access accounts" ON public.whatsapp_accounts;
CREATE POLICY "WhatsApp inbox access accounts"
ON public.whatsapp_accounts
FOR ALL
TO authenticated
USING (public.has_whatsapp_inbox_access())
WITH CHECK (public.has_whatsapp_inbox_access());

DROP POLICY IF EXISTS "WhatsApp inbox access conversations" ON public.whatsapp_conversations;
CREATE POLICY "WhatsApp inbox access conversations"
ON public.whatsapp_conversations
FOR ALL
TO authenticated
USING (public.has_whatsapp_inbox_access())
WITH CHECK (public.has_whatsapp_inbox_access());

DROP POLICY IF EXISTS "WhatsApp inbox access messages" ON public.whatsapp_messages;
CREATE POLICY "WhatsApp inbox access messages"
ON public.whatsapp_messages
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
  )
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
  )
);

DROP POLICY IF EXISTS "WhatsApp inbox access events" ON public.whatsapp_conversation_events;
CREATE POLICY "WhatsApp inbox access events"
ON public.whatsapp_conversation_events
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_events.conversation_id
  )
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_events.conversation_id
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
