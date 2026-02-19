BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'proposal_source_mode_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.proposal_source_mode_enum AS ENUM ('simple', 'complete', 'legacy');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'obra_status_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.obra_status_enum AS ENUM ('FECHADA', 'PARA_INICIAR', 'EM_ANDAMENTO');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'obra_phase_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.obra_phase_enum AS ENUM ('PROJETO', 'EXECUCAO');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'obra_image_type_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.obra_image_type_enum AS ENUM ('CAPA', 'PERFIL', 'ANTES', 'DEPOIS');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'obra_comment_type_enum'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE public.obra_comment_type_enum AS ENUM ('GERAL', 'ENERGISA_RESPOSTA');
    END IF;
END
$$;

ALTER TABLE public.proposals
    ADD COLUMN IF NOT EXISTS source_mode public.proposal_source_mode_enum;

UPDATE public.proposals
SET source_mode = 'legacy'
WHERE source_mode IS NULL;

ALTER TABLE public.proposals
    ALTER COLUMN source_mode SET DEFAULT 'legacy';

ALTER TABLE public.proposals
    ALTER COLUMN source_mode SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.obra_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT NOT NULL CHECK (brand IN ('dorata', 'rental')),
    installation_key TEXT NOT NULL,
    codigo_instalacao TEXT,
    title TEXT,
    status public.obra_status_enum NOT NULL DEFAULT 'FECHADA',
    completed_at TIMESTAMPTZ,
    indicacao_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    primary_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
    tasks_integration_enabled BOOLEAN NOT NULL DEFAULT false,
    projeto_liberado_at TIMESTAMPTZ,
    projeto_liberado_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    technical_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    latest_energisa_comment_id UUID,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT obra_cards_brand_installation_key_key UNIQUE (brand, installation_key)
);

CREATE TABLE IF NOT EXISTS public.obra_card_proposals (
    obra_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (obra_id, proposal_id)
);

CREATE TABLE IF NOT EXISTS public.obra_process_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    phase public.obra_phase_enum NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'TODO'
        CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    due_date TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    comment_type public.obra_comment_type_enum NOT NULL DEFAULT 'GERAL',
    phase public.obra_phase_enum,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obra_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID NOT NULL REFERENCES public.obra_cards(id) ON DELETE CASCADE,
    image_type public.obra_image_type_enum NOT NULL,
    storage_path TEXT NOT NULL,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_cards
    DROP CONSTRAINT IF EXISTS obra_cards_latest_energisa_comment_id_fkey;

