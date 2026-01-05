-- Migration 021: Financial Module
-- Description: Creates tables for tracking commissions, bonuses, and expenses.

BEGIN;

-- 1. Create Enums
CREATE TYPE public.transaction_type AS ENUM (
    'comissao_venda',      -- Standard commission
    'bonus_recrutamento',  -- Fixed R$ 500
    'override_gestao',     -- 5% Manager Override
    'comissao_dorata',     -- 0.5% Dorata Support
    'adiantamento',        -- Debit (Advice)
    'despesa'              -- Expense (Debit)
);

CREATE TYPE public.transaction_status AS ENUM (
    'pendente', -- Future / Scheduled
    'liberado', -- Ready for payment (e.g. 70% connection)
    'pago',     -- Settled
    'cancelado'
);

-- 2. Create Transactions Table
CREATE TABLE IF NOT EXISTS public.financeiro_transacoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    
    -- Who receives/pays
    beneficiary_user_id uuid REFERENCES public.users(id) NOT NULL,
    
    -- Link to Source (Optional)
    origin_lead_id uuid REFERENCES public.indicacoes(id),
    
    -- Financial Details
    type public.transaction_type NOT NULL,
    amount numeric(10, 2) NOT NULL, -- Positive = Credit, Negative = Debit usually, but we can stick to Positive + Type logic. Let's use Signed Amount for easier SUM.
    -- Better: Amount is always positive magnitude. Type defines credit/debit logic in app? 
    -- User requested "Net Final = Credits - Debits". 
    -- Let's make 'adiantamento' and 'despesa' negative explicitly? 
    -- Or just boolean is_debit? 
    -- Let's stick to: Amount is magnitude. We handle sign in query/view based on TYPE.
    
    description text,
    status public.transaction_status DEFAULT 'pendente',
    due_date date, -- Previsão de pagamento
    
    -- Audit
    created_by uuid REFERENCES public.users(id) DEFAULT auth.uid()
);

-- 3. RLS
ALTER TABLE public.financeiro_transacoes ENABLE ROW LEVEL SECURITY;

-- Admins see all
CREATE POLICY "Admins manage all finances" ON public.financeiro_transacoes
USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata'))
);

-- Users see their own
CREATE POLICY "Users view own finances" ON public.financeiro_transacoes
FOR SELECT
USING (
    auth.uid() = beneficiary_user_id
);

COMMIT;
