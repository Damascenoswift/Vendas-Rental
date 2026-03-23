BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_pinned_notes (
  conversation_id uuid PRIMARY KEY REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversation_pinned_notes_target_user_idx
  ON public.whatsapp_conversation_pinned_notes (target_user_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversation_pinned_notes_updated_at_idx
  ON public.whatsapp_conversation_pinned_notes (updated_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_conversation_pinned_notes_modtime
  ON public.whatsapp_conversation_pinned_notes;
CREATE TRIGGER update_whatsapp_conversation_pinned_notes_modtime
BEFORE UPDATE ON public.whatsapp_conversation_pinned_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.whatsapp_conversation_pinned_notes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.whatsapp_conversation_pinned_notes TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversation_pinned_notes TO service_role;

DROP POLICY IF EXISTS "WhatsApp inbox access pinned notes" ON public.whatsapp_conversation_pinned_notes;
CREATE POLICY "WhatsApp inbox access pinned notes"
ON public.whatsapp_conversation_pinned_notes
FOR ALL
TO authenticated
USING (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_pinned_notes.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
)
WITH CHECK (
  public.has_whatsapp_inbox_access()
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_pinned_notes.conversation_id
      AND public.can_view_whatsapp_conversation(c.id)
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
