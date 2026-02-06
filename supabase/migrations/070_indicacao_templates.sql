BEGIN;

-- 1) Templates for bulk Rental indications (PJ)
CREATE TABLE IF NOT EXISTS public.indicacao_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vendedor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  marca brand_enum NOT NULL DEFAULT 'rental',
  tipo TEXT NOT NULL DEFAULT 'PJ',
  base_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.indicacao_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.indicacao_templates(id) ON DELETE CASCADE,
  codigo_cliente TEXT,
  codigo_instalacao TEXT NOT NULL,
  unidade_consumidora TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CREATED', 'ERROR')),
  indicacao_id UUID REFERENCES public.indicacoes(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_indicacao_templates_user
  ON public.indicacao_templates(user_id);

CREATE INDEX IF NOT EXISTS idx_indicacao_template_items_template
  ON public.indicacao_template_items(template_id, status);

-- Avoid duplicated installation code inside template items
CREATE UNIQUE INDEX IF NOT EXISTS idx_indicacao_template_items_codigo_instalacao
  ON public.indicacao_template_items(codigo_instalacao);

-- 3) RLS
ALTER TABLE public.indicacao_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicacao_template_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.indicacao_templates TO authenticated;
GRANT ALL ON public.indicacao_template_items TO authenticated;

-- Templates: owner access
DROP POLICY IF EXISTS "Templates own access" ON public.indicacao_templates;
CREATE POLICY "Templates own access"
ON public.indicacao_templates
FOR ALL
USING (
  user_id = auth.uid()
  OR auth.uid() IN (
    SELECT id FROM public.users
    WHERE role IN (
      'adm_mestre',
      'adm_dorata',
      'suporte_tecnico',
      'suporte_limitado',
      'supervisor',
      'funcionario_n1',
      'funcionario_n2'
    )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR auth.uid() IN (
    SELECT id FROM public.users
    WHERE role IN (
      'adm_mestre',
      'adm_dorata',
      'suporte_tecnico',
      'suporte_limitado',
      'supervisor',
      'funcionario_n1',
      'funcionario_n2'
    )
  )
);

-- Template items: access via template ownership
DROP POLICY IF EXISTS "Template items own access" ON public.indicacao_template_items;
CREATE POLICY "Template items own access"
ON public.indicacao_template_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.indicacao_templates t
    WHERE t.id = indicacao_template_items.template_id
      AND t.user_id = auth.uid()
  )
  OR auth.uid() IN (
    SELECT id FROM public.users
    WHERE role IN (
      'adm_mestre',
      'adm_dorata',
      'suporte_tecnico',
      'suporte_limitado',
      'supervisor',
      'funcionario_n1',
      'funcionario_n2'
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.indicacao_templates t
    WHERE t.id = indicacao_template_items.template_id
      AND t.user_id = auth.uid()
  )
  OR auth.uid() IN (
    SELECT id FROM public.users
    WHERE role IN (
      'adm_mestre',
      'adm_dorata',
      'suporte_tecnico',
      'suporte_limitado',
      'supervisor',
      'funcionario_n1',
      'funcionario_n2'
    )
  )
);

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS update_indicacao_templates_modtime ON public.indicacao_templates;
CREATE TRIGGER update_indicacao_templates_modtime
  BEFORE UPDATE ON public.indicacao_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_indicacao_template_items_modtime ON public.indicacao_template_items;
CREATE TRIGGER update_indicacao_template_items_modtime
  BEFORE UPDATE ON public.indicacao_template_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
