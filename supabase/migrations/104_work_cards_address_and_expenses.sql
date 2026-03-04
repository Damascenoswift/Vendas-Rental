BEGIN;

ALTER TABLE public.obra_cards
    ADD COLUMN IF NOT EXISTS work_address TEXT;

CREATE TABLE IF NOT EXISTS public.obra_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    attachment_path TEXT,
    attachment_name TEXT,
    attachment_size BIGINT CHECK (attachment_size IS NULL OR attachment_size >= 0),
    attachment_content_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obra_expenses_obra_id_created_at
    ON public.obra_expenses (obra_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_obra_expenses_user_id
    ON public.obra_expenses (user_id);

DROP TRIGGER IF EXISTS update_obra_expenses_modtime ON public.obra_expenses;
CREATE TRIGGER update_obra_expenses_modtime
    BEFORE UPDATE ON public.obra_expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.obra_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Work staff full access expenses" ON public.obra_expenses;
CREATE POLICY "Work staff full access expenses"
ON public.obra_expenses
FOR ALL
USING (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
)
WITH CHECK (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
);

GRANT ALL ON TABLE public.obra_expenses TO authenticated;
GRANT ALL ON TABLE public.obra_expenses TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'obra-expense-attachments',
    'obra-expense-attachments',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Obra Expense Attachments Select By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Expense Attachments Insert By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Expense Attachments Update By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Expense Attachments Delete By Card Access" ON storage.objects;

CREATE POLICY "Obra Expense Attachments Select By Card Access"
ON storage.objects
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-expense-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Expense Attachments Insert By Card Access"
ON storage.objects
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-expense-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Expense Attachments Update By Card Access"
ON storage.objects
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-expense-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-expense-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Expense Attachments Delete By Card Access"
ON storage.objects
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-expense-attachments'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

WITH execution_template AS (
    SELECT *
    FROM (
        VALUES
            (1, 'Planejar execução'),
            (2, 'Execução em campo'),
            (3, 'Upload foto antes'),
            (4, 'Upload foto depois'),
            (5, 'Vistoria e encerramento técnico')
    ) AS t(sort_order, title)
)
INSERT INTO public.obra_process_items (obra_id, phase, title, sort_order, status)
SELECT
    c.id,
    'EXECUCAO',
    t.title,
    t.sort_order,
    'TODO'
FROM public.obra_cards c
CROSS JOIN execution_template t
WHERE c.brand = 'dorata'
  AND NOT EXISTS (
      SELECT 1
      FROM public.obra_process_items p
      WHERE p.obra_id = c.id
        AND p.phase = 'EXECUCAO'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
