-- Migration 055: Create contacts table
-- Description: Stores imported contacts and basic metadata for search and CRM usage.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT,
    source TEXT,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    whatsapp TEXT,
    whatsapp_remote_lid TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    country TEXT,
    timezone TEXT,
    preferred_locale TEXT,
    cm TEXT,
    uc TEXT,
    sh_status TEXT,
    star_score INTEGER DEFAULT 0,
    created_by TEXT,
    created_by_name TEXT,
    created_by_type TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    source_created_at TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_external_id_unique ON public.contacts (external_id);
CREATE INDEX IF NOT EXISTS contacts_full_name_idx ON public.contacts (full_name);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (email);
CREATE INDEX IF NOT EXISTS contacts_whatsapp_idx ON public.contacts (whatsapp);
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON public.contacts (phone);
CREATE INDEX IF NOT EXISTS contacts_mobile_idx ON public.contacts (mobile);

DROP TRIGGER IF EXISTS update_contacts_modtime ON public.contacts;
CREATE TRIGGER update_contacts_modtime
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contacts staff access" ON public.contacts;
CREATE POLICY "Contacts staff access"
ON public.contacts
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN (
            'adm_mestre',
            'adm_dorata',
            'supervisor',
            'suporte_tecnico',
            'suporte_limitado',
            'funcionario_n1',
            'funcionario_n2'
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
          AND users.role IN (
            'adm_mestre',
            'adm_dorata',
            'supervisor',
            'suporte_tecnico',
            'suporte_limitado',
            'funcionario_n1',
            'funcionario_n2'
          )
    )
);

GRANT ALL ON public.contacts TO authenticated;

COMMIT;
