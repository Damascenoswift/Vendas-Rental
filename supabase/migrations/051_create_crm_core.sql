-- Migration 051: Create CRM core tables (pipelines, stages, cards, history)
-- Description: Adds configurable CRM structure without changing existing flows.

BEGIN;

-- 1) Pipelines (funnels)
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT NOT NULL CHECK (brand IN ('rental', 'dorata')),
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Stages (columns)
CREATE TABLE IF NOT EXISTS public.crm_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Cards (opportunities)
CREATE TABLE IF NOT EXISTS public.crm_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
    stage_id UUID NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
    indicacao_id UUID NOT NULL REFERENCES public.indicacoes(id) ON DELETE CASCADE,
    title TEXT,
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Stage History (for SLA metrics)
CREATE TABLE IF NOT EXISTS public.crm_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.crm_cards(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES public.crm_stages(id) ON DELETE SET NULL,
    to_stage_id UUID NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_brand ON public.crm_pipelines(brand);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON public.crm_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_cards_pipeline ON public.crm_cards(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_cards_stage ON public.crm_cards(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_cards_indicacao ON public.crm_cards(indicacao_id);
CREATE INDEX IF NOT EXISTS idx_crm_cards_assignee ON public.crm_cards(assignee_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_card ON public.crm_stage_history(card_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_changed_at ON public.crm_stage_history(changed_at DESC);

-- 6) updated_at triggers
DROP TRIGGER IF EXISTS update_crm_pipelines_modtime ON public.crm_pipelines;
CREATE TRIGGER update_crm_pipelines_modtime
    BEFORE UPDATE ON public.crm_pipelines
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_stages_modtime ON public.crm_stages;
CREATE TRIGGER update_crm_stages_modtime
    BEFORE UPDATE ON public.crm_stages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_cards_modtime ON public.crm_cards;
CREATE TRIGGER update_crm_cards_modtime
    BEFORE UPDATE ON public.crm_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 7) RLS
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stage_history ENABLE ROW LEVEL SECURITY;

-- CRM staff roles (internal only)
-- Note: vendors are intentionally excluded.

DROP POLICY IF EXISTS "CRM staff full access pipelines" ON public.crm_pipelines;
CREATE POLICY "CRM staff full access pipelines"
ON public.crm_pipelines
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

DROP POLICY IF EXISTS "CRM staff full access stages" ON public.crm_stages;
CREATE POLICY "CRM staff full access stages"
ON public.crm_stages
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

DROP POLICY IF EXISTS "CRM staff full access cards" ON public.crm_cards;
CREATE POLICY "CRM staff full access cards"
ON public.crm_cards
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

DROP POLICY IF EXISTS "CRM staff full access stage history" ON public.crm_stage_history;
CREATE POLICY "CRM staff full access stage history"
ON public.crm_stage_history
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

-- 8) Grants
GRANT ALL ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_cards TO authenticated;
GRANT ALL ON public.crm_stage_history TO authenticated;

COMMIT;
