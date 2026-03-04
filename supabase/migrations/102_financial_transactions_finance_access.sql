BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.transaction_type AS ENUM (
      'comissao_venda',
      'bonus_recrutamento',
      'override_gestao',
      'comissao_dorata',
      'adiantamento',
      'despesa'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.transaction_status AS ENUM (
      'pendente',
      'liberado',
      'pago',
      'cancelado'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.financeiro_transacoes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  beneficiary_user_id uuid REFERENCES public.users(id) NOT NULL,
  origin_lead_id uuid REFERENCES public.indicacoes(id),
  type public.transaction_type NOT NULL,
  amount numeric(10, 2) NOT NULL,
  description text,
  status public.transaction_status DEFAULT 'pendente',
  due_date date,
  created_by uuid REFERENCES public.users(id) DEFAULT auth.uid()
);

ALTER TABLE public.financeiro_transacoes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_transacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.financeiro_transacoes TO service_role;

DROP POLICY IF EXISTS "Admins manage all finances" ON public.financeiro_transacoes;
DROP POLICY IF EXISTS "Financeiro manage all finances" ON public.financeiro_transacoes;
CREATE POLICY "Financeiro manage all finances"
ON public.financeiro_transacoes
FOR ALL
TO authenticated
USING (public.has_financial_access())
WITH CHECK (public.has_financial_access());

DROP POLICY IF EXISTS "Users view own finances" ON public.financeiro_transacoes;
CREATE POLICY "Users view own finances"
ON public.financeiro_transacoes
FOR SELECT
TO authenticated
USING (
  auth.uid() = beneficiary_user_id
  OR public.has_financial_access()
);

COMMIT;
