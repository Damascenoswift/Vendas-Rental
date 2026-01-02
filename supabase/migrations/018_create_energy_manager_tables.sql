-- Migration: Energy Manager System
-- Description: Adds tables for Plants, Allocations, Production, Invoices and updates User Roles.
-- NOTE: Transaction (BEGIN/COMMIT) removed to allow "ALTER TYPE" to take effect immediately for subsequent commands.

-- 1. Update User Roles
ALTER TYPE public.user_role_enum ADD VALUE IF NOT EXISTS 'suporte_tecnico';
ALTER TYPE public.user_role_enum ADD VALUE IF NOT EXISTS 'suporte_limitado';
ALTER TYPE public.user_role_enum ADD VALUE IF NOT EXISTS 'investidor';

-- 2. Create USINAS (Solar Plants)
CREATE TABLE IF NOT EXISTS public.usinas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    nome text NOT NULL,
    capacidade_total numeric NOT NULL DEFAULT 0, -- em kWh/mês estimado ou kWp
    tipo text CHECK (tipo IN ('rental', 'parceiro')) DEFAULT 'rental',
    investidor_user_id uuid REFERENCES public.users(id), -- Dono da usina (se parceiro)
    modelo_negocio text, -- Ex: 'autoconsumo', 'geracao_compartilhada'
    status text DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'MANUTENCAO', 'INATIVA'))
);

-- 3. Create ALOCACOES_CLIENTES (Link Lead/Client -> Usina)
CREATE TABLE IF NOT EXISTS public.alocacoes_clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    usina_id uuid REFERENCES public.usinas(id) NOT NULL,
    cliente_id uuid REFERENCES public.indicacoes(id) NOT NULL, -- O Lead que virou cliente
    percentual_alocado numeric,
    quantidade_kwh_alocado numeric,
    data_inicio date NOT NULL DEFAULT CURRENT_DATE,
    data_fim date,
    status text DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO'))
);

-- 4. Create HISTORICO_PRODUCAO (Production History of Plants)
CREATE TABLE IF NOT EXISTS public.historico_producao (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    usina_id uuid REFERENCES public.usinas(id) NOT NULL,
    mes_ano date NOT NULL, -- Salvar sempre o dia 1 do mês de referência
    kwh_gerado numeric NOT NULL DEFAULT 0,
    UNIQUE(usina_id, mes_ano) -- Evitar duplicidade de lançamento pro mesmo mês
);

-- 5. Create FATURAS_CONCILIACAO (Financial/Energy Reconciliation)
CREATE TABLE IF NOT EXISTS public.faturas_conciliacao (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    usina_id uuid REFERENCES public.usinas(id) NOT NULL,
    cliente_id uuid REFERENCES public.indicacoes(id) NOT NULL,
    mes_ano date NOT NULL,
    valor_fatura numeric DEFAULT 0,
    kwh_compensado numeric DEFAULT 0,
    status_pagamento text DEFAULT 'ABERTO' CHECK (status_pagamento IN ('ABERTO', 'PAGO', 'ATRASADO', 'CANCELADO')),
    observacoes text
);

-- 6. Enable RLS
ALTER TABLE public.usinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alocacoes_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas_conciliacao ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- === USINAS ===
-- Admins e Suporte Full veem tudo e editam tudo
CREATE POLICY "Admins/Support Full manage usinas" ON public.usinas
USING (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico'))
);

-- Suporte Limitado vê tudo (mas app restringe ações)
CREATE POLICY "Support Limited view usinas" ON public.usinas
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'suporte_limitado')
);

-- Investidor vê apenas SUAS usinas
CREATE POLICY "Investor view own usinas" ON public.usinas
FOR SELECT
USING (
  investidor_user_id = auth.uid()
);

-- === ALOCACOES ===
-- Admins/Support Full gerenciam
CREATE POLICY "Admins/Support Full manage alocacoes" ON public.alocacoes_clientes
USING (
   EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico'))
);

-- Support Limited apenas VÊ (pode ser ajustado se eles precisarem alocar)
CREATE POLICY "Support Limited view alocacoes" ON public.alocacoes_clientes
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'suporte_limitado')
);

-- Investidor vê alocações das SUAS usinas
CREATE POLICY "Investor view own allocations" ON public.alocacoes_clientes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.usinas 
    WHERE usinas.id = alocacoes_clientes.usina_id 
    AND usinas.investidor_user_id = auth.uid()
  )
);

-- === PRODUCAO ===
-- Admins/Support Full gerenciam
CREATE POLICY "Admins/Support Full manage producao" ON public.historico_producao
USING (
   EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico'))
);

-- Support Limited e Investidor VEEM produção
CREATE POLICY "Support Limited/Investor view producao" ON public.historico_producao
FOR SELECT
USING (
  -- Suporte vê tudo
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'suporte_limitado')
  OR
  -- Investidor vê da sua usina
  EXISTS (
    SELECT 1 FROM public.usinas 
    WHERE usinas.id = historico_producao.usina_id 
    AND usinas.investidor_user_id = auth.uid()
  )
);

-- === FATURAS ===
-- Admins/Support Full gerenciam
CREATE POLICY "Admins/Support Full manage faturas" ON public.faturas_conciliacao
USING (
   EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico'))
);

-- Support Limited pode VER e EDITAR STATUS (vamos permitir update para limitado lançar pagamentos?)
-- Assumindo que limitado AJUDA no operacional, vou permitir SELECT e UPDATE
CREATE POLICY "Support Limited manage faturas" ON public.faturas_conciliacao
USING (
  EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'suporte_limitado')
);

-- Investidor apenas VÊ suas faturas
CREATE POLICY "Investor view own faturas" ON public.faturas_conciliacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.usinas 
    WHERE usinas.id = faturas_conciliacao.usina_id 
    AND usinas.investidor_user_id = auth.uid()
  )
);
