BEGIN;

-- 1) Timeline fields for contract milestones visible to the seller
ALTER TABLE public.indicacoes
ADD COLUMN IF NOT EXISTS contrato_enviado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assinada_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS compensada_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS doc_validation_status TEXT DEFAULT 'PENDING'
  CHECK (doc_validation_status IN ('PENDING', 'APPROVED', 'REJECTED', 'INCOMPLETE'));

CREATE INDEX IF NOT EXISTS idx_indicacoes_contrato_enviado_em
ON public.indicacoes (contrato_enviado_em DESC);

-- 2) Keep status constraint aligned with statuses used in the UI/CRM flow
ALTER TABLE public.indicacoes
ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.indicacoes
ALTER COLUMN status TYPE TEXT USING status::text;

ALTER TABLE public.indicacoes
DROP CONSTRAINT IF EXISTS indicacoes_status_check;

UPDATE public.indicacoes
SET status = 'EM_ANALISE'
WHERE status IS NULL
   OR status NOT IN (
    'EM_ANALISE',
    'AGUARDANDO_ASSINATURA',
    'FALTANDO_DOCUMENTACAO',
    'ENERGISA_ANALISE',
    'ENERGISA_APROVADO',
    'INSTALACAO_AGENDADA',
    'APROVADA',
    'CONCLUIDA',
    'REJEITADA'
   );

ALTER TABLE public.indicacoes
ADD CONSTRAINT indicacoes_status_check
CHECK (
  status IN (
    'EM_ANALISE',
    'AGUARDANDO_ASSINATURA',
    'FALTANDO_DOCUMENTACAO',
    'ENERGISA_ANALISE',
    'ENERGISA_APROVADO',
    'INSTALACAO_AGENDADA',
    'APROVADA',
    'CONCLUIDA',
    'REJEITADA'
  )
);

ALTER TABLE public.indicacoes
ALTER COLUMN status SET DEFAULT 'EM_ANALISE';

-- 3) Backfill milestone dates for existing leads
UPDATE public.indicacoes
SET contrato_enviado_em = COALESCE(contrato_enviado_em, updated_at, created_at)
WHERE status = 'AGUARDANDO_ASSINATURA'
  AND contrato_enviado_em IS NULL;

UPDATE public.indicacoes
SET assinada_em = COALESCE(assinada_em, updated_at, created_at)
WHERE status = 'CONCLUIDA'
  AND assinada_em IS NULL;

UPDATE public.indicacoes
SET contrato_enviado_em = COALESCE(contrato_enviado_em, assinada_em, updated_at, created_at)
WHERE status = 'CONCLUIDA'
  AND contrato_enviado_em IS NULL;

-- 4) Allow N1/N2 employees to register interactions (for seller transparency)
CREATE TABLE IF NOT EXISTS public.indicacao_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indicacao_id UUID NOT NULL REFERENCES public.indicacoes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('COMMENT', 'STATUS_CHANGE', 'DOC_REQUEST', 'DOC_APPROVAL')),
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.indicacao_interactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.indicacao_interactions TO authenticated;

DROP POLICY IF EXISTS "Users view interactions for own leads" ON public.indicacao_interactions;
DROP POLICY IF EXISTS "Admins/Support view all interactions" ON public.indicacao_interactions;
DROP POLICY IF EXISTS "Users insert interactions on own leads" ON public.indicacao_interactions;

CREATE POLICY "Users view interactions for own leads"
ON public.indicacao_interactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.indicacoes
    WHERE id = indicacao_interactions.indicacao_id
      AND user_id = auth.uid()
  )
  OR auth.uid() = user_id
);

CREATE POLICY "Admins/Support view all interactions"
ON public.indicacao_interactions
FOR SELECT
USING (
  auth.uid() IN (
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

CREATE POLICY "Users insert interactions on own leads"
ON public.indicacao_interactions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.indicacoes
    WHERE id = indicacao_id
      AND user_id = auth.uid()
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

-- 5) Allow N1/N2 employees to register Energisa actions
CREATE TABLE IF NOT EXISTS public.energisa_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  indicacao_id UUID NOT NULL REFERENCES public.indicacoes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.energisa_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.energisa_logs TO authenticated;

DROP POLICY IF EXISTS "Admins/Support Full Access Energisa" ON public.energisa_logs;
DROP POLICY IF EXISTS "Users Read Own Energisa Logs" ON public.energisa_logs;

CREATE POLICY "Admins/Support Full Access Energisa"
ON public.energisa_logs
FOR ALL
USING (
  auth.uid() IN (
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
  auth.uid() IN (
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

CREATE POLICY "Users Read Own Energisa Logs"
ON public.energisa_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.indicacoes
    WHERE id = energisa_logs.indicacao_id
      AND user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
