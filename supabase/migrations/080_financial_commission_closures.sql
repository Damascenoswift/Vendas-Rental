BEGIN;

CREATE OR REPLACE FUNCTION public.has_financial_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.department = 'financeiro'
        OR u.role IN ('adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_financial_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_financial_access() TO service_role;

CREATE TABLE IF NOT EXISTS public.financeiro_fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  competencia date NOT NULL,
  status text NOT NULL DEFAULT 'fechado' CHECK (status IN ('aberto', 'fechado', 'cancelado')),
  total_itens int NOT NULL DEFAULT 0 CHECK (total_itens >= 0),
  total_valor numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_valor >= 0),
  fechado_em timestamptz,
  fechado_por uuid REFERENCES public.users(id),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro_fechamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.financeiro_fechamentos(id) ON DELETE CASCADE,
  brand text NOT NULL CHECK (brand IN ('rental', 'dorata')),
  beneficiary_user_id uuid NOT NULL REFERENCES public.users(id),
  transaction_type text NOT NULL CHECK (
    transaction_type IN (
      'comissao_venda',
      'bonus_recrutamento',
      'override_gestao',
      'comissao_dorata',
      'adiantamento',
      'despesa'
    )
  ),
  source_kind text NOT NULL CHECK (source_kind IN ('rental_sistema', 'dorata_sistema', 'manual_elyakim')),
  source_ref_id text NOT NULL,
  origin_lead_id uuid NULL REFERENCES public.indicacoes(id) ON DELETE SET NULL,
  descricao text,
  valor_liberado numeric(12, 2) NOT NULL CHECK (valor_liberado >= 0),
  valor_pago numeric(12, 2) NOT NULL CHECK (valor_pago > 0),
  pagamento_em date NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_fechamento_itens_unique_per_closure
    UNIQUE (fechamento_id, source_kind, source_ref_id, beneficiary_user_id, transaction_type)
);

CREATE TABLE IF NOT EXISTS public.financeiro_relatorios_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL DEFAULT 'elyakim',
  competencia date NOT NULL,
  status text NOT NULL DEFAULT 'liberado' CHECK (status IN ('rascunho', 'liberado', 'fechado', 'cancelado')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  observacao text
);

CREATE TABLE IF NOT EXISTS public.financeiro_relatorios_manuais_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.financeiro_relatorios_manuais(id) ON DELETE CASCADE,
  beneficiary_user_id uuid NOT NULL REFERENCES public.users(id),
  brand text NOT NULL DEFAULT 'rental' CHECK (brand IN ('rental', 'dorata')),
  transaction_type text NOT NULL DEFAULT 'comissao_venda' CHECK (
    transaction_type IN (
      'comissao_venda',
      'bonus_recrutamento',
      'override_gestao',
      'comissao_dorata',
      'adiantamento',
      'despesa'
    )
  ),
  client_name text,
  origin_lead_id uuid NULL REFERENCES public.indicacoes(id) ON DELETE SET NULL,
  valor numeric(12, 2) NOT NULL CHECK (valor > 0),
  status text NOT NULL DEFAULT 'liberado' CHECK (status IN ('liberado', 'pago', 'cancelado')),
  external_ref text,
  observacao text,
  fechamento_item_id uuid NULL REFERENCES public.financeiro_fechamento_itens(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financeiro_fechamentos_competencia
  ON public.financeiro_fechamentos (competencia DESC);

CREATE INDEX IF NOT EXISTS idx_financeiro_fechamentos_fechado_em
  ON public.financeiro_fechamentos (fechado_em DESC);

CREATE INDEX IF NOT EXISTS idx_financeiro_fechamento_itens_fechamento
  ON public.financeiro_fechamento_itens (fechamento_id);

CREATE INDEX IF NOT EXISTS idx_financeiro_fechamento_itens_origin
  ON public.financeiro_fechamento_itens (origin_lead_id, beneficiary_user_id, transaction_type);

CREATE INDEX IF NOT EXISTS idx_financeiro_relatorios_manuais_competencia
  ON public.financeiro_relatorios_manuais (competencia DESC);

CREATE INDEX IF NOT EXISTS idx_financeiro_relatorios_manuais_itens_status
  ON public.financeiro_relatorios_manuais_itens (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financeiro_relatorios_manuais_itens_beneficiary
  ON public.financeiro_relatorios_manuais_itens (beneficiary_user_id, status);

ALTER TABLE public.financeiro_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_relatorios_manuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_relatorios_manuais_itens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_fechamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_fechamento_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_relatorios_manuais TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_relatorios_manuais_itens TO authenticated;

DROP POLICY IF EXISTS "Financeiro manage fechamentos" ON public.financeiro_fechamentos;
CREATE POLICY "Financeiro manage fechamentos"
ON public.financeiro_fechamentos
FOR ALL
TO authenticated
USING (public.has_financial_access())
WITH CHECK (public.has_financial_access());

DROP POLICY IF EXISTS "Financeiro manage fechamento itens" ON public.financeiro_fechamento_itens;
CREATE POLICY "Financeiro manage fechamento itens"
ON public.financeiro_fechamento_itens
FOR ALL
TO authenticated
USING (public.has_financial_access())
WITH CHECK (public.has_financial_access());

DROP POLICY IF EXISTS "Financeiro manage relatorios manuais" ON public.financeiro_relatorios_manuais;
CREATE POLICY "Financeiro manage relatorios manuais"
ON public.financeiro_relatorios_manuais
FOR ALL
TO authenticated
USING (public.has_financial_access())
WITH CHECK (public.has_financial_access());

DROP POLICY IF EXISTS "Financeiro manage relatorios manuais itens" ON public.financeiro_relatorios_manuais_itens;
CREATE POLICY "Financeiro manage relatorios manuais itens"
ON public.financeiro_relatorios_manuais_itens
FOR ALL
TO authenticated
USING (public.has_financial_access())
WITH CHECK (public.has_financial_access());

COMMIT;