ALTER TABLE public.obra_cards
    ADD CONSTRAINT obra_cards_latest_energisa_comment_id_fkey
    FOREIGN KEY (latest_energisa_comment_id)
    REFERENCES public.obra_comments(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obra_cards_status
ON public.obra_cards (status);

CREATE INDEX IF NOT EXISTS idx_obra_cards_indicacao_id
ON public.obra_cards (indicacao_id);

CREATE INDEX IF NOT EXISTS idx_obra_cards_contact_id
ON public.obra_cards (contact_id);

CREATE INDEX IF NOT EXISTS idx_obra_cards_primary_proposal_id
ON public.obra_cards (primary_proposal_id);

CREATE INDEX IF NOT EXISTS idx_obra_cards_installation_key
ON public.obra_cards (installation_key);

CREATE INDEX IF NOT EXISTS idx_obra_card_proposals_proposal_id
ON public.obra_card_proposals (proposal_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obra_card_proposals_primary_unique
ON public.obra_card_proposals (obra_id)
WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_obra_process_items_obra_phase
ON public.obra_process_items (obra_id, phase);

CREATE INDEX IF NOT EXISTS idx_obra_process_items_obra_status
ON public.obra_process_items (obra_id, status);

CREATE INDEX IF NOT EXISTS idx_obra_comments_obra_created_at
ON public.obra_comments (obra_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_obra_comments_comment_type
ON public.obra_comments (comment_type);

CREATE INDEX IF NOT EXISTS idx_obra_images_obra_type
ON public.obra_images (obra_id, image_type, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obra_images_single_capa
ON public.obra_images (obra_id)
WHERE image_type = 'CAPA';

CREATE UNIQUE INDEX IF NOT EXISTS idx_obra_images_single_perfil
ON public.obra_images (obra_id)
WHERE image_type = 'PERFIL';

DROP TRIGGER IF EXISTS update_obra_cards_modtime ON public.obra_cards;
CREATE TRIGGER update_obra_cards_modtime
    BEFORE UPDATE ON public.obra_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_obra_process_items_modtime ON public.obra_process_items;
CREATE TRIGGER update_obra_process_items_modtime
    BEFORE UPDATE ON public.obra_process_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_work_staff(
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = p_user_id
          AND u.role IN (
            'adm_mestre',
            'adm_dorata',
            'supervisor',
            'suporte',
            'suporte_tecnico',
            'suporte_limitado',
            'funcionario_n1',
            'funcionario_n2'
          )
    );
$$;

REVOKE ALL ON FUNCTION public.is_work_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_work_staff(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_work_card(
    p_obra_id UUID,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.obra_cards c
        WHERE c.id = p_obra_id
          AND public.is_work_staff(p_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_work_card(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_work_card(UUID, UUID) TO authenticated;

ALTER TABLE public.obra_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_card_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_process_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Work staff full access cards" ON public.obra_cards;
CREATE POLICY "Work staff full access cards"
ON public.obra_cards
FOR ALL
USING (public.is_work_staff(auth.uid()))
WITH CHECK (public.is_work_staff(auth.uid()));

DROP POLICY IF EXISTS "Work staff full access card proposals" ON public.obra_card_proposals;
CREATE POLICY "Work staff full access card proposals"
ON public.obra_card_proposals
FOR ALL
USING (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
)
WITH CHECK (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
);

DROP POLICY IF EXISTS "Work staff full access process items" ON public.obra_process_items;
CREATE POLICY "Work staff full access process items"
ON public.obra_process_items
FOR ALL
USING (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
)
WITH CHECK (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
);

DROP POLICY IF EXISTS "Work staff full access comments" ON public.obra_comments;
CREATE POLICY "Work staff full access comments"
ON public.obra_comments
FOR ALL
USING (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
)
WITH CHECK (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
);

DROP POLICY IF EXISTS "Work staff full access images" ON public.obra_images;
CREATE POLICY "Work staff full access images"
ON public.obra_images
FOR ALL
USING (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
)
WITH CHECK (
    public.is_work_staff(auth.uid())
    AND public.can_access_work_card(obra_id, auth.uid())
);

GRANT ALL ON public.obra_cards TO authenticated;
GRANT ALL ON public.obra_card_proposals TO authenticated;
GRANT ALL ON public.obra_process_items TO authenticated;
GRANT ALL ON public.obra_comments TO authenticated;
GRANT ALL ON public.obra_images TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'obra-images',
    'obra-images',
    false,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Obra Images Select By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Images Insert By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Images Update By Card Access" ON storage.objects;
DROP POLICY IF EXISTS "Obra Images Delete By Card Access" ON storage.objects;

CREATE POLICY "Obra Images Select By Card Access"
ON storage.objects
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Images Insert By Card Access"
ON storage.objects
FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Images Update By Card Access"
ON storage.objects
FOR UPDATE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
)
WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

CREATE POLICY "Obra Images Delete By Card Access"
ON storage.objects
FOR DELETE
USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'obra-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_work_card(split_part(name, '/', 1)::uuid, auth.uid())
);

WITH base_proposals AS (
    SELECT
        p.id AS proposal_id,
        p.created_at,
        p.updated_at,
        p.contact_id,
        p.source_mode,
        p.total_power,
        p.calculation,
        i.id AS indicacao_id,
        i.nome AS indicacao_nome,
        i.codigo_instalacao,
        i.unidade_consumidora,
        i.codigo_cliente,
        COALESCE(i.marca::text, 'dorata') AS brand,
        CASE
            WHEN NULLIF(trim(i.codigo_instalacao), '') IS NOT NULL THEN trim(i.codigo_instalacao)
            WHEN i.id IS NOT NULL THEN 'indicacao:' || i.id::text
            ELSE 'indicacao:' || p.id::text
        END AS installation_key
    FROM public.proposals p
    LEFT JOIN public.indicacoes i
        ON i.id = p.client_id
    WHERE p.status = 'accepted'
      AND COALESCE(i.marca::text, 'dorata') = 'dorata'
),
ranked_proposals AS (
    SELECT
        bp.*,
        ROW_NUMBER() OVER (
            PARTITION BY bp.brand, bp.installation_key
            ORDER BY bp.created_at DESC, bp.proposal_id DESC
        ) AS rn
    FROM base_proposals bp
),
primary_rows AS (
    SELECT *
    FROM ranked_proposals
    WHERE rn = 1
)
INSERT INTO public.obra_cards (
    brand,
    installation_key,
    codigo_instalacao,
    title,
    status,
    indicacao_id,
    contact_id,
    primary_proposal_id,
    technical_snapshot
)
SELECT
    pr.brand,
    pr.installation_key,
    pr.codigo_instalacao,
    COALESCE(pr.indicacao_nome, 'Obra sem nome'),
    'FECHADA',
    pr.indicacao_id,
    pr.contact_id,
    pr.proposal_id,
    jsonb_strip_nulls(
        jsonb_build_object(
            'source_mode', pr.source_mode,
            'proposal_id', pr.proposal_id,
            'proposal_created_at', pr.created_at,
            'proposal_updated_at', pr.updated_at,
            'codigo_instalacao', pr.codigo_instalacao,
            'indicacao_id', pr.indicacao_id,
            'indicacao_nome', pr.indicacao_nome,
            'total_power', pr.total_power,
            'calculation', jsonb_strip_nulls(
                jsonb_build_object(
                    'dimensioning', pr.calculation -> 'output' -> 'dimensioning',
                    'inverter', pr.calculation -> 'output' -> 'dimensioning' -> 'inversor',
                    'kit', jsonb_build_object(
                        'qtd_modulos', pr.calculation -> 'input' -> 'dimensioning' -> 'qtd_modulos',
                        'potencia_modulo_w', pr.calculation -> 'input' -> 'dimensioning' -> 'potencia_modulo_w',
                        'tipo_inversor', pr.calculation -> 'input' -> 'dimensioning' -> 'tipo_inversor',
                        'fator_oversizing', pr.calculation -> 'input' -> 'dimensioning' -> 'fator_oversizing'
                    ),
                    'structure', jsonb_build_object(
                        'qtd_placas_solo', pr.calculation -> 'input' -> 'structure' -> 'qtd_placas_solo',
                        'qtd_placas_telhado', pr.calculation -> 'input' -> 'structure' -> 'qtd_placas_telhado'
                    )
                )
            ),
            'installation', jsonb_build_object(
                'codigo_instalacao', pr.codigo_instalacao,
                'unidade_consumidora', pr.unidade_consumidora,
                'codigo_cliente', pr.codigo_cliente
            )
        )
    )
FROM primary_rows pr
ON CONFLICT (brand, installation_key)
DO UPDATE
SET
    codigo_instalacao = EXCLUDED.codigo_instalacao,
    title = EXCLUDED.title,
    indicacao_id = EXCLUDED.indicacao_id,
    contact_id = COALESCE(EXCLUDED.contact_id, public.obra_cards.contact_id),
    primary_proposal_id = EXCLUDED.primary_proposal_id,
    technical_snapshot = EXCLUDED.technical_snapshot,
    updated_at = now();

WITH base_proposals AS (
    SELECT
        p.id AS proposal_id,
        p.created_at,
        COALESCE(i.marca::text, 'dorata') AS brand,
        CASE
            WHEN NULLIF(trim(i.codigo_instalacao), '') IS NOT NULL THEN trim(i.codigo_instalacao)
            WHEN i.id IS NOT NULL THEN 'indicacao:' || i.id::text
            ELSE 'indicacao:' || p.id::text
        END AS installation_key
    FROM public.proposals p
    LEFT JOIN public.indicacoes i
        ON i.id = p.client_id
    WHERE p.status = 'accepted'
      AND COALESCE(i.marca::text, 'dorata') = 'dorata'
),
ranked_proposals AS (
    SELECT
        bp.*,
        ROW_NUMBER() OVER (
            PARTITION BY bp.brand, bp.installation_key
            ORDER BY bp.created_at DESC, bp.proposal_id DESC
        ) AS rn
    FROM base_proposals bp
)
INSERT INTO public.obra_card_proposals (obra_id, proposal_id, is_primary)
SELECT
    c.id,
    rp.proposal_id,
    (rp.rn = 1) AS is_primary
FROM ranked_proposals rp
JOIN public.obra_cards c
  ON c.brand = rp.brand
 AND c.installation_key = rp.installation_key
ON CONFLICT (obra_id, proposal_id)
DO UPDATE
SET
    is_primary = EXCLUDED.is_primary,
    linked_at = now();

WITH project_template AS (
    SELECT *
    FROM (
        VALUES
            (1, 'Validar dados técnicos do orçamento'),
            (2, 'Validar documentação técnica'),
            (3, 'Registrar parecer Energisa'),
            (4, 'Revisar projeto')
    ) AS t(sort_order, title)
)
INSERT INTO public.obra_process_items (obra_id, phase, title, sort_order, status)
SELECT
    c.id,
    'PROJETO',
    t.title,
    t.sort_order,
    'TODO'
FROM public.obra_cards c
CROSS JOIN project_template t
WHERE c.brand = 'dorata'
  AND NOT EXISTS (
      SELECT 1
      FROM public.obra_process_items p
      WHERE p.obra_id = c.id
        AND p.phase = 'PROJETO'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
