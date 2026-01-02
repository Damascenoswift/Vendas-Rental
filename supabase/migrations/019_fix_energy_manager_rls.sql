-- Migration 019: Fix Energy Manager RLS Policies
-- Description: Enables RLS and sets up permissive policies for Admins/Support on Energy tables.
-- Original sequence was 018, but now shifted to 019 to accommodate table creation in 018.

BEGIN;

-- ==============================================================================
-- 1. USINAS
-- ==============================================================================
ALTER TABLE public.usinas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Admins have full access" ON public.usinas;
DROP POLICY IF EXISTS "Support has read access" ON public.usinas;
DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.usinas;
DROP POLICY IF EXISTS "Investidor vê suas usinas" ON public.usinas;

-- Create Comprehensive Policy for Admins and Support
CREATE POLICY "Admin/Support Full Access"
ON public.usinas
FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
);

-- Policy for Investors (Read-Only their own)
CREATE POLICY "Investidor Read Own"
ON public.usinas
FOR SELECT
USING ( investidor_user_id = auth.uid() );


-- ==============================================================================
-- 2. ALOCACOES CLIENTES
-- ==============================================================================
ALTER TABLE public.alocacoes_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access" ON public.alocacoes_clientes;
DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.alocacoes_clientes;

CREATE POLICY "Admin/Support Full Access"
ON public.alocacoes_clientes
FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
);


-- ==============================================================================
-- 3. HISTORICO PRODUCAO
-- ==============================================================================
ALTER TABLE public.historico_producao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.historico_producao;

CREATE POLICY "Admin/Support Full Access"
ON public.historico_producao
FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
);


-- ==============================================================================
-- 4. FATURAS CONCILIACAO
-- ==============================================================================
ALTER TABLE public.faturas_conciliacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Support Full Access" ON public.faturas_conciliacao;

CREATE POLICY "Admin/Support Full Access"
ON public.faturas_conciliacao
FOR ALL
USING (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.users 
    WHERE role IN ('adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'supervisor')
  )
);

-- ==============================================================================
-- 5. GRANTS (Permissões básicas de SQL)
-- ==============================================================================
GRANT ALL ON TABLE public.usinas TO authenticated;
GRANT ALL ON TABLE public.alocacoes_clientes TO authenticated;
GRANT ALL ON TABLE public.historico_producao TO authenticated;
GRANT ALL ON TABLE public.faturas_conciliacao TO authenticated;

COMMIT;
